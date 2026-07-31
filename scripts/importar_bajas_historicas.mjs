// Importa las bajas del Excel a la tabla bajas_historicas.
// USO: node scripts/importar_bajas_historicas.mjs [--dry]
//   --dry  -> modo lectura: muestra qué se importaría SIN escribir.
// La tabla debe existir (migración 20260730_bajas_historicas.sql).
import * as XLSX from 'xlsx';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry');
const env = fs.readFileSync('.env.local', 'utf8');
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL') || get('SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY') || get('SUPABASE_SERVICE_ROLE') || get('SUPABASE_KEY'));

const soloDig = (v) => (v == null ? '' : String(v).replace(/\D/g, ''));
const serialToDate = (n) => {
    if (typeof n !== 'number' || n < 1 || n > 60000) return null; // descarta fechas basura
    return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
};
const toInt = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : null; };

// 1) Leer Excel
const buf = fs.readFileSync('Informe_bajas_1S_2026_con_ultimo_dia.xlsx');
const wb = XLSX.read(buf, { type: 'buffer' });
const raw = XLSX.utils.sheet_to_json(wb.Sheets['BAJAS 1S 2026'], { defval: '', header: 1 });
// Columnas: 0 CUIL,1 nombre,2 ingreso,3 ultimoDia,4 servBaja,6 servPpal,9 diasTrab,12 antig,13 estadoCruce,15 obs
const rows = raw.slice(1).filter(r => r[0] || r[1]);

// 2) Motivos desde la base (por CUIL) para enriquecer
const { data: emps } = await sb.from('employees').select('cuil, motivo_baja, estado_empleado');
const motivoByCuil = new Map();
emps.forEach(e => { const c = soloDig(e.cuil); if (c && e.motivo_baja) motivoByCuil.set(c, e.motivo_baja); });

// 3) Armar filas a insertar
const registros = rows.map(r => {
    const cuil = soloDig(r[0]);
    const estadoCruce = (r[13] || '').toString();
    const sinInicio = estadoCruce === 'SIN REGISTRO';
    return {
        cuil: cuil || null,
        apellido_nombre: (r[1] || '').toString().trim(),
        fecha_ingreso: serialToDate(r[2]),
        ultimo_dia: serialToDate(r[3]),
        servicio_baja: (r[4] || '').toString().trim() || null,
        servicio_principal: (r[6] || '').toString().trim() || null,
        dias_trabajados: toInt(r[9]),
        antiguedad_dias: toInt(r[12]),
        motivo_baja: cuil ? (motivoByCuil.get(cuil) || null) : null,
        sin_inicio_efectivo: sinInicio,
        estado_cruce: estadoCruce || null,
        observaciones: (r[15] || '').toString().trim() || null,
    };
});

console.log(`Filas a importar: ${registros.length}`);
console.log(`  Con último día real: ${registros.filter(x => x.ultimo_dia).length}`);
console.log(`  Sin inicio efectivo: ${registros.filter(x => x.sin_inicio_efectivo).length}`);
console.log(`  Con motivo (matcheado por CUIL): ${registros.filter(x => x.motivo_baja).length}`);

if (DRY) {
    console.log('\n[DRY RUN] No se escribió nada. Ejemplos:');
    registros.slice(0, 5).forEach(x => console.log(`  ${x.apellido_nombre} | ing=${x.fecha_ingreso} | ult=${x.ultimo_dia} | serv=${x.servicio_baja} | ${x.sin_inicio_efectivo ? 'SIN INICIO' : 'ok'}`));
    process.exit(0);
}

// 4) Insertar (limpia antes para poder re-correr sin duplicar)
await sb.from('bajas_historicas').delete().neq('id', -1);
const { error } = await sb.from('bajas_historicas').insert(registros);
if (error) { console.error('❌ Error al insertar:', error.message); process.exit(1); }
const { count } = await sb.from('bajas_historicas').select('*', { count: 'exact', head: true });
console.log(`\n✅ Importadas. Total en la tabla: ${count}`);
