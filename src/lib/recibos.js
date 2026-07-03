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
export function findCuilByLabel(text) {
    const m = text.match(/C\.?\s*U\.?\s*I\.?\s*L\.?[^\d]{0,60}([\d.\-\s]{11,25})/i);
    if (m) {
        const d = onlyDigits(m[1]);
        if (d.length === 11) return d;
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

// Construye el set de números "globales" (aparecen en un tercio o más de las páginas).
export function buildBlacklist(pageCandidatesList) {
    const freq = new Map();
    for (const cands of pageCandidatesList) {
        for (const c of cands) freq.set(c, (freq.get(c) || 0) + 1);
    }

    const threshold = Math.max(2, Math.floor(pageCandidatesList.length / 3));
    const blacklist = new Set();
    for (const [num, cnt] of freq) {
        if (cnt >= threshold) blacklist.add(num);
    }
    return blacklist;
}
