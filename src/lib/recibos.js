// Lógica de detección de CUIL y partido de recibos.
// Portado desde el script Python original (PyMuPDF) a JS.

export function onlyDigits(s) {
    return (s || '').replace(/\D+/g, '');
}

// Hash liviano (FNV-1a) del texto de una página, para detectar duplicados idénticos.
// No es criptográfico, pero alcanza de sobra para comparar páginas iguales.
export function hashText(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
}

// Valida el dígito verificador del CUIL/CUIT (11 dígitos).
export function cuilChecksumOk(num11) {
    if (!/^\d{11}$/.test(num11)) return false;

    const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const base = num11.slice(0, 10);
    const dv = Number(num11[10]);

    let sum = 0;
    for (let i = 0; i < 10; i++) sum += Number(base[i]) * weights[i];

    let r = 11 - (sum % 11);
    if (r === 11) r = 0;
    else if (r === 10) r = 9;

    return dv === r;
}

// Todos los posibles números de 11 dígitos presentes en el texto.
export function candidatesOnText(text) {
    const cands = new Set();

    const chunks = text.match(/[\d.\-\s]{11,25}/g) || [];
    for (const chunk of chunks) {
        const d = onlyDigits(chunk);
        if (d.length === 11) cands.add(d);
    }

    const runs = text.match(/\d{11}/g) || [];
    for (const run of runs) cands.add(run);

    return [...cands];
}

// Busca el CUIL a partir del rótulo. Acepta "CUIL" y "C.U.I.L." (con puntos/espacios).
// No matchea "CUIT" (termina en T).
//
// El recibo no pone el numero pegado al rotulo: la fila es de encabezados
// ("C.U.I.L. Banco Periodo F.PAGO APORTES") y recien abajo van los valores, asi
// que al extraer el texto quedan dos fechas en el medio. Por eso no alcanza con
// exigir que no haya digitos entre el rotulo y el numero: hay que mirar mas
// adelante y quedarse con el primer numero que sea un CUIL valido de verdad.
export function findCuilByLabel(text) {
    const rotulo = text.match(/C\.?\s*U\.?\s*I\.?\s*L\.?/i);
    if (!rotulo) return null;

    // Ventana despues del rotulo. 400 caracteres cubren la fila de valores sin
    // llegar al detalle de conceptos, donde podria haber otros numeros largos.
    const ventana = text.slice(rotulo.index + rotulo[0].length, rotulo.index + rotulo[0].length + 400);

    // El primero que pase el digito verificador. Las fechas y los importes no lo
    // pasan, asi que el filtro descarta solo el ruido.
    for (const cand of candidatesOnText(ventana)) {
        if (cuilChecksumOk(cand)) return cand;
    }
    return null;
}

// Resuelve el CUIL de una página: primero por rótulo, luego por candidatos válidos
// (excluyendo los números que aparecen en todas las páginas, ej. CUIT de la empresa).
export function resolveCuil(text, pageCandidates, blacklist) {
    // El rótulo "C.U.I.L." siempre acompaña al CUIL del empleado (el CUIT de la empresa
    // va junto a "CUIT"), así que si lo detectamos por rótulo confiamos sin filtrar.
    const byLabel = findCuilByLabel(text);
    if (byLabel) return byLabel;

    const candidates = pageCandidates.filter(c => !blacklist.has(c));
    const valid = candidates.filter(cuilChecksumOk);

    if (valid.length) return valid[0];
    if (candidates.length) return candidates[0];
    return null;
}

// Construye el set de números "globales": los que aparecen en tantas páginas que
// no pueden ser el CUIL de un empleado (el CUIT de la empresa, el número de
// liquidación).
//
// El umbral era "un tercio de las páginas, mínimo 2", y con archivos chicos se
// llevaba puestos los CUILs buenos: cada recibo ocupa 2 páginas (original y
// duplicado), así que cada CUIL aparece 2 veces. En un PDF de 8 páginas el
// umbral daba exactamente 2 y bloqueaba TODOS los CUILs — el archivo terminaba
// con "0 recibos". Con 10 páginas el umbral daba 3 y se salvaba por uno.
//
// Ahora el mínimo es 3: un CUIL repetido por el duplicado nunca queda afuera, y
// el CUIT de la empresa (que está en todas las páginas) se sigue descartando.
// Para PDFs de 1 o 2 páginas no se descarta nada: no hay repetición que permita
// distinguir lo global de lo propio del empleado, y ahí el checksum decide.
export function buildBlacklist(pageCandidatesList) {
    const paginas = pageCandidatesList.length;
    if (paginas < 3) return new Set();

    const freq = new Map();
    for (const cands of pageCandidatesList) {
        for (const c of cands) freq.set(c, (freq.get(c) || 0) + 1);
    }

    const threshold = Math.max(3, Math.floor(paginas / 3));
    const blacklist = new Set();
    for (const [num, cnt] of freq) {
        if (cnt >= threshold) blacklist.add(num);
    }
    return blacklist;
}
