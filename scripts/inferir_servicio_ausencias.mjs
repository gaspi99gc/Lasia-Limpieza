// Le pone servicio a las ausencias historicas, buscando a cada persona en el
// operativo cargado.
//
// OJO — ESTO ES UNA INFERENCIA, NO UN DATO:
// La hoja AUSENTES no dice donde falto cada uno. El operativo cargado es de
// fines de agosto, asi que asignarle ese servicio a una ausencia de enero
// supone que la persona estuvo ocho meses en el mismo lugar. Para muchos sera
// cierto, pero no hay forma de saber para cuales.
//
// Por eso el servicio se escribe SOLO en filas con origen='historico': esa marca
// es la que avisa que el servicio ahi es inferido. Las faltas que registra
// Operaciones traen el servicio real, verificado en el momento.
//
// A quien esta en VARIOS servicios no se le asigna ninguno: elegir uno al azar
// ensuciaria el ranking mas de lo que ayuda.
//
// USO: node scripts/inferir_servicio_ausencias.mjs [--dry]

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

const DRY = process.argv.includes('--dry');
const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function todo(tabla, sel, mod) {
    const out = [];
    for (let from = 0; ; from += 1000) {
        let q = sb.from(tabla).select(sel).range(from, from + 999);
        if (mod) q = mod(q);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        out.push(...(data || []));
        if (!data || data.length < 1000) break;
    }
    return out;
}

async function main() {
    const faltas = await todo('faltas', 'id, employee_id, nombre_excel, horas, servicio_excel',
        q => q.eq('origen', 'historico').is('servicio_excel', null));
    const puestos = await todo('operativo_puestos', 'employee_id, servicio_excel, service_id',
        q => q.eq('activo', true));

    // Servicios de cada persona segun el operativo. Se cuentan los puestos para
    // poder detectar a los que estan en mas de uno.
    const porEmpleado = new Map();
    for (const p of puestos) {
        if (!p.employee_id || !p.servicio_excel) continue;
        if (!porEmpleado.has(p.employee_id)) porEmpleado.set(p.employee_id, new Map());
        porEmpleado.get(p.employee_id).set(p.servicio_excel, p.service_id ?? null);
    }

    const aActualizar = [];
    let ambiguas = 0, sinPuesto = 0;
    for (const f of faltas) {
        const svcs = f.employee_id ? porEmpleado.get(f.employee_id) : null;
        if (!svcs) { sinPuesto++; continue; }
        if (svcs.size > 1) { ambiguas++; continue; }
        const [nombre, serviceId] = [...svcs.entries()][0];
        aActualizar.push({ id: f.id, servicio_excel: nombre, service_id: serviceId, horas: f.horas });
    }

    console.log(`Ausencias historicas sin servicio: ${faltas.length}`);
    console.log(`  se les puede inferir:  ${aActualizar.length}`);
    console.log(`  en varios servicios (se saltean): ${ambiguas}`);
    console.log(`  sin puesto en el operativo (bajas): ${sinPuesto}`);

    // Como quedaria el ranking, para ver si el resultado tiene sentido.
    const rank = new Map();
    for (const r of aActualizar) {
        if (!rank.has(r.servicio_excel)) rank.set(r.servicio_excel, { n: 0, hs: 0 });
        const e = rank.get(r.servicio_excel);
        e.n++; e.hs += Number(r.horas) || 0;
    }
    const top = [...rank.entries()].sort((a, b) => b[1].hs - a[1].hs).slice(0, 15);
    console.log(`\n=== RANKING QUE SALDRIA (top 15 de ${rank.size} servicios) ===`);
    for (const [svc, v] of top) {
        console.log(`  ${String(v.hs).padStart(5)} hs · ${String(v.n).padStart(3)} faltas · ${svc.slice(0, 52)}`);
    }

    if (DRY) { console.log('\n[DRY] No se escribio nada.'); return; }

    console.log('\nActualizando...');
    let hechas = 0;
    for (const r of aActualizar) {
        const { error } = await sb.from('faltas')
            .update({ servicio_excel: r.servicio_excel, service_id: r.service_id })
            .eq('id', r.id);
        if (error) { console.error(`Error en la falta ${r.id}: ${error.message}`); continue; }
        hechas++;
        if (hechas % 200 === 0) console.log(`  ${hechas}/${aActualizar.length}`);
    }
    console.log(`\nListo: ${hechas} ausencias con servicio inferido.`);
}

main();
