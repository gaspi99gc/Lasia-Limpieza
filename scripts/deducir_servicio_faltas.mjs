// Deduce el servicio de las faltas que no lo tienen, usando el PRESENTISMO.
//
// La hoja AUSENTES no trae el servicio (solo fecha, persona y horas), pero la
// hoja PRESENTISMO dice donde trabajo cada uno cada dia. Entonces: si alguien
// falto el 15 de marzo, se mira donde venia trabajando esos dias.
//
// Se mira una ventana de +-7 DIAS alrededor de la falta, no el mes entero. Con
// el mes se cubre mas (87% contra 77%) pero se acierta menos: hay gente que
// rota entre servicios, y ahi "el mas frecuente del mes" es tirar una moneda
// (CABALLERO tenia 16 dias en un servicio y 16 en otro). Por cercania, el 83%
// de lo que se resuelve queda con certeza alta.
//
// NO toca las faltas que ya tienen servicio: esas las cargo Operaciones desde la
// pantalla y salieron del operativo de ese dia, que es el dato bueno.
//
// USO:
//   node scripts/deducir_servicio_faltas.mjs --dry     (ver que haria)
//   node scripts/deducir_servicio_faltas.mjs           (aplicar)

import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { normText, buildServiceMatcherTolerante } from '../src/lib/operativo-import.js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

config({ path: '.env.local', quiet: true });

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const ARCHIVO = args.find(a => !a.startsWith('--')) || 'PRESENTISMO 2026.xlsx';
const VENTANA_DIAS = 7;

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function traerTodo(buildQuery, pageSize = 1000) {
    const filas = [];
    for (let desde = 0; ; desde += pageSize) {
        const { data, error } = await buildQuery().range(desde, desde + pageSize - 1);
        if (error) throw new Error(error.message);
        filas.push(...(data || []));
        if (!data || data.length < pageSize) return filas;
    }
}

// La hoja PRESENTISMO trae la fecha como M/D/YY.
function fechaPresentismo(s) {
    const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!m) return null;
    let anio = Number(m[3]);
    if (anio < 100) anio += 2000;
    return `${anio}-${String(Number(m[1])).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

const diasEntre = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);

function leerPresentismo() {
    const wb = XLSX.readFile(ARCHIVO, { cellStyles: false });
    const hoja = wb.SheetNames.find(n => normText(n) === 'PRESENTISMO');
    if (!hoja) {
        console.error(`No encontre la hoja PRESENTISMO. Hojas: ${wb.SheetNames.join(', ')}`);
        process.exit(1);
    }
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: '', raw: false }).slice(1);

    // persona normalizada -> [{ fecha, servicio }]
    const historial = new Map();
    for (const r of filas) {
        const fecha = fechaPresentismo(r[0]);
        if (!fecha) continue;
        const persona = normText(r[3]);
        const servicio = String(r[1] || '').trim();
        if (!persona || !servicio) continue;
        if (!historial.has(persona)) historial.set(persona, []);
        historial.get(persona).push({ fecha, servicio });
    }
    return historial;
}

// El servicio donde trabajaba esa persona alrededor de esa fecha.
function deducir(historial, personaNorm, fecha) {
    const h = historial.get(personaNorm);
    if (!h) return null;

    const cerca = h.filter(x => diasEntre(x.fecha, fecha) <= VENTANA_DIAS);
    if (!cerca.length) return null;

    const cuenta = new Map();
    for (const x of cerca) cuenta.set(x.servicio, (cuenta.get(x.servicio) || 0) + 1);
    const ordenado = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);

    const dominante = ordenado[0][1] / cerca.length;
    return {
        servicio: ordenado[0][0],
        // Un solo servicio en la ventana, o uno que se lleva 70%+ de los dias.
        // Si esta mas repartido, el dato sirve pero no es para jurarlo.
        confianza: (ordenado.length === 1 || dominante >= 0.7) ? 'alta' : 'media',
    };
}

async function main() {
    console.log(`Leyendo ${ARCHIVO} (puede tardar, es grande)...`);
    const historial = leerPresentismo();
    console.log(`  personas con historial: ${historial.size}`);

    const [faltas, empleados, servicios] = await Promise.all([
        traerTodo(() =>
            sb.from('faltas')
                .select('id, employee_id, nombre_excel, fecha, service_id, anulada_at')
                .is('anulada_at', null)
                .is('service_id', null)
                .order('id')
        ),
        traerTodo(() => sb.from('employees').select('id, nombre, apellido, estado_empleado').order('id')),
        traerTodo(() => sb.from('services').select('id, name').order('id')),
    ]);

    console.log(`  faltas sin servicio: ${faltas.length}`);

    const nombrePorEmpleado = new Map(
        empleados.map(e => [e.id, normText(`${e.apellido} ${e.nombre}`)])
    );
        // El matcher tolerante: el presentismo escribe "WE WORK" y la tabla
    // "WEWORK", entre otras diferencias.
    const matchServicio = buildServiceMatcherTolerante(servicios);

    const cambios = [];
    let sinHistorial = 0;
    let sinServicioEnTabla = 0;
    const conf = { alta: 0, media: 0 };
    const noIdentificados = new Map();

    for (const f of faltas) {
        // El nombre para buscar en el presentismo: el del legajo si lo tiene,
        // si no el texto crudo del Excel.
        const persona = f.employee_id
            ? nombrePorEmpleado.get(f.employee_id)
            : normText(f.nombre_excel);
        if (!persona) { sinHistorial++; continue; }

        const hallado = deducir(historial, persona, f.fecha);
        if (!hallado) { sinHistorial++; continue; }

        // El nombre del servicio en el presentismo tiene que existir en la tabla.
        const svc = matchServicio(hallado.servicio);
        if (!svc) {
            sinServicioEnTabla++;
            noIdentificados.set(hallado.servicio, (noIdentificados.get(hallado.servicio) || 0) + 1);
            continue;
        }

        conf[hallado.confianza]++;
        cambios.push({
            id: f.id,
            service_id: svc.id,
            servicio_excel: hallado.servicio,
            servicio_fuente: 'deducido',
            servicio_confianza: hallado.confianza,
        });
    }

    console.log(`\n  SE COMPLETAN:            ${cambios.length}`);
    console.log(`     certeza alta:         ${conf.alta}`);
    console.log(`     certeza media:        ${conf.media}`);
    console.log(`  sin historial cercano:   ${sinHistorial}`);
    console.log(`  servicio no esta en la tabla: ${sinServicioEnTabla}`);

    if (noIdentificados.size) {
        console.log('\n  nombres del presentismo que no matchean con ningun servicio:');
        [...noIdentificados.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
            .forEach(([n, c]) => console.log(`    ${String(c).padStart(4)}  ${n}`));
    }

    if (DRY) {
        console.log('\n[DRY] No se escribio nada. Muestra de lo que se cargaria:');
        cambios.slice(0, 8).forEach(c =>
            console.log(`  falta ${String(c.id).padStart(5)} -> ${c.servicio_excel} (${c.servicio_confianza})`));
        return;
    }

    if (!cambios.length) {
        console.log('\nNo hay nada para completar.');
        return;
    }

    console.log('\nEscribiendo...');
    let ok = 0;
    for (const c of cambios) {
        const { id, ...set } = c;
        // Con la condicion de que siga sin servicio: si Operaciones lo cargo
        // mientras esto corria, gana el dato de ellos.
        const { data, error } = await sb.from('faltas')
            .update(set).eq('id', id).is('service_id', null).select('id');
        if (error) { console.error(`  error en falta ${id}: ${error.message}`); continue; }
        if (data?.length) ok++;
        if (ok % 200 === 0 && ok) console.log(`  ${ok}/${cambios.length}`);
    }
    console.log(`\nListo: ${ok} faltas con servicio deducido.`);
}

main();
