// Whitelist de servicios del cliente WeWork.
// Fuente unica de verdad: si suman/renombran una sucursal, tocar SOLO este array.
// Incluye variantes de nombre para tolerar como esten cargados en la DB.
export const WEWORK_SERVICE_NAMES = [
    'WEWORK CORRIENTES',
    'WEWORK VICENTE LOPEZ',
    'WEWORK VTE LOPEZ',
    'WEWORK BUTTY',
    'WEWORK BLAS PARERA',
];

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

// Normaliza para comparar sin importar mayusculas, acentos ni espacios extra.
export function normServiceName(s) {
    return (s || '')
        .toString()
        .toUpperCase()
        .normalize('NFD')
        .replace(COMBINING_MARKS, '')
        .replace(/\s+/g, ' ')
        .trim();
}

const WEWORK_SET = new Set(WEWORK_SERVICE_NAMES.map(normServiceName));

export function isWeworkService(name) {
    return WEWORK_SET.has(normServiceName(name));
}
