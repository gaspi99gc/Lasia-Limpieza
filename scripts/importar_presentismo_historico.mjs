// Importa el libro mayor de presentismo de operarios (hoja "PRESENTISMO " de
// PRESENTISMO 2026.xlsx, una fila por operario-dia desde dic-2023) a la tabla
// presentismo_historico. Se corre UNA sola vez; si la tabla ya tiene datos,
// aborta salvo que se pase --force (que borra y recarga).
//
// USO: node scripts/importar_presentismo_historico.mjs [archivo.xlsx] [--dry] [--force] [--desde YYYY-MM-DD] [--hasta YYYY-MM-DD]
//   --dry   -> muestra qué se importaría SIN escribir.
//   --force -> vacía la tabla y recarga desde cero.
//   --desde / --hasta -> rango a importar. Por defecto SOLO el mes pasado
//     (decisión del usuario 2026-08-31: nada de cargar los 3 años del libro).

import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { config } from 'dotenv';
import { buildEmployeeMatcher, buildServiceMatcher, normText } from '../src/lib/operativo-import.js';

config({ path: '.env.local', quiet: true });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const force = args.includes('--force');

function argValor(flag) {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
}

// Por defecto: solo el mes pasado (del 1 al ultimo dia).
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const [hy, hm] = hoy.split('-').map(Number);
const mesPasado = hm === 1 ? `${hy - 1}-12` : `${hy}-${String(hm - 1).padStart(2, '0')}`;
const desde = argValor('--desde') || `${mesPasado}-01`;
const hasta = argValor('--hasta') || `${mesPasado}-31`;

const valores = [argValor('--desde'), argValor('--hasta')].filter(Boolean);
const archivo = args.find(a => !a.startsWith('--') && !valores.includes(a)) || 'PRESENTISMO 2026.xlsx';

if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) {
    console.error(`Rango inválido: --desde ${desde} --hasta ${hasta}`);
    process.exit(1);
}
console.log(`Rango a importar: ${desde} al ${hasta}`);

function fechaDesdeValor(v) {
    if (typeof v === 'number' && v > 20000) {
        const d = new Date(Math.round((v - 25569) * 86400 * 1000));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
    if (v instanceof Date) {
        return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
    }
    // Formato US m/d/yy que usa la hoja.
    const m = String(v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
        const yy = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
        return `${yy}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
    }
    return null;
}

const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return isNaN(n) ? null : n;
};

async function fetchAll(buildQuery, pageSize = 1000) {
    const all = [];
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await buildQuery().range(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        all.push(...(data || []));
        if (!data || data.length < pageSize) break;
    }
    return all;
}

async function main() {
    if (!force && !dry) {
        const { count, error } = await supabase
            .from('presentismo_historico')
            .select('id', { count: 'exact', head: true });
        if (error) { console.error('No se pudo consultar la tabla:', error.message); process.exit(1); }
        if (count > 0) {
            console.error(`La tabla presentismo_historico ya tiene ${count} filas. Usá --force para borrar y recargar.`);
            process.exit(1);
        }
    }

    console.log(`Leyendo ${archivo} (puede tardar, son ~30 MB)...`);
    const wb = XLSX.readFile(archivo, { cellStyles: false });
    const sheetName = wb.SheetNames.find(n => normText(n) === 'PRESENTISMO');
    if (!sheetName) { console.error(`No hay hoja PRESENTISMO. Hojas: ${wb.SheetNames.join(', ')}`); process.exit(1); }
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null, raw: true });
    console.log(`Filas en la hoja: ${rows.length}`);

    console.log('Cargando empleados y servicios para el match...');
    const employees = await fetchAll(() => supabase.from('employees').select('id, nombre, apellido, estado_empleado').order('id'));
    const services = await fetchAll(() => supabase.from('services').select('id, name').order('id'));
    const matchEmployee = buildEmployeeMatcher(employees);
    const matchService = buildServiceMatcher(services);

    // Cache: los mismos textos se repiten miles de veces.
    const cacheEmp = new Map();
    const cacheSvc = new Map();
    const emp = (nombre) => {
        const k = normText(nombre);
        if (!k) return null;
        if (!cacheEmp.has(k)) cacheEmp.set(k, matchEmployee(nombre)?.id ?? null);
        return cacheEmp.get(k);
    };
    const svc = (nombre) => {
        const k = normText(nombre);
        if (!k) return null;
        if (!cacheSvc.has(k)) cacheSvc.set(k, matchService(nombre)?.id ?? null);
        return cacheSvc.get(k);
    };

    const registros = [];
    let sinFecha = 0, sinOperario = 0;
    for (let i = 1; i < rows.length; i++) {
        const [fechaRaw, servicio, direccion, operario, hi, he, totalHs] = rows[i] || [];
        const fecha = fechaDesdeValor(fechaRaw);
        if (!fecha) { if (rows[i]?.some(c => c !== null && c !== '')) sinFecha++; continue; }
        if (fecha < desde || fecha > hasta) continue;
        const op = String(operario || '').trim();
        if (!op) { sinOperario++; continue; }
        registros.push({
            fecha,
            servicio_excel: String(servicio || '').trim() || null,
            direccion_excel: String(direccion || '').trim() || null,
            service_id: svc(servicio),
            operario_excel: op,
            employee_id: emp(op),
            hi: num(hi),
            he: num(he),
            total_hs: num(totalHs),
        });
    }

    if (!registros.length) {
        console.log(`No hay registros del libro dentro del rango ${desde} al ${hasta}. No se escribió nada.`);
        return;
    }
    const conMatch = registros.filter(r => r.employee_id).length;
    const fechas = registros.map(r => r.fecha).sort();
    console.log(`\nRegistros válidos: ${registros.length} (${fechas[0]} al ${fechas[fechas.length - 1]})`);
    console.log(`Con match de empleado: ${conMatch} (${(conMatch / registros.length * 100).toFixed(1)}%)`);
    console.log(`Con match de servicio: ${registros.filter(r => r.service_id).length}`);
    console.log(`Descartadas: ${sinFecha} sin fecha válida, ${sinOperario} sin operario`);

    if (dry) {
        console.log('\n--dry: no se escribió nada. Muestra de 5 registros:');
        for (const r of registros.slice(0, 5)) console.log(' ', JSON.stringify(r));
        return;
    }

    if (force) {
        console.log('\n--force: vaciando presentismo_historico...');
        const { error } = await supabase.from('presentismo_historico').delete().gte('id', 0);
        if (error) { console.error('No se pudo vaciar:', error.message); process.exit(1); }
    }

    console.log('\nInsertando en lotes de 1000...');
    for (let i = 0; i < registros.length; i += 1000) {
        const { error } = await supabase.from('presentismo_historico').insert(registros.slice(i, i + 1000));
        if (error) {
            console.error(`Error en el lote ${i}-${i + 1000}:`, error.message);
            console.error('La carga quedó incompleta: corregir y correr de nuevo con --force.');
            process.exit(1);
        }
        if ((i / 1000) % 20 === 0) console.log(`  ${i + 1000 > registros.length ? registros.length : i + 1000}/${registros.length}`);
    }
    console.log(`\nListo: ${registros.length} filas importadas a presentismo_historico.`);
}

main();
