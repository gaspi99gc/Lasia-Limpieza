// Autorizacion de las rutas que llama el cron de Vercel.
//
// El cron no tiene sesion ni cookie: Vercel lo llama con el header
// `Authorization: Bearer <CRON_SECRET>`, tomando el valor de la variable de
// entorno CRON_SECRET del proyecto. Para correrlo a mano hay que mandar el
// mismo header.
//
// Sin CRON_SECRET cargado la ruta queda CERRADA, no abierta: sin secreto
// cualquiera que conozca la URL podria disparar los avisos.
//
// No usa `node:crypto` porque tambien se llama desde el middleware, que corre
// en el runtime Edge.

// Comparacion de tiempo constante: no cortar en el primer caracter distinto
// evita adivinar el secreto midiendo cuanto tarda en responder.
function safeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

export function cronAutorizado(request) {
    const secreto = process.env.CRON_SECRET;
    if (!secreto) return false;
    const header = request.headers.get('authorization') || '';
    return safeEqual(header, `Bearer ${secreto}`);
}
