// Carga inicial del stock de uniformes desde "UNIFORMES  STOCK.xlsx".
//
// La planilla es una grilla de bloques: cada columna es una prenda y cada celda
// dice talle y cantidad juntos ("S       50"). Arriba, un rotulo separa lo usado
// de lo nuevo. Esto lo lee y lo convierte en prendas + movimientos.
//
// Entra como movimientos de tipo 'ajuste', no como un numero suelto: asi el
// stock inicial queda asentado en el libro igual que todo lo demas, con fecha y
// autor. "De donde salieron estas 95 unidades" se contesta mirando el libro.
//
// Es reimportable: si la planilla se vuelve a contar, se corre de nuevo y solo
// carga la DIFERENCIA contra lo que ya hay (otro ajuste, positivo o negativo).
// Nunca borra ni duplica.
//
// USO:
//   node scripts/importar_stock_uniformes.mjs --dry     (ver que haria)
//   node scripts/importar_stock_uniformes.mjs           (cargar)

import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { calcularStock, traerTodo } from '../src/lib/uniformes.js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

config({ path: '.env.local', quiet: true });

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const ARCHIVO = args.find((a) => !a.startsWith('--')) || 'UNIFORMES  STOCK.xlsx';

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// Los bloques de la planilla, ubicados a mano.
//
// Se listan explicitamente en vez de detectarlos solos: la planilla la hizo una
// persona y tiene el titulo del BUZO POLAR corrido una fila, dos columnas
// llamadas igual ("CAMISAS", una usada y otra nueva) y un bloque suelto abajo.
// Adivinar todo eso es como se cargan 50 pantalones en la fila equivocada.
//
// El estado sale de la POSICION bajo los rotulos "usados" / "NUEVOS"
// (confirmado por el usuario), no del nombre de la columna.
const BLOQUES = [
    { prenda: 'Pantalón',        col: 0, filaDesde: 4,  estado: 'usado', total: 95 },
    { prenda: 'Camisa',          col: 1, filaDesde: 4,  estado: 'usado', total: 47 },
    { prenda: 'Remera WeWork',   col: 2, filaDesde: 4,  estado: 'usado', total: 37 },
    { prenda: 'Buzo WeWork',     col: 3, filaDesde: 4,  estado: 'usado', total: 13 },
    { prenda: 'Pantalón',        col: 4, filaDesde: 4,  estado: 'nuevo', total: 75 },
    { prenda: 'Camisa',          col: 5, filaDesde: 4,  estado: 'nuevo', total: 0 },
    // El titulo esta en la fila 1, asi que los talles arrancan en la 3.
    { prenda: 'Buzo polar',      col: 6, filaDesde: 3,  estado: 'nuevo', total: 5 },
    // Bloque suelto debajo de las remeras usadas.
    //
    // La planilla escribe TOTAL 150, pero los talles suman 143 (10+14+30+50+39).
    // Mandan los talles: el total a mano quedo viejo, que es lo que pasa cuando
    // se corrige un talle y no se recalcula la suma (confirmado con el usuario).
    { prenda: 'Remera WeWork',   col: 2, filaDesde: 11, estado: 'nuevo', total: 143 },
];

const TALLES = ['S', 'M', 'L', 'XL', 'XXL'];

const todayAR = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

// "S       50" -> { talle: 'S', cantidad: 50 }
function leerCelda(txt) {
    const s = String(txt || '').trim();
    if (!s) return null;
    const m = s.match(/^([A-Za-z]{1,3})\s+(\d+)$/);
    if (!m) return null;
    const talle = m[1].toUpperCase();
    if (!TALLES.includes(talle)) return null;
    return { talle, cantidad: Number(m[2]) };
}

function leerPlanilla() {
    const wb = XLSX.readFile(ARCHIVO, { cellStyles: false });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '', raw: false });

    const leidos = [];
    const problemas = [];

    for (const b of BLOQUES) {
        const items = [];
        // Se leen 5 filas desde el inicio del bloque: los cinco talles.
        for (let r = b.filaDesde; r < b.filaDesde + TALLES.length; r++) {
            const celda = leerCelda(filas[r]?.[b.col]);
            if (celda) items.push(celda);
        }

        const suma = items.reduce((a, i) => a + i.cantidad, 0);
        // La planilla trae su propio TOTAL. Si no coincide con la suma, algo se
        // leyo mal: se avisa en vez de cargar un numero equivocado.
        if (suma !== b.total) {
            problemas.push(`${b.prenda} (${b.estado}): la planilla dice ${b.total} y las celdas suman ${suma}`);
        }
        for (const i of items) {
            leidos.push({ prenda: b.prenda, talle: i.talle, estado: b.estado, cantidad: i.cantidad });
        }
    }

    return { leidos, problemas };
}

async function main() {
    const { leidos, problemas } = leerPlanilla();

    console.log(`Archivo: ${ARCHIVO}`);
    console.log(`  celdas leidas: ${leidos.length}`);
    if (problemas.length) {
        console.error('\nLos totales de la planilla no cierran:');
        problemas.forEach((p) => console.error(`  - ${p}`));
        console.error('\nNo se carga nada: revisá la planilla o los bloques del script.');
        process.exit(1);
    }
    console.log('  todos los totales de la planilla cierran ✓');

    const porPrenda = new Map();
    for (const l of leidos) {
        const k = `${l.prenda}|${l.talle}`;
        if (!porPrenda.has(k)) porPrenda.set(k, { prenda: l.prenda, talle: l.talle, nuevo: 0, usado: 0 });
        porPrenda.get(k)[l.estado] += l.cantidad;
    }

    console.log('\nLo que dice la planilla:');
    const resumen = new Map();
    for (const v of porPrenda.values()) {
        if (!resumen.has(v.prenda)) resumen.set(v.prenda, { nuevo: 0, usado: 0 });
        resumen.get(v.prenda).nuevo += v.nuevo;
        resumen.get(v.prenda).usado += v.usado;
    }
    for (const [prenda, r] of resumen) {
        console.log(`  ${prenda.padEnd(16)} nuevas ${String(r.nuevo).padStart(4)} · usadas ${String(r.usado).padStart(4)} · total ${r.nuevo + r.usado}`);
    }

    // Catalogo: crear lo que falte, sin tocar lo que ya este.
    const existentes = await traerTodo(() => sb.from('uniformes_prendas').select('*').order('id'));
    const porClave = new Map(existentes.map((p) => [`${p.prenda}|${p.talle}`, p]));

    const aCrear = [...porPrenda.values()]
        .filter((v) => !porClave.has(`${v.prenda}|${v.talle}`))
        .map((v) => ({ prenda: v.prenda, talle: v.talle }));

    console.log(`\n  prendas ya en el sistema: ${existentes.length}`);
    console.log(`  prendas a crear:          ${aCrear.length}`);

    if (!DRY && aCrear.length) {
        const { data, error } = await sb.from('uniformes_prendas').insert(aCrear).select();
        if (error) { console.error('Error creando prendas:', error.message); process.exit(1); }
        for (const p of data) porClave.set(`${p.prenda}|${p.talle}`, p);
        console.log(`  creadas ${data.length}.`);
    }

    if (DRY && aCrear.length) {
        console.log('\n[DRY] Prendas que se crearian:');
        aCrear.forEach((p) => console.log(`  ${p.prenda} · ${p.talle}`));
        console.log('\n[DRY] No se escribio nada. Corré sin --dry para cargar.');
        return;
    }

    // Diferencia contra lo que ya hay: si el stock actual coincide con la
    // planilla no se carga nada. Correrlo dos veces no duplica.
    const movimientos = await traerTodo(() =>
        sb.from('uniformes_movimientos')
            .select('prenda_id, tipo, estado, cantidad, anulado_at')
            .order('id')
    );
    const stockActual = calcularStock(movimientos);

    const ajustes = [];
    for (const v of porPrenda.values()) {
        const p = porClave.get(`${v.prenda}|${v.talle}`);
        if (!p) continue;
        const actual = stockActual.get(p.id) || { nuevo: 0, usado: 0 };
        for (const estado of ['nuevo', 'usado']) {
            const diferencia = v[estado] - actual[estado];
            if (diferencia === 0) continue;
            ajustes.push({
                fecha: todayAR(),
                prenda_id: p.id,
                tipo: 'ajuste',
                estado,
                cantidad: diferencia,
                precio_unitario: Number(p.precio) || 0,
                nota: 'Conteo inicial del armario (planilla UNIFORMES STOCK)',
                registrado_por: 'Importado de la planilla',
            });
        }
    }

    console.log(`\n  ajustes a cargar: ${ajustes.length}`);
    if (!ajustes.length) {
        console.log('  El stock del sistema ya coincide con la planilla. No hay nada que hacer.');
        return;
    }

    if (DRY) {
        console.log('\n[DRY] Primeros 10 ajustes:');
        ajustes.slice(0, 10).forEach((a) => {
            const p = existentes.find((e) => e.id === a.prenda_id) || porClave.get(a.prenda_id);
            console.log(`  prenda ${a.prenda_id} (${p?.prenda || '?'} ${p?.talle || ''}) ${a.estado}: ${a.cantidad > 0 ? '+' : ''}${a.cantidad}`);
        });
        console.log('\n[DRY] No se escribio nada.');
        return;
    }

    for (let i = 0; i < ajustes.length; i += 500) {
        const { error } = await sb.from('uniformes_movimientos').insert(ajustes.slice(i, i + 500));
        if (error) { console.error('Error cargando ajustes:', error.message); process.exit(1); }
    }
    console.log(`\nListo: ${ajustes.length} ajustes cargados.`);
    console.log('El stock del sistema ahora coincide con la planilla.');
}

main();
