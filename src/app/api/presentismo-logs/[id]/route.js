import { supabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/authCookie';

const ALLOWED_ROLES = ['operaciones', 'admin'];
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

// Reconstruye el timestamp UTC a partir de la fecha del evento original y una
// hora nueva en horario de Argentina (UTC-3). Mantiene el dia original.
function buildOccurredAt(originalUtcIso, horaArg) {
    const [h, m] = horaArg.split(':').map(Number);
    // Pasamos el original a hora Argentina para saber que dia calendario es alla.
    const argOriginal = new Date(new Date(originalUtcIso).getTime() - 3 * 60 * 60 * 1000);
    const y = argOriginal.getUTCFullYear();
    const mo = argOriginal.getUTCMonth();
    const d = argOriginal.getUTCDate();
    // Fecha ARG con la hora nueva, convertida de vuelta a UTC (+3).
    return new Date(Date.UTC(y, mo, d, h + 3, m, 0, 0)).toISOString();
}

export async function PATCH(req, { params }) {
    try {
        const session = await getSessionFromRequest(req);
        if (!ALLOWED_ROLES.includes(session?.role)) {
            return Response.json({ error: 'No tenés permiso para editar fichadas.' }, { status: 403 });
        }

        const { id } = await params;
        const { hora, editado_por } = await req.json();

        if (!hora || !TIME_RE.test(hora)) {
            return Response.json({ error: 'Ingresá una hora válida (HH:MM).' }, { status: 400 });
        }

        // Traemos el evento para conocer su fecha original y si ya fue editado.
        const { data: log, error: fetchError } = await supabase
            .from('supervisor_presentismo_logs')
            .select('id, occurred_at, original_occurred_at')
            .eq('id', id)
            .single();

        if (fetchError || !log) {
            return Response.json({ error: 'Fichada no encontrada.' }, { status: 404 });
        }

        const nuevoOccurredAt = buildOccurredAt(log.occurred_at, hora);

        // Una fichada a las 00:00 es casi siempre el campo vacio guardado como
        // cero, no alguien que fichó a la medianoche: asi se piso un ingreso de
        // 08:45. Nadie ficha a esa hora en este trabajo, y si alguna vez pasa se
        // corrige poniendo 00:01.
        if (hora === '00:00') {
            return Response.json(
                { error: 'La hora 00:00 no es válida para una fichada. Si el campo quedó vacío, completalo; si realmente fichó a la medianoche, poné 00:01.' },
                { status: 400 }
            );
        }

        const update = {
            occurred_at: nuevoOccurredAt,
            edited_at: new Date().toISOString(),
            // Decia `role` a secas, que no existe en esta funcion: cuando el
            // cliente no mandaba editado_por tiraba ReferenceError y la edicion
            // fallaba con un 500 generico que no explicaba nada.
            edited_by: (editado_por || '').toString().trim() || session.role,
        };
        // Guardamos la hora original solo la primera vez que se edita.
        if (!log.original_occurred_at) {
            update.original_occurred_at = log.occurred_at;
        }

        const { error: updateError } = await supabase
            .from('supervisor_presentismo_logs')
            .update(update)
            .eq('id', id);

        if (updateError) throw updateError;

        return Response.json({ success: true, occurred_at: nuevoOccurredAt });
    } catch (error) {
        console.error('Error editando fichada:', error);
        return Response.json({ error: 'No se pudo editar la fichada.' }, { status: 500 });
    }
}
