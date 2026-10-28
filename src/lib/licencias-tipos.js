// Los tipos de licencia como se leen, y una licencia contada en una frase.
// Funciones puras: corren igual en el navegador y en el servidor.

export const TIPO_LICENCIA = {
    art: 'ART',
    enfermedad: 'enfermedad',
    maternidad: 'maternidad',
    paternidad: 'paternidad',
    psiquiatrica: 'psiquiátrica',
    sin_goce: 'sin goce',
    casamiento: 'casamiento',
    fallecimiento: 'fallecimiento',
    vacaciones: 'vacaciones',
};

/** { tipo, desde, hasta } -> "ART del 12/10 al 30/10" */
export function describirLicencia(l) {
    if (!l) return '';
    const dm = (ymd) => `${String(ymd).slice(8, 10)}/${String(ymd).slice(5, 7)}`;
    return `${TIPO_LICENCIA[l.tipo] || l.tipo} del ${dm(l.desde)} al ${dm(l.hasta)}`;
}
