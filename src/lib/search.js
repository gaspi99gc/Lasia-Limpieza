// Helpers de busqueda compartidos.
//
// Historicamente cada pantalla concatenaba los campos pegados y en orden fijo
// (ej. `nombre + apellido`), asi que buscar "Apellido Nombre" no traia nada.
// Estos helpers parten la busqueda en palabras y exigen que cada una aparezca
// en algun lado, sin importar el orden, y normalizan acentos.

// Pasa a minusculas y saca acentos ("Pérez" -> "perez").
export function normalizeText(value) {
    return (value ?? '')
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

// True si TODAS las palabras de `query` aparecen en `haystack`, en cualquier
// orden. `haystack` puede ser un string o un array de campos (se unen con espacio).
// Ejemplos que dan true para "Pérez Juan": "perez juan", "juan perez", "perez 20345".
export function matchesSearch(query, haystack) {
    const terms = normalizeText(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return true;
    const text = normalizeText(Array.isArray(haystack) ? haystack.join(' ') : haystack);
    return terms.every(t => text.includes(t));
}
