import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { quincenasDe, nombreCobro, esQuincenaDeCobro } from '../src/lib/quincenas-vacaciones.js';

// Pasa los cobros de vacaciones cargados con la quincena del MES (el 1 o el 16)
// a la quincena del CALENDARIO de vacaciones (pedido del usuario, 2026-11-16).
// Regla: la quincena del calendario del mismo nombre ("2ª quincena de noviembre"
// -> "2° de noviembre", 23/11); si el calendario no tiene esa (la 1ª de
// noviembre), la primera que arranca después.
//
// CORRERLO RECIÉN CUANDO EL CÓDIGO NUEVO ESTÉ EN PRODUCCIÓN: el código viejo no
// sabe nombrar una fecha del calendario y mostraría la quincena en blanco.
//
// USO: node scripts/pasar_cobros_a_calendario.mjs            (simulación)
//      node scripts/pasar_cobros_a_calendario.mjs --aplicar  (escribe)
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APLICAR = process.argv.includes('--aplicar');

const calendario = [2026, 2027].flatMap(p => quincenasDe(p));

function quincenaNueva(viejo) {
    const [a, m, d] = viejo.split('-');
    const ordinal = d === '01' ? '1°' : '2°';
    const mismoNombre = calendario.find(q => q.desde.startsWith(`${a}-${m}`) && q.nombre.startsWith(ordinal));
    return (mismoNombre || calendario.find(q => q.desde >= viejo))?.desde || null;
}

const { data, error } = await sb
    .from('vacaciones_movimientos')
    .select('id, fecha_cobro, cantidad, estado, pago_at, employees:employee_id (apellido, nombre)')
    .eq('tipo', 'pagado')
    .not('fecha_cobro', 'is', null)
    .order('fecha_cobro');
if (error) { console.log(error.message); process.exit(1); }

const cambios = data.filter(c => !esQuincenaDeCobro(c.fecha_cobro));
for (const c of cambios) {
    const nueva = quincenaNueva(c.fecha_cobro);
    console.log(`${c.id} ${c.employees?.apellido} ${c.employees?.nombre}: ${nombreCobro(c.fecha_cobro)} -> ${nueva ? nombreCobro(nueva) : 'SIN QUINCENA, no se toca'}${c.pago_at ? ' (ya pagado)' : ''}`);
    if (APLICAR && nueva) {
        const { error: e } = await sb.from('vacaciones_movimientos').update({ fecha_cobro: nueva }).eq('id', c.id).eq('fecha_cobro', c.fecha_cobro);
        if (e) console.log('   ERROR', e.message);
    }
}
console.log(`${cambios.length} cobros con la quincena del mes${APLICAR ? ', pasados' : ' (simulación: agregá --aplicar)'}.`);
