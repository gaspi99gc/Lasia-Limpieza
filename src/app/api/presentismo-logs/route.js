import { supabase } from '@/lib/db';

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const supervisorId = searchParams.get('supervisor_id');
        const serviceId = searchParams.get('service_id');
        const days = Number(searchParams.get('days'));

        let query = supabase
            .from('supervisor_presentismo_logs')
            .select('id, event_type, occurred_at, event_lat, event_lng, services:service_id(id, name, address), supervisors:supervisor_id(id, app_users(name, surname, username))')
            .order('occurred_at', { ascending: false });

        if (supervisorId) query = query.eq('supervisor_id', supervisorId);
        if (serviceId) query = query.eq('service_id', serviceId);

        if (Number.isFinite(days) && days > 0) {
            const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            query = query.gte('occurred_at', cutoff.toISOString());
        }

        const { data, error } = await query;
        if (error) throw error;

        const rows = (data || []).map(pl => ({
            id: pl.id,
            event_type: pl.event_type,
            occurred_at: pl.occurred_at,
            event_lat: pl.event_lat,
            event_lng: pl.event_lng,
            service_id: pl.services?.id || null,
            service_name: pl.services?.name || null,
            service_address: pl.services?.address || null,
            supervisor_id: pl.supervisors?.id || null,
            supervisor_name: pl.supervisors?.app_users?.name || null,
            supervisor_surname: pl.supervisors?.app_users?.surname || null,
            supervisor_dni: pl.supervisors?.app_users?.username || null,
        }));

        return Response.json(rows);
    } catch (error) {
        console.error('Error fetching presentismo logs:', error);
        return Response.json({ error: 'No se pudieron obtener los logs de presentismo' }, { status: 500 });
    }
}

const ALLOWED_ROLES = ['operaciones', 'admin'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

// Fecha (YYYY-MM-DD) + hora Argentina (HH:MM) -> timestamp UTC (Argentina es UTC-3).
function argToUtc(fecha, hora) {
    const [y, mo, d] = fecha.split('-').map(Number);
    const [h, m] = hora.split(':').map(Number);
    return new Date(Date.UTC(y, mo - 1, d, h + 3, m, 0, 0)).toISOString();
}

// POST: crea una "visita cotizada" (visita a un posible cliente, sin servicio ni
// GPS). Se guarda como un par ingreso + salida marcados con es_cotizada.
export async function POST(req) {
    try {
        const role = req.cookies.get('lasia_role')?.value;
        if (!ALLOWED_ROLES.includes(role)) {
            return Response.json({ error: 'No tenés permiso para agregar visitas.' }, { status: 403 });
        }

        const { supervisor_id, fecha, hora_ingreso, hora_egreso, nota } = await req.json();

        if (!supervisor_id) {
            return Response.json({ error: 'Elegí un supervisor.' }, { status: 400 });
        }
        if (!fecha || !DATE_RE.test(fecha)) {
            return Response.json({ error: 'Ingresá una fecha válida.' }, { status: 400 });
        }
        if (!hora_ingreso || !TIME_RE.test(hora_ingreso) || !hora_egreso || !TIME_RE.test(hora_egreso)) {
            return Response.json({ error: 'Ingresá horas válidas de ingreso y egreso (HH:MM).' }, { status: 400 });
        }
        if (hora_egreso <= hora_ingreso) {
            return Response.json({ error: 'La hora de egreso debe ser posterior a la de ingreso.' }, { status: 400 });
        }

        const notaLimpia = (nota || '').toString().trim() || null;

        const { error } = await supabase
            .from('supervisor_presentismo_logs')
            .insert([
                { supervisor_id, service_id: null, event_type: 'ingreso', es_cotizada: true, nota: notaLimpia, occurred_at: argToUtc(fecha, hora_ingreso) },
                { supervisor_id, service_id: null, event_type: 'salida', es_cotizada: true, nota: notaLimpia, occurred_at: argToUtc(fecha, hora_egreso) },
            ]);

        if (error) throw error;

        return Response.json({ success: true }, { status: 201 });
    } catch (error) {
        console.error('Error creando visita cotizada:', error);
        return Response.json({ error: 'No se pudo agregar la visita cotizada.' }, { status: 500 });
    }
}
