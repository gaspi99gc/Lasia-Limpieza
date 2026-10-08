import webpush from 'web-push';
import { supabase } from '@/lib/db';

// Envío de notificaciones push desde el servidor.
//
// Se configura con las claves VAPID: la publica la conoce el navegador al
// suscribirse y la privada firma cada mensaje. Si la privada se filtrara,
// cualquiera podria mandarle notificaciones a todos los suscriptos, por eso
// vive solo en variables de entorno.

let configurado = false;
function configurar() {
    if (configurado) return true;
    const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privada = process.env.VAPID_PRIVATE_KEY;
    if (!publica || !privada) return false;

    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:info@lasia.com.ar',
        publica,
        privada
    );
    configurado = true;
    return true;
}

// Como se manda cada push:
//   - timeout: si Google o Apple no contestan en 10 s, ese dispositivo cuenta
//     como fallido. Sin esto, un push colgado deja esperando al cron hasta
//     que Vercel lo corta, y los avisos quedan a mitad de camino.
//   - TTL: si el celular esta apagado, el servicio guarda el aviso un dia.
//     Despues ya no sirve: al otro dia sale el siguiente. El valor por defecto
//     de web-push son 4 semanas.
//   - urgency: 'high' le pide al servicio que lo entregue enseguida aunque el
//     celular este ahorrando bateria. Son avisos para hacer algo hoy.
const OPCIONES_ENVIO = { timeout: 10000, TTL: 24 * 60 * 60, urgency: 'high' };

export function pushConfigurado() {
    return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Manda una notificación a todos los dispositivos de una lista de usuarios.
 *
 * @param {string[]} usuarioIds  app_users.id (UUID) de los destinatarios.
 * @param {object}   payload     { titulo, cuerpo, url, tag, requiereAccion }
 * @returns {{enviados:number, fallidos:number, limpiados:number}}
 *
 * `limpiados` son suscripciones que el push service rechazó como muertas y se
 * borraron: pasa cuando alguien desinstala la app o limpia los datos del
 * navegador. Sin borrarlas, el sistema intentaría mandarles para siempre.
 */
export async function enviarA(usuarioIds, payload) {
    if (!configurar()) {
        return { enviados: 0, fallidos: 0, limpiados: 0, error: 'Faltan las claves VAPID.' };
    }
    const ids = [...new Set((usuarioIds || []).filter(Boolean))];
    if (!ids.length) return { enviados: 0, fallidos: 0, limpiados: 0 };

    const { data: subs, error } = await supabase
        .from('push_suscripciones')
        .select('id, endpoint, p256dh, auth')
        .in('app_user_id', ids);

    if (error) throw error;
    if (!subs?.length) return { enviados: 0, fallidos: 0, limpiados: 0 };

    const cuerpo = JSON.stringify(payload || {});
    let enviados = 0, fallidos = 0;
    const muertas = [];

    // En paralelo: un push tarda cientos de milisegundos y son varios
    // dispositivos por persona.
    await Promise.all(subs.map(async (s) => {
        try {
            await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                cuerpo,
                OPCIONES_ENVIO
            );
            enviados++;
        } catch (e) {
            // 404 y 410 significan que esa suscripción ya no existe: el
            // dispositivo se desinstaló o limpió sus datos. Cualquier otro
            // error puede ser temporal, así que esas NO se borran.
            if (e?.statusCode === 404 || e?.statusCode === 410) {
                muertas.push(s.id);
            } else {
                fallidos++;
                console.error('Push fallido:', e?.statusCode, e?.body || e?.message);
            }
        }
    }));

    if (muertas.length) {
        await supabase.from('push_suscripciones').delete().in('id', muertas);
    }
    if (enviados) {
        const vivos = subs.filter((s) => !muertas.includes(s.id)).map((s) => s.id);
        await supabase
            .from('push_suscripciones')
            .update({ ultimo_uso_at: new Date().toISOString() })
            .in('id', vivos);
    }

    return { enviados, fallidos, limpiados: muertas.length };
}
