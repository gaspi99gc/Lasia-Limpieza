'use client';

// Notificaciones push del lado del navegador: registrar el service worker,
// pedir permiso y suscribirse.
//
// La restricción que manda todo esto es iOS: desde iOS 16.4 se pueden mandar
// push a una web app, pero SOLO si está agregada a la pantalla de inicio. Una
// pestaña abierta en Safari no recibe nada, y el navegador ni siquiera expone
// la API. Por eso hay que detectar el caso y explicarlo, en vez de mostrar un
// botón que no va a funcionar.

// El navegador entrega la clave en base64url y espera un Uint8Array.
function base64UrlAUint8(base64) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const normal = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const crudo = atob(normal);
    return Uint8Array.from([...crudo].map((c) => c.charCodeAt(0)));
}

// ¿La suscripción que ya existe se hizo con esta misma clave? El navegador
// guarda la clave como bytes crudos y acá la tenemos en base64url, así que se
// comparan byte a byte.
function mismaClave(bytesGuardados, base64Actual) {
    try {
        const a = new Uint8Array(bytesGuardados);
        const b = base64UrlAUint8(base64Actual);
        return a.length === b.length && a.every((v, i) => v === b[i]);
    } catch {
        // Ante la duda, tratarla como distinta: rehacer la suscripción es
        // barato, quedarse con una que no sirve cuesta que no llegue nada.
        return false;
    }
}

export function esIOS() {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
        // iPadOS moderno se hace pasar por Mac; se lo reconoce por el táctil.
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// ¿Está corriendo como app instalada y no como pestaña del navegador?
export function esAppInstalada() {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(display-mode: standalone)').matches
        || window.navigator.standalone === true;   // el de iOS
}

/**
 * Qué se puede hacer en este dispositivo. La pantalla usa esto para mostrar el
 * botón, o la instrucción de instalar, o avisar que no se puede.
 */
export function estadoPush() {
    if (typeof window === 'undefined') return { estado: 'cargando' };

    const haySoporte = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

    // iOS sin instalar: la API ni existe, y explicar el porqué evita que la
    // gente piense que la app está rota.
    if (!haySoporte && esIOS() && !esAppInstalada()) {
        return { estado: 'requiere_instalar', ios: true };
    }
    if (!haySoporte) {
        return { estado: 'sin_soporte' };
    }
    if (Notification.permission === 'denied') {
        return { estado: 'bloqueado' };
    }
    if (Notification.permission === 'granted') {
        return { estado: 'permitido' };
    }
    return { estado: 'pendiente' };
}

// Registra el service worker. Es idempotente: llamarlo dos veces no duplica nada.
export async function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/**
 * Pide permiso, se suscribe y guarda la suscripción en el servidor.
 *
 * Devuelve { ok, motivo } — `motivo` sirve para decirle a la persona qué pasó,
 * porque "no anduvo" no ayuda a nadie.
 */
export async function activarNotificaciones() {
    const { estado } = estadoPush();
    if (estado === 'requiere_instalar') {
        return { ok: false, motivo: 'requiere_instalar' };
    }
    if (estado === 'sin_soporte') {
        return { ok: false, motivo: 'sin_soporte' };
    }
    if (estado === 'bloqueado') {
        return { ok: false, motivo: 'bloqueado' };
    }

    // La clave se mira ANTES de pedir permiso. Si se chequeara después, al
    // usuario se le pide permiso, acepta, y recién ahí se descubre que falta la
    // clave: queda el permiso dado al pedo y la sensación de que el botón no
    // hace nada. Pasó en producción el 2026-10-01.
    const clavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!clavePublica) return { ok: false, motivo: 'sin_configurar' };

    // El permiso SOLO se puede pedir desde un gesto del usuario (un clic). Si se
    // pidiera al cargar la página, el navegador lo rechaza de entrada y encima
    // deja el permiso en "denegado" para siempre.
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') {
        return { ok: false, motivo: permiso === 'denied' ? 'bloqueado' : 'rechazado' };
    }

    const registro = await registrarServiceWorker();
    if (!registro) return { ok: false, motivo: 'sin_soporte' };

    // El service worker tiene que estar activo antes de suscribirse, pero
    // `ready` NO tiene timeout propio: si el worker no llega a activarse, la
    // promesa no se resuelve nunca y el botón queda en "Activando…" para
    // siempre, sin error ni mensaje. Diez segundos es de sobra; si no activó
    // para entonces, no va a activar.
    try {
        await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('timeout')), 10000)),
        ]);
    } catch {
        return { ok: false, motivo: 'sw_no_arranco' };
    }

    // Si ya había una suscripción se reusa: volver a suscribirse genera otro
    // endpoint y deja el anterior muerto en la base.
    let suscripcion = await registro.pushManager.getSubscription();

    // ...salvo que la de antes se haya hecho con OTRA clave. Pasa cuando se
    // regeneran las claves VAPID, o cuando quedó creada en un intento que
    // fallaba por otro motivo: el navegador la guarda igual, pero el servidor
    // ya no le puede mandar nada porque no la firma con la clave que espera.
    // Reusarla deja el botón "activando" para siempre sin que llegue nada.
    if (suscripcion) {
        const claveDeLaSuscripcion = suscripcion.options?.applicationServerKey;
        if (claveDeLaSuscripcion && !mismaClave(claveDeLaSuscripcion, clavePublica)) {
            await suscripcion.unsubscribe().catch(() => {});
            suscripcion = null;
        }
    }

    if (!suscripcion) {
        suscripcion = await registro.pushManager.subscribe({
            // Obligatorio en todos los navegadores: no se puede suscribir para
            // mandar mensajes silenciosos.
            userVisibleOnly: true,
            applicationServerKey: base64UrlAUint8(clavePublica),
        });
    }

    const res = await fetch('/api/push/suscribir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            suscripcion: suscripcion.toJSON(),
            user_agent: navigator.userAgent,
        }),
    });

    if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        return { ok: false, motivo: 'servidor', detalle: j.error };
    }
    return { ok: true };
}

/** Da de baja este dispositivo. */
export async function desactivarNotificaciones() {
    if (!('serviceWorker' in navigator)) return { ok: true };
    const registro = await navigator.serviceWorker.getRegistration();
    const suscripcion = await registro?.pushManager.getSubscription();
    if (!suscripcion) return { ok: true };

    // Primero se avisa al servidor y después se cancela: si se hiciera al revés
    // y fallara la red, el endpoint quedaría en la base sin dueño.
    await fetch(`/api/push/suscribir?endpoint=${encodeURIComponent(suscripcion.endpoint)}`, {
        method: 'DELETE',
        credentials: 'include',
    }).catch(() => {});

    await suscripcion.unsubscribe();
    return { ok: true };
}
