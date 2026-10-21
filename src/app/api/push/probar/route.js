import { getSessionFromRequest } from '@/lib/authCookie';
import { enviarA, pushConfigurado } from '@/lib/push-server';

// Manda una notificacion de prueba al propio usuario.
//
// Es la unica forma de saber si todo el circuito funciona de punta a punta
// (permiso, service worker, suscripcion guardada, claves VAPID, envio) sin
// tener que esperar a que se dispare un aviso real.
//
// Solo se manda a UNO MISMO: no recibe destinatario, asi que no se puede usar
// para molestar a otro.
export async function POST(request) {
    try {
        const session = await getSessionFromRequest(request);
        const usuarioId = session?.appUserId;
        if (!usuarioId) return Response.json({ error: 'No autenticado.' }, { status: 401 });

        if (!pushConfigurado()) {
            return Response.json(
                { error: 'Faltan las claves VAPID en el servidor. Avisale a sistemas.' },
                { status: 500 }
            );
        }

        const r = await enviarA([usuarioId], {
            titulo: 'Notificaciones activadas',
            cuerpo: 'Si ves esto, los avisos de LASIA te van a llegar a este dispositivo.',
            url: '/',
            tag: 'prueba',
        });

        if (r.error) return Response.json({ error: r.error }, { status: 500 });
        if (!r.enviados) {
            // Dos casos distintos que antes daban el mismo mensaje: el celular
            // nunca se registró, o se registró y la suscripción VENCIÓ (Google
            // o Apple la rechazan y se borra). En el segundo el navegador sigue
            // creyéndose suscripto; con `codigo` la pantalla la renueva sola.
            const vencida = r.limpiados > 0;
            return Response.json({
                error: vencida
                    ? 'La suscripción de este dispositivo venció.'
                    : 'No hay ningún dispositivo suscripto. Activá las notificaciones primero.',
                codigo: vencida ? 'vencida' : (r.fallidos ? 'fallo' : 'sin_dispositivo'),
            }, { status: 400 });
        }

        return Response.json(r);
    } catch (error) {
        console.error('Error enviando push de prueba:', error);
        return Response.json({ error: 'No se pudo enviar la prueba.' }, { status: 500 });
    }
}
