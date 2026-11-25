// Carga inicial de las nóminas de Documentación mensual desde un Excel.
//
// USO: node scripts/cargar_nominas_excel.mjs <archivo.xlsx>                      (solo muestra el cruce)
//      node scripts/cargar_nominas_excel.mjs <archivo.xlsx> --aplicar            (carga)
//      node scripts/cargar_nominas_excel.mjs <archivo.xlsx> --mapa "ZARA AVE=9"  (hoja -> documentación)
//
// Una hoja por documentación. Cada hoja va a la documentación vigente cuyo
// título es "FAO <nombre de la hoja>" (ZARA TOM -> FAO ZARA TOM), salvo que
// --mapa diga otra cosa. Si alguna hoja no encuentra la suya, no carga nada.
//
// Se cruza por la columna "DNI" contra el legajo. Algunas planillas traen el
// CUIL entero en esa columna: dniDeCelda saca el DNI del medio.
//
// Lo que se carga ya se mandó al cliente (es la nómina con la que se trabaja
// hoy), así que entra como enviado y NO queda pendiente. Además queda un envío
// 'inicial' en el registro oculto con la foto de quiénes se cargaron.
//
// Se puede correr dos veces: quien ya está en la nómina se saltea.
//
// OJO: .env.local apunta a PRODUCCIÓN.
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import fs from 'fs';
import { dniDeCelda, estaDeBaja, snapshotNomina } from '../src/lib/nomina-documentacion.js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const QUIEN = 'Carga inicial (Excel)';
const args = process.argv.slice(2);
const archivo = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--mapa');
const aplicar = args.includes('--aplicar');
const mapa = new Map();
args.forEach((a, i) => {
    if (a !== '--mapa') return;
    const [hoja, id] = String(args[i + 1] || '').split('=');
    if (!hoja || !Number(id)) { console.log(`--mapa mal escrito: "${args[i + 1]}" (va "HOJA=ID")`); process.exit(1); }
    mapa.set(hoja.trim().toUpperCase(), Number(id));
});
if (!archivo || !fs.existsSync(archivo)) {
    console.log('USO: node scripts/cargar_nominas_excel.mjs <archivo.xlsx> [--aplicar] [--mapa "HOJA=ID"]');
    process.exit(1);
}

async function todas(armar) {
    const filas = [];
    for (let desde = 0; ; desde += 1000) {
        const { data, error } = await armar().range(desde, desde + 999);
        if (error) throw error;
        filas.push(...data);
        if (data.length < 1000) return filas;
    }
}

// --- Documentaciones y legajo ---
const docs = await todas(() => sb.from('rrhh_vencimientos').select('id, titulo, fecha, anulado_at').is('anulado_at', null).order('id'));
const empleados = await todas(() => sb.from('employees').select('id, apellido, nombre, dni, estado_empleado, fecha_baja').order('id'));
const porDni = new Map();
for (const e of empleados) {
    const dni = dniDeCelda(e.dni);
    if (!dni) continue;
    if (!porDni.has(dni)) porDni.set(dni, []);
    porDni.get(dni).push(e);
}

// --- Cruce, hoja por hoja ---
const wb = XLSX.read(fs.readFileSync(archivo));
const planes = [];
let falta = false;
for (const hoja of wb.SheetNames) {
    const clave = hoja.trim().toUpperCase();
    const doc = mapa.has(clave)
        ? docs.find(d => d.id === mapa.get(clave))
        : docs.find(d => d.titulo.trim().toUpperCase() === `FAO ${clave}`);
    if (!doc) { falta = true; console.log(`✖ La hoja "${hoja}" no tiene documentación (buscaba "FAO ${hoja}"). Usá --mapa "${hoja}=<id>".`); continue; }

    const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: '', blankrows: false });
    const cabecera = (filas[0] || []).map(c => String(c).trim().toUpperCase());
    const colDni = cabecera.indexOf('DNI');
    if (colDni < 0) { falta = true; console.log(`✖ La hoja "${hoja}" no tiene una columna "DNI".`); continue; }
    // El nombre solo es para mostrar: en algunas hojas viene en una columna y
    // en otras en dos (APELLIDO y NOMBRE).
    const nombreDe = (f) => (cabecera[colDni + 2] === 'NOMBRE' ? `${f[colDni + 1]} ${f[colDni + 2]}` : String(f[colDni + 1])).trim();

    const vigentes = await todas(() => sb.from('rrhh_vencimientos_nomina').select('employee_id').eq('vencimiento_id', doc.id).is('quitado_at', null).order('id'));
    const yaEstan = new Set(vigentes.map(v => v.employee_id));

    const cargar = [];
    const descartes = [];
    const vistos = new Set();
    let filasConDatos = 0;
    for (const f of filas.slice(1)) {
        if (!f.some(c => String(c).trim())) continue;
        filasConDatos += 1;
        const crudo = f[colDni];
        const dni = dniDeCelda(crudo);
        const quien = nombreDe(f) || String(crudo);
        if (!dni) { descartes.push(`${quien}: DNI inválido (${crudo})`); continue; }
        const candidatos = porDni.get(dni) || [];
        if (!candidatos.length) { descartes.push(`${quien} (DNI ${dni}): no está en el legajo`); continue; }
        const activos = candidatos.filter(e => !estaDeBaja(e));
        if (!activos.length) {
            const b = candidatos[0];
            descartes.push(`${b.apellido} ${b.nombre} (DNI ${dni}): dado de baja${b.fecha_baja ? ` el ${b.fecha_baja}` : ''}`);
            continue;
        }
        if (activos.length > 1) { descartes.push(`${quien} (DNI ${dni}): hay ${activos.length} legajos activos con ese DNI`); continue; }
        const e = activos[0];
        if (vistos.has(e.id)) { descartes.push(`${e.apellido} ${e.nombre} (DNI ${dni}): repetida en la hoja`); continue; }
        vistos.add(e.id);
        if (yaEstan.has(e.id)) { descartes.push(`${e.apellido} ${e.nombre} (DNI ${dni}): ya está en la nómina`); continue; }
        cargar.push({ employee_id: e.id, apellido: e.apellido, nombre: e.nombre, dni });
    }
    planes.push({ hoja, doc, filas: filasConDatos, cargar, descartes });
}

console.log(`\n${aplicar ? 'CARGA' : 'SIMULACIÓN (sin --aplicar no se escribe nada)'} — ${archivo}\n`);
console.table(planes.map(p => ({ hoja: p.hoja, documentacion: `${p.doc.id} ${p.doc.titulo}`, filas: p.filas, 'se cargan': p.cargar.length, descartadas: p.descartes.length })));
for (const p of planes) {
    if (!p.descartes.length) continue;
    console.log(`\n${p.hoja} — descartadas:`);
    for (const d of p.descartes) console.log(`  · ${d}`);
}

if (falta) { console.log('\nNo se cargó nada: falta resolver las hojas de arriba.'); process.exit(1); }
if (!aplicar) { console.log('\nPara cargar, correr de nuevo con --aplicar.'); process.exit(0); }

// --- Carga ---
for (const p of planes) {
    if (!p.cargar.length) { console.log(`${p.hoja}: nada para cargar.`); continue; }
    const ahora = new Date().toISOString();
    const { data, error } = await sb.from('rrhh_vencimientos_nomina')
        .insert(p.cargar.map(c => ({ vencimiento_id: p.doc.id, employee_id: c.employee_id, agregado_por: QUIEN, agregado_at: ahora, enviado_at: ahora })))
        .select('id');
    if (error) { console.log(`✖ ${p.hoja}: ${error.message}. Se corta acá: lo cargado en hojas anteriores quedó.`); process.exit(1); }
    const { error: eEnvio } = await sb.from('rrhh_vencimientos_envios').insert({
        vencimiento_id: p.doc.id, tipo: 'inicial', fecha_vencimiento: p.doc.fecha,
        enviado_por: QUIEN, enviado_at: ahora, nomina: snapshotNomina(p.cargar),
    });
    if (eEnvio) { console.log(`✖ ${p.hoja}: se cargó la nómina pero no el registro del envío: ${eEnvio.message}`); process.exit(1); }
    console.log(`✓ ${p.hoja}: ${data.length} cargados en "${p.doc.titulo}".`);
}
