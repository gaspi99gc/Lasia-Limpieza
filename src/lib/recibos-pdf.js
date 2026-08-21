// Lectura de los PDF de recibos de haberes (liquidaciones finales) para cargar
// una planilla de pagos sin tipear a mano.
//
// Estructura del PDF (formato fijo del sistema de sueldos):
//   - Un recibo por pagina.
//   - Cada pagina trae el texto DUPLICADO: la copia del empleado y la del
//     empleador van lado a lado, asi que cada linea aparece dos veces. Se
//     deduplica al armar las lineas, por eso 6 paginas = 6 recibos, no 12.
//   - El nombre esta en la fila del encabezado, despues de "LIQ FINAL. <mes> <anio>":
//       "LIQ FINAL. julio 2026 CORDOBA FRANCO DANIEL 0 $ 462.137,00 0"
//   - El importe que se paga es el SUELDO NETO (no el bruto ni el costo empleador).
//
// El nombre se guarda como texto tal cual viene del recibo: las planillas de pago
// no se vinculan con la tabla de empleados.

// Hay DOS formatos de recibo (cambio de reglamentacion en julio 2026):
//
// NUEVO (julio 2026 en adelante): el nombre va en la misma linea que el tipo,
//   "LIQ FINAL. julio 2026 CORDOBA FRANCO DANIEL 0 $ 462.137,00 0", y el importe
//   que se paga es "SUELDO NETO $".
// VIEJO (hasta junio 2026): el nombre esta en su propia linea, justo ANTES de
//   "APELLIDO Y NOMBRES" (que en el PDF viene con typo "APLELLIDO"), y el importe
//   es "NETO A COBRAR 48.738,00".
//
// El lector detecta cual es por su contenido y aplica las reglas que correspondan.

// Formato NUEVO: "LIQ FINAL. julio 2026 CORDOBA FRANCO DANIEL 0 $ 462.137,00 0"
const RE_NOMBRE = /LIQ\s*FINAL\.?\s+\S+\s+\d{4}\s+(.+?)\s+\d+\s+\$/i;
// Importe con formato argentino: "$ 141.465,00"
const RE_MONTO = /\$\s*([\d.]+,\d{2})/;

// "141.465,00" -> 141465.00
function montoArgToNumber(str) {
    const n = Number(str.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

// El texto de cada pagina viene DUPLICADO (copia empleado + empleador lado a lado):
// "RUEDA MONICA PATRICIA RUEDA MONICA PATRICIA". Nos quedamos con la primera mitad.
function primeraMitad(texto) {
    const t = texto.trim();
    const mitad = t.slice(0, Math.floor(t.length / 2)).trim();
    // Si la primera mitad es exactamente el prefijo de la segunda, es duplicado real.
    return t.startsWith(mitad) && mitad && t.slice(mitad.length).trim().startsWith(mitad.slice(0, 3))
        ? mitad
        : t;
}

// Formato VIEJO: nombre en la linea anterior a "APELLIDO Y NOMBRES", neto en "NETO A COBRAR".
function parseReciboViejo(lines) {
    let operario = null;
    const idxApe = lines.findIndex(l => /AP.?ELLIDO\s+Y\s+NOMBRE/i.test(l));
    if (idxApe > 0) operario = primeraMitad(lines[idxApe - 1]);

    let monto = null;
    const lNeto = lines.find(l => /NETO\s+A\s+COBRAR/i.test(l));
    if (lNeto) {
        const m = lNeto.match(/([\d.]+,\d{2})/);
        if (m) monto = montoArgToNumber(m[1]);
        else if (/\bNETO\s+A\s+COBRAR\b[\s-]*$/i.test(lNeto) || /-\s*$/.test(lNeto)) monto = 0;
    }
    return { operario, monto };
}

// Reconstruye las lineas visuales de una pagina agrupando los fragmentos por
// coordenada Y y ordenandolos por X (pdf.js entrega el texto suelto).
async function pageToLines(page) {
    const content = await page.getTextContent();
    const rows = new Map();
    for (const item of content.items) {
        if (!item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push({ x: item.transform[4], s: item.str });
    }
    return [...rows.entries()]
        .sort((a, b) => b[0] - a[0]) // de arriba hacia abajo
        .map(([, items]) => items
            .sort((a, b) => a.x - b.x)
            .map(i => i.s)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim())
        .filter(Boolean);
}

function parseRecibo(lines) {
    let operario = null;
    for (const l of lines) {
        const m = l.match(RE_NOMBRE);
        if (m) { operario = m[1].trim(); break; }
    }

    // El neto figura en la fila "SUELDO NETO $" o en la inmediata siguiente,
    // segun como caiga el renglon en el PDF.
    let monto = null;
    const idx = lines.findIndex(l => /SUELDO\s+NETO/i.test(l));
    if (idx >= 0) {
        const bloque = lines.slice(idx, idx + 3);
        for (const l of bloque) {
            const m = l.match(RE_MONTO);
            if (m) { monto = montoArgToNumber(m[1]); break; }
        }
        // Liquidacion en CERO: el recibo muestra el neto como "$ -" (guion) y la
        // frase "Recibí la suma de: 00/100". Es un recibo valido que salio $0
        // (ej. altas anuladas / sin nada para cobrar), no un error de lectura.
        if (monto == null) {
            const netoEsCero = bloque.some(l => /\$\s*-/.test(l));
            const sumaCero = lines.some(l => /Recib.\s+la suma de:\s*00\/100/i.test(l));
            if (netoEsCero || sumaCero) monto = 0;
        }
    }

    // Si no salio con el formato nuevo, probamos el viejo (recibos hasta junio 2026).
    if (operario == null || monto == null) {
        const viejo = parseReciboViejo(lines);
        if (operario == null) operario = viejo.operario;
        if (monto == null) monto = viejo.monto;
    }

    return { operario, monto };
}

/**
 * Extrae {operario, monto} de cada recibo del PDF.
 *
 * Devuelve { lines, skipped } donde `lines` son los recibos leidos completos y
 * `skipped` las paginas que no se pudieron interpretar (para avisar en pantalla
 * en vez de guardar datos incompletos en silencio).
 */
export async function parseRecibosPdf(file) {
    // Import dinamico: pdfjs es pesado y solo hace falta al importar un PDF.
    // Mismo setup que RecibosView (que funciona): worker real servido en /public.
    // Poner workerSrc = '' rompe la inicializacion en el navegador.
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;

    const lines = [];
    const skipped = [];  // paginas que de verdad no se pudieron leer (error real)
    const enCero = [];   // recibos validos que salieron $0 (informativo, no error)
    // Algunos PDF traen cada recibo DUPLICADO en dos paginas espejo (copia empleado +
    // copia empleador). Descartamos la copia comparando nombre + monto: si ya salio un
    // recibo identico, es la pagina espejo, no una persona nueva. Usamos nombre+monto
    // (no solo nombre) para no pisar dos liquidaciones legitimas del mismo nombre.
    const vistos = new Set();
    const clave = (op, mo) => `${op.toLowerCase().replace(/\s+/g, ' ').trim()}|${mo}`;
    for (let p = 1; p <= doc.numPages; p++) {
        const { operario, monto } = parseRecibo(await pageToLines(await doc.getPage(p)));
        if (operario && monto != null) {
            const k = clave(operario, monto);
            if (vistos.has(k)) continue; // pagina espejo del mismo recibo
            vistos.add(k);
            lines.push({ operario, monto: String(monto) });
            if (monto === 0) enCero.push(operario);
        } else {
            skipped.push(p);
        }
    }

    return { lines, skipped, enCero };
}
