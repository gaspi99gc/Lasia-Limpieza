// Service worker: es lo que permite que llegue una notificación con la app
// cerrada. El navegador lo mantiene vivo aunque nadie tenga la pestaña abierta,
// y lo despierta cuando el servidor manda un push.
//
// Deliberadamente NO cachea nada. Un service worker que cachea puede dejar a la
// gente viendo una versión vieja de la app sin entender por qué, y acá el único
// objetivo son las notificaciones.

const VERSION = 'lasia-sw-v2';

self.addEventListener('install', (event) => {
    // Tomar el control sin esperar a que se cierren las pestañas viejas: si no,
    // activar las notificaciones y que funcionen queda a mitad de camino hasta
    // que la persona cierre todo.
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Llega un push del servidor.
self.addEventListener('push', (event) => {
    let datos = {};
    try {
        datos = event.data ? event.data.json() : {};
    } catch {
        // Si el payload no es JSON válido igual se muestra algo: una
        // notificación genérica es mejor que ninguna.
        datos = { titulo: 'LASIA', cuerpo: event.data ? event.data.text() : '' };
    }

    const titulo = datos.titulo || 'LASIA';
    const opciones = {
        body: datos.cuerpo || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        // El tag agrupa: los avisos de un mismo trabajo (7 días, 2 días, el día
        // anterior) reemplazan al anterior en vez de apilarse.
        tag: datos.tag || 'lasia',
        // Y aunque reemplace a otro, suena y vibra. Sin esto, el "⚠ Pasado
        // mañana y sin coordinar" reemplazaba al de 7 días en silencio. Un
        // aviso que solo informa puede mandar renotify: false.
        renotify: datos.renotify ?? true,
        // Que no desaparezca sola: estos avisos son para no olvidarse de algo.
        requireInteraction: Boolean(datos.requiereAccion),
        data: { url: datos.url || '/', ...(datos.data || {}) },
        actions: datos.acciones || [],
    };

    event.waitUntil(self.registration.showNotification(titulo, opciones));
});

// Tocan la notificación.
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const destino = event.notification.data?.url || '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
            // Si la app ya está abierta se la enfoca y se navega ahí, en vez de
            // abrir una segunda pestaña de lo mismo.
            for (const v of ventanas) {
                if ('focus' in v) {
                    v.navigate?.(destino);
                    return v.focus();
                }
            }
            return self.clients.openWindow(destino);
        })
    );
});
