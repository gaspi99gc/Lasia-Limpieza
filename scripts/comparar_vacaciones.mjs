// Compara un Excel de dias de vacaciones contra lo que calcula el sistema.
//
// NO carga nada: solo señala las diferencias. El sistema calcula los dias desde
// la fecha de ingreso y la escala del art. 150 LCT, asi que cuando un caso no
// coincide con la planilla casi siempre es una FECHA DE INGRESO mal cargada, y
// lo que hay que corregir es esa fecha, no el resultado.
//
// Tener dos fuentes para el mismo numero es peor que tener una sola imperfecta:
// el dia que no coinciden, nadie sabe cual vale.
//
// USO: node scripts/comparar_vacaciones.mjs "ARCHIVO.xlsx"
//
// El Excel necesita una columna con el nombre (o el legajo) y otra con los dias.
// El script busca los encabezados solo; si no los encuentra, los lista para que
// se le pasen a mano.

import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { normText } from '../src/lib/operativo-import.js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

config({ path: '.env.local', quiet: true });

const ARCHIVO = process.argv[2];
if (!ARCHIVO) {
    console.error('Falta el archivo. Uso: node scripts/comparar_vacaciones.mjs "ARCHIVO.xlsx"');
    process.exit(1);
}

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

const ESCALA = [{ desde: 20, dias: 35 }, { desde: 10, dias: 28 }, { desde: 5, dias: 21 }, { desde: 1, dias: 14 }];

function antiguedadEn(ingreso, corte) {
    const a = new Date(corte), b = new Date(ingreso);
    if (Number.isNaN(b.getTime())) return null;
    let n = a.getFullYear() - b.getFullYear();
    const m = a.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && a.getDate() < b.getDate())) n--;
    return n;
}
const diasPorAntiguedad = (n) => (n == null || n < 1) ? 0 : (ESCALA.find(e => n >= e.desde) || { dias: 0 }).dias;

async function traerTodo(q, size = 1000) {
    const out = [];
    for (let from = 0; ; from += size) {
        const { data, error } = await q().range(from, from + size - 1);
        if (error) throw new Error(error.message);
        out.push(...(data || []));
        if (!data || data.length < size) return out;
    }
}

// Busca en qué columna está el nombre y en cuál los días, por el encabezado.
function detectarColumnas(filas) {
    for (let i = 0; i < Math.min(8, filas.length); i++) {
        const fila = (filas[i] || []).map(c => normText(c));
        const colNombre = fila.findIndex(c => /APELLIDO|NOMBRE|OPERARIO|EMPLEADO/.test(c));
        const colDias = fila.findIndex(c => /DIAS|DÍAS|CORRESPONDE|VACACIONES/.test(c));
        if (colNombre >= 0 && colDias >= 0) return { fila: i, colNombre, colDias };
    }
    return null;
}

async function main() {
    const wb = XLSX.readFile(ARCHIVO, { cellStyles: false });
    console.log(`Archivo: ${ARCHIVO}`);
    console.log(`  hojas: ${wb.SheetNames.join(', ')}\n`);

    const hoja = wb.SheetNames[0];
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: '', raw: false });

    const cols = detectarColumnas(filas);
    if (!cols) {
        console.error('No encontré las columnas de nombre y días. Encabezados que veo:');
        filas.slice(0, 5).forEach((f, i) => console.error(`  fila ${i}: ${JSON.stringify(f.slice(0, 10))}`));
        process.exit(1);
    }
    console.log(`  encabezados en la fila ${cols.fila}: nombre=col ${cols.colNombre}, días=col ${cols.colDias}\n`);

    const delExcel = new Map();
    for (const f of filas.slice(cols.fila + 1)) {
        const nombre = normText(f[cols.colNombre]);
        const dias = Math.trunc(Number(String(f[cols.colDias]).replace(',', '.')));
        if (!nombre || !Number.isFinite(dias)) continue;
        delExcel.set(nombre, dias);
    }
    console.log(`  filas leídas del Excel: ${delExcel.size}`);

    const emps = (await traerTodo(() =>
        sb.from('employees').select('id, legajo, nombre, apellido, fecha_ingreso, estado_empleado').order('apellido')
    )).filter(e => e.estado_empleado === 'Activo');

    const corte = `${new Date().getFullYear()}-12-31`;
    const iguales = [], distintos = [], sinMatch = [];

    for (const [nombreExcel, diasExcel] of delExcel) {
        const e = emps.find(x => normText(`${x.apellido} ${x.nombre}`) === nombreExcel)
               || emps.find(x => normText(`${x.nombre} ${x.apellido}`) === nombreExcel);
        if (!e) { sinMatch.push(nombreExcel); continue; }

        const calculado = diasPorAntiguedad(antiguedadEn(e.fecha_ingreso, corte));
        if (calculado === diasExcel) iguales.push(e);
        else distintos.push({ e, diasExcel, calculado, anios: antiguedadEn(e.fecha_ingreso, corte) });
    }

    console.log(`\n  COINCIDEN:        ${iguales.length}`);
    console.log(`  NO COINCIDEN:     ${distintos.length}`);
    console.log(`  sin encontrar:    ${sinMatch.length}`);

    if (distintos.length) {
        console.log('\n=== LOS QUE NO COINCIDEN ===');
        console.log('(revisar la FECHA DE INGRESO: si está mal, el sistema calcula mal)\n');
        distintos.sort((a, b) => Math.abs(b.diasExcel - b.calculado) - Math.abs(a.diasExcel - a.calculado));
        for (const d of distintos) {
            console.log(`  ${`${d.e.apellido} ${d.e.nombre}`.slice(0, 32).padEnd(34)} ingreso ${d.e.fecha_ingreso} (${d.anios} años)`);
            console.log(`  ${''.padEnd(34)} Excel dice ${d.diasExcel} · el sistema calcula ${d.calculado}`);
        }
    }

    if (sinMatch.length) {
        console.log('\n=== NOMBRES DEL EXCEL QUE NO ESTÁN EN LA NÓMINA ACTIVA ===');
        sinMatch.slice(0, 20).forEach(n => console.log(`  ${n}`));
        if (sinMatch.length > 20) console.log(`  ...y ${sinMatch.length - 20} más`);
    }

    console.log('\nNo se escribió nada: esto solo compara.');
}

main();
