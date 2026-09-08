// Importa la hoja AUSENTES del PRESENTISMO a la tabla `faltas`, marcadas con
// origen='historico' para distinguirlas de las que registra Operaciones.
//
// La hoja solo trae fecha, persona y horas: NO trae servicio ni turno, asi que
// estas faltas entran con puesto_id y service_id en null. Por eso el origen
// importa: los rankings por servicio no las pueden usar.
//
// Solo se cargan las que matchean con un legajo. Las que no (137 nombres, casi
// todos de gente que trabajo a principio de año y ya no esta) quedan en
// ausencias_sin_match.xlsx para revisar aparte.
//
// USO: node scripts/importar_ausencias_historicas.mjs [--dry] [--desde YYYY-MM-DD] [--hasta YYYY-MM-DD]

import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { buildEmployeeMatcher, normText } from '../src/lib/operativo-import.js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

config({ path: '.env.local', quiet: true });

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };
const DESDE = argVal('--desde') || '2026-01-01';
const HASTA = argVal('--hasta') || '2026-12-31';
const ARCHIVO = args.find(a => !a.startsWith('--') && a !== DESDE && a !== HASTA) || 'PRESENTISMO 2026.xlsx';

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// La hoja escribe las fechas como "3-Sep", sin año. El archivo es el de 2026 y
// la serie va de enero a septiembre sin cortes, asi que se asume ese año.
const MES = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const ANIO = 2026;
function parseFecha(s) {
    const m = String(s || '').trim().match(/^(\d{1,2})-([A-Za-z]{3})/);
    if (!m) return null;
    const mes = MES[m[2].toLowerCase()];
    return mes ? `${ANIO}-${String(mes).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}` : null;
}

async function main() {
    const wb = XLSX.readFile(ARCHIVO, { cellStyles: false });
    const hoja = wb.SheetNames.find(n => normText(n) === 'AUSENTES');
    if (!hoja) { console.error(`No encontre la hoja AUSENTES. Hojas: ${wb.SheetNames.join(', ')}`); process.exit(1); }
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: '', raw: false }).slice(1);

    // El motivo esta disperso: a veces en la 4ta columna, a veces mezclado con
    // las horas en la 3ra ("4 HS ADICIONAL"). Solo el 1% lo tiene.
    const registros = [];
    for (const r of filas) {
        const fecha = parseFecha(r[0]);
        const nombre = String(r[1] || '').trim();
        if (!fecha || !nombre) continue;
        if (fecha < DESDE || fecha > HASTA) continue;

        const c3 = String(r[2] || '').trim();
        const c4 = String(r[3] || '').trim();
        const horas = Number(c3.replace(',', '.'));
        const textoMotivo = [Number.isFinite(horas) ? '' : c3, c4].filter(Boolean).join(' · ') || null;

        registros.push({
            fecha,
            nombre,
            horas: Number.isFinite(horas) ? horas : null,
            // "ADICIONAL" quiere decir que falto al servicio adicional, no al
            // principal: es un dato del caso, no una categoria de motivo.
            nota: textoMotivo,
        });
    }

    // La hoja tiene alguna fila repetida (misma persona el mismo dia).
    const vistos = new Set();
    const unicos = [];
    let repetidos = 0;
    for (const r of registros) {
        const k = `${r.fecha}|${normText(r.nombre)}`;
        if (vistos.has(k)) { repetidos++; continue; }
        vistos.add(k);
        unicos.push(r);
    }

    const { data: emps, error: eEmp } = await sb.from('employees').select('id, nombre, apellido, estado_empleado');
    if (eEmp) { console.error(eEmp.message); process.exit(1); }
    const match = buildEmployeeMatcher(emps);
    const cache = new Map();

    const conLegajo = [];
    const sinLegajo = new Set();
    for (const r of unicos) {
        if (!cache.has(r.nombre)) cache.set(r.nombre, match(r.nombre)?.id ?? null);
        const id = cache.get(r.nombre);
        if (!id) { sinLegajo.add(r.nombre); continue; }
        conLegajo.push({
            fecha: r.fecha,
            employee_id: id,
            nombre_excel: r.nombre,
            puesto_id: null,        // la hoja no dice en que puesto falto
            service_id: null,
            servicio_excel: null,
            horas: r.horas,
            aviso: true,
            motivo: 'sin_especificar',
            nota: r.nota,
            registrado_por: 'Importado del presentismo',
            origen: 'historico',
        });
    }

    console.log(`Archivo: ${ARCHIVO} · rango ${DESDE} a ${HASTA}`);
    console.log(`  filas leidas: ${registros.length} (${repetidos} repetidas salteadas)`);
    console.log(`  con legajo:   ${conLegajo.length}`);
    console.log(`  sin legajo:   ${unicos.length - conLegajo.length} (${sinLegajo.size} nombres distintos, quedan sin cargar)`);
    console.log(`  horas a cargar: ${conLegajo.reduce((a, r) => a + (r.horas || 0), 0)}`);

    // Idempotencia: no volver a cargar lo que ya esta.
    const { count: yaHay } = await sb.from('faltas')
        .select('id', { count: 'exact', head: true })
        .eq('origen', 'historico').gte('fecha', DESDE).lte('fecha', HASTA);
    if (yaHay > 0) {
        console.error(`\nYa hay ${yaHay} faltas historicas en ese rango. Borralas antes de recargar:`);
        console.error(`   DELETE FROM faltas WHERE origen='historico' AND fecha BETWEEN '${DESDE}' AND '${HASTA}';`);
        process.exit(1);
    }

    if (DRY) {
        console.log('\n[DRY] No se escribio nada. Muestra:');
        conLegajo.slice(0, 5).forEach(r => console.log(`  ${r.fecha} | ${r.nombre_excel} | ${r.horas} hs | ${r.nota || ''}`));
        return;
    }

    console.log('\nInsertando en lotes de 500...');
    for (let i = 0; i < conLegajo.length; i += 500) {
        const { error } = await sb.from('faltas').insert(conLegajo.slice(i, i + 500));
        if (error) { console.error(`Error en el lote ${i}:`, error.message); process.exit(1); }
        console.log(`  ${Math.min(i + 500, conLegajo.length)}/${conLegajo.length}`);
    }
    console.log(`\nListo: ${conLegajo.length} ausencias historicas cargadas.`);
}

main();
