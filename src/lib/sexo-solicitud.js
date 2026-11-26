// Sexo que pide la jefa operativa en la Solicitud de Personal (2026-11-26).
// Indistinto es lo normal: es también lo que quedó en las solicitudes viejas.
// Sin imports, para que lo usen la API, la pantalla y `npm test`.

export const SEXOS = [
    { key: 'hombre', label: 'Hombre' },
    { key: 'mujer', label: 'Mujer' },
    { key: 'indistinto', label: 'Indistinto' },
];

const VALIDOS = SEXOS.map((s) => s.key);

export function limpiarSexo(v) {
    const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
    return VALIDOS.includes(s) ? s : 'indistinto';
}

// "mujeres", "hombre", "personas": la palabra sola, para debajo del número.
export function palabraPersonas(cantidad, sexo) {
    const uno = (Number(cantidad) || 1) === 1;
    const s = limpiarSexo(sexo);
    if (s === 'mujer') return uno ? 'mujer' : 'mujeres';
    if (s === 'hombre') return uno ? 'hombre' : 'hombres';
    return uno ? 'persona' : 'personas';
}

// "2 mujeres", "1 hombre", "3 personas".
export function textoPersonas(cantidad, sexo) {
    return `${Number(cantidad) || 1} ${palabraPersonas(cantidad, sexo)}`;
}
