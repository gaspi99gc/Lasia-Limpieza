import { supabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/authCookie';

// Guarda y borra suscripciones a notificaciones push.
//
// No lleva restriccion por rol: cualquiera que tenga sesion puede querer recibir
// avisos, y la suscripcion queda atada a SU usuario. Lo que se notifique a cada
// uno lo decide quien manda, no esta tabla.

export async function POST(request) {
    try {
        const session = await getSessionFromRequest(request);
        const usuarioId = session?.appUserId;
        if (!usuarioId) {
            return Response.json({ error: 'No autenticado.' }, { status: 401 });
        }

        const { suscripcion, user_agent } = await request.json();
        const endpoint = suscripcion?.endpoint;
        const p256dh = suscripcion?.keys?.p256dh;
        const auth = suscripcion?.keys?.auth;

        if (!endpoint || !p256dh || !auth) {
            return Response.json({ error: 'La suscripción vino incompleta.' }, { status: 400 });
        }

        // upsert por endpoint: el endpoint ES el dispositivo. Si la misma
        // persona se vuelve a suscribir desde el mismo navegador, se actualiza
        // la fila en vez de dejar dos.
        //
        // Ademas se reasigna el app_user_id: si en ese dispositivo se cambio de
        // usuario, los avisos tienen que ir al que esta logueado ahora, no al
        // anterior.
        const { error } = await supabase
            .from('push_suscripciones')
            .upsert({
                app_user_id: usuarioId,
                endpoint,
                p256dh,
                auth,
                user_agent: (user_agent || '').toString().slice(0, 400) || null,
            }, { onConflict: 'endpoint' });

        if (error) throw error;
        return Response.json({ ok: true }, { status: 201 });
    } catch (error) {
        console.error('Error guardando suscripcion push:', error);
        return Response.json(
            { error: `No se pudo guardar la suscripción: ${error.message || 'error desconocido'}` },
            { status: 500 }
        );
    }
}

// Cuantos dispositivos tiene registrados el usuario. Lo usa la pantalla para
// decir si ya estan activadas en este.
export async function GET(request) {
    try {
        const session = await getSessionFromRequest(request);
        const usuarioId = session?.appUserId;
        if (!usuarioId) return Response.json({ error: 'No autenticado.' }, { status: 401 });

        const { data, error } = await supabase
            .from('push_suscripciones')
            .select('id, endpoint, user_agent, created_at')
            .eq('app_user_id', usuarioId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return Response.json({ dispositivos: data || [] });
    } catch (error) {
        console.error('Error listando suscripciones push:', error);
        return Response.json({ error: 'No se pudieron cargar.' }, { status: 500 });
    }
}

// Baja de un dispositivo.
export async function DELETE(request) {
    try {
        const session = await getSessionFromRequest(request);
        const usuarioId = session?.appUserId;
        if (!usuarioId) return Response.json({ error: 'No autenticado.' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const endpoint = searchParams.get('endpoint');
        if (!endpoint) return Response.json({ error: 'Falta el endpoint.' }, { status: 400 });

        // Se filtra tambien por usuario: sin eso, sabiendo un endpoint ajeno se
        // podria dar de baja las notificaciones de otra persona.
        const { error } = await supabase
            .from('push_suscripciones')
            .delete()
            .eq('endpoint', endpoint)
            .eq('app_user_id', usuarioId);

        if (error) throw error;
        return Response.json({ ok: true });
    } catch (error) {
        console.error('Error borrando suscripcion push:', error);
        return Response.json({ error: 'No se pudo dar de baja.' }, { status: 500 });
    }
}
