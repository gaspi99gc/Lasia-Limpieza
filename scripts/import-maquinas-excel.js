import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { config } from 'dotenv';
import { homedir } from 'os';
import { join } from 'path';

config({ path: '.env.local' });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

const DEFAULT_PATH = join(homedir(), 'Downloads', 'MAQUINAS X SERVICIOS.xlsx');
const FILE_PATH = process.argv[2] || DEFAULT_PATH;

// Tipos de máquina del Excel (columnas hoja 1)
const MACHINE_TYPES = ['ASPIRADORA', 'HOMBRE A BORDO', 'HIDROLAVADORA', 'SOPLADORA', 'ROTATIVA', 'S17', 'INYECTORA', 'LUSTRADORA'];

// Aliases para nombres de servicio que aparecen distintos en "MAQUINAS ROTAS" vs DB
// Clave: nombre normalizado (uppercase, sin acentos) tal como aparece en la hoja rotas
// Valor: nombre normalizado del servicio en la DB
const SERVICE_ALIASES = {
    'BLAS PARERA': 'WEWORK BLAS PARERA',
    'CORRIENTES': 'WEWORK CORRIENTES',
    'AXA': 'AXA',
    'CONS. FITZ ROY': 'CONS. PROPIETARIOS FITZ ROY 1965',
    'BE PLAZA': 'CONS. PROPIETARIOS SANTA FE 5381 (BE PLAZA)',
};

// Aliases para matchear nombres de máquina en la hoja "MAQUINAS ROTAS"
const MACHINE_ALIASES = {
    'HIDRO KARCHER': ['HIDROLAVADORA'],
    'HIDROLAVADORA': ['HIDROLAVADORA'],
    'ASPIRADORA': ['ASPIRADORA'],
    'SOPLADORA': ['SOPLADORA'],
    'ROTATIVA': ['ROTATIVA'],
    'S17': ['S17'],
    'INYECTORA': ['INYECTORA'],
    'LUSTRADORA': ['LUSTRADORA'],
    'HOMBRE A BORDO': ['HOMBRE A BORDO'],
    'ROTATIVA/S17': ['ROTATIVA', 'S17'],
};

function normalize(s) {
    return (s || '')
        .toString()
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ');
}

// Cuenta X consecutivas al principio de la celda (X→1, XX→2, XXX→3, "X (OK)"→1)
function parseQuantity(cellValue) {
    if (cellValue === null || cellValue === undefined) return 0;
    const s = cellValue.toString().trim().toUpperCase();
    if (!s) return 0;
    const match = s.match(/^X+/);
    if (!match) return 0;
    return match[0].length;
}

async function ensureMachineTypes() {
    const { data: existing, error } = await supabase.from('machines').select('id, nombre');
    if (error) throw error;

    const byNorm = new Map();
    for (const m of existing || []) byNorm.set(normalize(m.nombre), m);

    const result = new Map(); // normalized name -> {id, nombre}
    for (const t of MACHINE_TYPES) {
        const key = normalize(t);
        if (byNorm.has(key)) {
            result.set(key, byNorm.get(key));
        } else {
            // Crear con capitalización linda: "Aspiradora"
            const pretty = t.charAt(0) + t.slice(1).toLowerCase();
            const { data, error: insErr } = await supabase
                .from('machines')
                .insert({ nombre: pretty, activo: true })
                .select()
                .single();
            if (insErr) throw insErr;
            console.log(`  + Creada máquina: ${pretty}`);
            result.set(key, data);
        }
    }
    return result;
}

async function loadServicesByName() {
    const { data, error } = await supabase.from('services').select('id, name');
    if (error) throw error;
    const map = new Map();
    for (const s of data || []) map.set(normalize(s.name), s);
    return map;
}

async function importMatrix(wb, servicesByName, machinesByName) {
    const sheet = wb.Sheets['MAQUINAS POR SERVICIO'];
    if (!sheet) throw new Error('No se encontró la hoja MAQUINAS POR SERVICIO');
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

    let upserted = 0;
    const noMatch = [];

    for (const row of rows) {
        const servicioRaw = row['SERVICIO'];
        if (!servicioRaw) continue;
        const svc = servicesByName.get(normalize(servicioRaw));
        if (!svc) {
            noMatch.push(servicioRaw);
            continue;
        }

        for (const colName of MACHINE_TYPES) {
            // El Excel tiene "LUSTRADORA " con espacio al final — buscar con tolerancia
            const key = Object.keys(row).find(k => normalize(k) === normalize(colName));
            if (!key) continue;
            const qty = parseQuantity(row[key]);
            const machine = machinesByName.get(normalize(colName));
            if (!machine) continue;

            if (qty > 0) {
                const { error } = await supabase
                    .from('service_machines')
                    .upsert(
                        { service_id: svc.id, machine_id: machine.id, quantity: qty },
                        { onConflict: 'service_id,machine_id' }
                    );
                if (error) {
                    console.warn(`  ! Error upsert ${svc.name} × ${machine.nombre}:`, error.message);
                    continue;
                }
                upserted++;
            }
        }
    }

    return { upserted, noMatch };
}

async function importRotas(wb, servicesByName, machinesByName) {
    const sheet = wb.Sheets['MAQUINAS ROTAS'];
    if (!sheet) throw new Error('No se encontró la hoja MAQUINAS ROTAS');
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

    // Traer incidencias existentes para idempotencia
    const { data: existing, error: exErr } = await supabase
        .from('machine_incidents')
        .select('service_id, machine_id, descripcion, estado');
    if (exErr) throw exErr;
    const existingKey = new Set(
        (existing || []).map(i => `${i.service_id}|${i.machine_id}|${(i.descripcion || '').trim().toLowerCase()}`)
    );

    let created = 0;
    const noMatch = [];

    // Normalizar keys del row (los headers del Excel tienen espacios al final)
    const findKey = (row, target) => Object.keys(row).find(k => k.trim().toUpperCase() === target);

    for (const row of rows) {
        const kServ = findKey(row, 'SERVICIO');
        const kMaq = findKey(row, 'MAQUINA');
        const kObs1 = findKey(row, 'OBSERVACIONES');
        const kObs2 = Object.keys(row).find(k => k.trim().toUpperCase().match(/^OBSERVACIONES[\s._]*1$/));
        const servicioRaw = kServ ? row[kServ] : null;
        const maquinaRaw = kMaq ? row[kMaq] : null;
        if (!servicioRaw || !maquinaRaw) continue;

        const normServ = normalize(servicioRaw);
        const aliasName = SERVICE_ALIASES[normServ];
        const svc = servicesByName.get(aliasName ? normalize(aliasName) : normServ);
        if (!svc) {
            noMatch.push(`servicio: ${servicioRaw}`);
            continue;
        }

        const maquinaNorm = normalize(maquinaRaw);
        const targets = MACHINE_ALIASES[maquinaNorm] || [maquinaNorm];

        const obs1 = kObs1 ? row[kObs1] : null;
        const obs2 = kObs2 ? row[kObs2] : null;
        const descripcion = (obs1?.toString().trim()) || `Reportada como rota (${maquinaRaw})`;
        const notaInterna = obs2?.toString().trim() || null;

        for (const target of targets) {
            const machine = machinesByName.get(normalize(target));
            if (!machine) {
                noMatch.push(`máquina: ${maquinaRaw} (servicio ${servicioRaw})`);
                continue;
            }
            const k = `${svc.id}|${machine.id}|${descripcion.trim().toLowerCase()}`;
            if (existingKey.has(k)) {
                continue; // ya existe, skip
            }
            const { error } = await supabase
                .from('machine_incidents')
                .insert({
                    service_id: svc.id,
                    machine_id: machine.id,
                    descripcion,
                    nota_interna: notaInterna,
                    estado: 'abierta',
                });
            if (error) {
                console.warn(`  ! Error insertando incidencia ${svc.name} × ${machine.nombre}:`, error.message);
                continue;
            }
            existingKey.add(k);
            created++;
        }
    }

    return { created, noMatch };
}

async function main() {
    console.log(`Leyendo ${FILE_PATH}`);
    const wb = XLSX.readFile(FILE_PATH);

    console.log('\n1. Asegurando tipos de máquina...');
    const machinesByName = await ensureMachineTypes();

    console.log('\n2. Cargando servicios de la DB...');
    const servicesByName = await loadServicesByName();
    console.log(`   ${servicesByName.size} servicios en la DB.`);

    console.log('\n3. Importando matriz MAQUINAS POR SERVICIO...');
    const matrix = await importMatrix(wb, servicesByName, machinesByName);
    console.log(`   ${matrix.upserted} relaciones service_machines upserted.`);
    if (matrix.noMatch.length) {
        console.log(`   ${matrix.noMatch.length} servicios del Excel sin match en DB:`);
        for (const n of matrix.noMatch) console.log(`     - ${n}`);
    }

    console.log('\n4. Importando MAQUINAS ROTAS como incidencias...');
    const rotas = await importRotas(wb, servicesByName, machinesByName);
    console.log(`   ${rotas.created} incidencias creadas (skip si ya existían).`);
    if (rotas.noMatch.length) {
        console.log(`   ${rotas.noMatch.length} filas sin match:`);
        for (const n of rotas.noMatch) console.log(`     - ${n}`);
    }

    console.log('\nListo.');
}

main().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
});
