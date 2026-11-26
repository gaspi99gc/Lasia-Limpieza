// "Nota nueva" en la Solicitud de Personal (2026-11-26, opción elegida por el
// usuario). La jefa operativa escribe en las notas lo que no entra en el
// formulario, y RRHH no se enteraba: el 💬 se veía poco.
//
// - La etiqueta aparece mientras RRHH no abrió la nota y la solicitud sigue
//   abierta. Al abrirla, la API guarda nota_vista_at y nota_vista_por.
// - Si la nota cambia, vuelve a ser nueva.
// Sin imports, para que lo usen la API, la pantalla y `npm test`.

const limpia = (t) => (typeof t === 'string' ? t.trim() : '');

export function notaNueva(r) {
    return Boolean(limpia(r?.notas)) && !r?.nota_vista_at && r?.estado !== 'cubierta';
}

export function notaCambio(anterior, nueva) {
    return limpia(anterior) !== limpia(nueva);
}
