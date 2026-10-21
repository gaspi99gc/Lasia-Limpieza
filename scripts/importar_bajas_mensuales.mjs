import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import fs from 'fs';

// Carga de bajas mensuales en bajas_historicas, mismo formato que la tanda del 2026-09-01.
// REGLA: cada baja va al mes de su ULTIMO DIA TRABAJADO (lo trae el Excel), nunca a fecha_baja.
// Sin ultimo dia y 0 dias trabajados = alta anulada (sin_inicio_efectivo).
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
// USO: node scripts/importar_bajas_mensuales.mjs <archivo.xlsx>            (simulacion)
//      node scripts/importar_bajas_mensuales.mjs <archivo.xlsx> --aplicar  (escribe)
// Las columnas se buscan POR TITULO, no por posicion: el formato de la planilla cambio
// (sept-2026 agrego 'Primer dia trabajado' en el medio) y leyendo por posicion se cargaba
// el primer dia como ultimo SIN AVISAR. Si falta una columna obligatoria, se frena.
// Obligatorias: CUIL | Nombre y Apellido | Fecha Ingreso | Ultimo dia trabajado | Dias trabajados.
// Opcionales: Servicio ultimo dia | Estado ('Nunca inicio' = alta anulada).
const ARCHIVO = process.argv.slice(2).find(a => !a.startsWith('--'));
if (!ARCHIVO) { console.log('Falta el archivo .xlsx'); process.exit(1); }
const APLICAR = process.argv.includes('--aplicar');
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Fecha de una celda: Date (Excel con formato fecha), numero de serie, o texto D/M/AAAA.
// Se lee el valor real de la celda y no el texto mostrado: asi '7/22/26' (mes/dia) no
// se confunde con dia/mes.
const iso = v => {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
    if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null; }
    const m = String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};
const dias = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
const norm = c => String(c || '').replace(/\D/g, '');
// Digito verificador del CUIL. Asi se detecto un CUIL mal tipeado en la tanda de septiembre.
const cuilValido = c => { const d = String(c).split('').map(Number); if (d.length !== 11) return false; const s = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2].reduce((a, w, i) => a + w * d[i], 0); let v = 11 - (s % 11); if (v === 11) v = 0; return v === d[10]; };
const normNombre = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();

const wb = XLSX.read(fs.readFileSync(ARCHIVO), { cellDates: true });
const todas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
const titulo = h => String(h || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const enc = (todas[0] || []).map(titulo);
const buscar = pred => enc.findIndex(pred);
const COL = {
    cuil: buscar(h => h.startsWith('cuil')),
    nombre: buscar(h => h.includes('nombre') || h.includes('apellido')),
    ingreso: buscar(h => h.includes('ingreso')),
    ultimo: buscar(h => h.includes('ultimo dia')),
    // 'Dias trabajados (total)' y no 'Dias trabajados en septiembre'.
    dias: (() => { const t = buscar(h => h.startsWith('dias trabajados') && h.includes('total')); return t >= 0 ? t : buscar(h => h.startsWith('dias trabajados') && !h.includes(' en ')); })(),
    servicio: buscar(h => h.startsWith('servicio')),
    estado: buscar(h => h === 'estado'),
};
const faltan = ['cuil', 'nombre', 'ingreso', 'ultimo', 'dias'].filter(k => COL[k] < 0);
if (faltan.length) {
    console.log('FALTAN COLUMNAS en la planilla:', faltan.join(', '), '| encabezados:', todas[0]);
    process.exit(1);
}
console.log('Columnas:', Object.entries(COL).filter(([, i]) => i >= 0).map(([k, i]) => `${k}="${String(todas[0][i]).trim()}"`).join(' | '));
// Las filas sin CUIL (notas y referencias al pie) no son personas.
const filas = todas.slice(1).filter(r => norm(r[COL.cuil]));

let existentes = [], f = 0;
while (true) { const { data, error } = await sb.from('bajas_historicas').select('cuil,apellido_nombre').range(f, f + 999); if (error) throw error; existentes = existentes.concat(data); if (data.length < 1000) break; f += 1000; }
const cuilCargado = new Set(existentes.map(e => norm(e.cuil)));
const nombreCargado = new Set(existentes.map(e => normNombre(e.apellido_nombre)));

const hoy = new Date().toISOString().slice(0, 10);
const nuevas = [], salteadas = [], problemas = [], porMes = {};
for (const r of filas) {
    const cuil = norm(r[COL.cuil]), nombre = String(r[COL.nombre]).trim(), ingreso = iso(r[COL.ingreso]), ultimo = iso(r[COL.ultimo]), trabajados = Number(r[COL.dias]) || 0;
    const servicio = COL.servicio >= 0 ? String(r[COL.servicio] || '').trim() || null : null;
    const nuncaInicio = COL.estado >= 0 && titulo(r[COL.estado]).includes('nunca');
    if (cuilCargado.has(cuil)) { salteadas.push(`${nombre} (CUIL ya cargado)`); continue; }
    if (!cuilValido(cuil)) problemas.push(`${nombre}: CUIL ${cuil} invalido (digito verificador)`);
    if (nombreCargado.has(normNombre(nombre))) problemas.push(`${nombre}: el NOMBRE ya esta cargado con otro CUIL`);
    if (!ingreso) problemas.push(`${nombre}: fecha de ingreso ilegible "${r[COL.ingreso]}"`);
    if (ingreso && ingreso > hoy) problemas.push(`${nombre}: ingreso en el futuro ${ingreso}`);
    const anulada = (!ultimo && trabajados === 0) || (nuncaInicio && !ultimo);
    if (!anulada && !ultimo) problemas.push(`${nombre}: tiene ${trabajados} dias trabajados pero no ultimo dia`);
    if (ultimo && ingreso && ultimo < ingreso) problemas.push(`${nombre}: ultimo dia ${ultimo} anterior al ingreso ${ingreso}`);
    if (ultimo && ingreso && trabajados > dias(ingreso, ultimo) + 1) problemas.push(`${nombre}: ${trabajados} dias trabajados en ${dias(ingreso, ultimo) + 1} dias corridos`);
    const etiqueta = ultimo ? `${MESES[Number(ultimo.slice(5, 7)) - 1]} ${ultimo.slice(0, 4)}` : null;
    const clave = anulada ? `anulada (ingreso ${ingreso?.slice(0, 7)})` : ultimo.slice(0, 7);
    porMes[clave] = (porMes[clave] || 0) + 1;
    nuevas.push({
        cuil, apellido_nombre: nombre, fecha_ingreso: ingreso, ultimo_dia: ultimo,
        servicio_baja: servicio, servicio_principal: null,
        dias_trabajados: trabajados, antiguedad_dias: ultimo && ingreso ? dias(ingreso, ultimo) : null,
        motivo_baja: null, sin_inicio_efectivo: anulada,
        estado_cruce: anulada ? 'SIN REGISTRO' : `OK (${etiqueta})`,
        observaciones: anulada ? 'Resumen mensual RRHH - alta anulada' : `Resumen mensual RRHH - baja de ${etiqueta}`,
        fecha_egreso: null,
    });
}
console.log(`Filas ${filas.length} | a cargar ${nuevas.length} | salteadas ${salteadas.length}`);
console.log('Por mes de ultimo dia:', porMes);
if (salteadas.length) console.log('Salteadas:', salteadas);
console.log('Problemas:', problemas.length ? problemas : 'ninguno');

if (APLICAR) {
    if (problemas.length) { console.log('NO se aplica: hay problemas para revisar.'); process.exit(1); }
    const { data, error } = await sb.from('bajas_historicas').insert(nuevas).select('id');
    if (error) throw error;
    console.log(`APLICADO: ${data.length} filas nuevas (ids ${data[0].id}..${data[data.length - 1].id})`);
}
