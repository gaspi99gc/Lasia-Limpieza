import { supabase } from '@/lib/db';

export const runtime = 'nodejs';

// Cuenta las visitas de un supervisor a cada servicio en un rango de fechas.
// Una "visita" = una fichada de INGRESO en un servicio real (las cotizadas,
// sin servicio asignado, quedan afuera). Los datos salen de las fichadas que
// ya se registran (supervisor_presentismo_logs).

const PAGE = 1000;

// Argentina es UTC-3 fijo. El rango [date_from 00:00, date_to 23:59:59.999] ART
// se traduce a UTC sumando 3 horas al inicio del día.
function rangoUTC(dateFrom, dateTo) {
    const start = new Date(dateFrom + 'T03:00:00.000Z');
    const end = new Date(dateTo + 'T03:00:00.000Z');
    end.setUTCDate(end.getUTCDate() + 1);
    end.setUTCMilliseconds(-1); // 23:59:59.999 ART del date_to
    return { start, end };
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const supervisorId = searchParams.get('supervisor_id');
        const dateFrom = searchParams.get('date_from');
        const dateTo = searchParams.get('date_to');

        if (!supervisorId) {
            return Response.json({ error: 'supervisor_id es requerido' }, { status: 400 });
        }
        const dateRe = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateFrom || !dateTo || !dateRe.test(dateFrom) || !dateRe.test(dateTo)) {
            return Response.json({ error: 'date_from y date_to (YYYY-MM-DD) son requeridos' }, { status: 400 });
        }
        if (dateFrom > dateTo) {
            return Response.json({ error: 'La fecha de inicio no puede ser posterior a la de fin.' }, { status: 400 });
        }

        const { start, end } = rangoUTC(dateFrom, dateTo);

        // Nombre del supervisor.
        const { data: supData } = await supabase
            .from('supervisors')
            .select('id, app_users:app_user_id(name, surname)')
            .eq('id', supervisorId)
            .single();
        const supNombre = supData
            ? `${supData.app_users?.surname || ''}, ${supData.app_users?.name || ''}`.trim().replace(/^,\s*/, '')
            : 'Supervisor';

        // Traer los ingresos del supervisor en el rango (paginado). Solo ingresos:
        // cada uno es una visita. Excluimos cotizadas (es_cotizada) y sin servicio.
        const ingresos = [];
        for (let from = 0; ; from += PAGE) {
            const { data, error } = await supabase
                .from('supervisor_presentismo_logs')
                .select('service_id, es_cotizada, services:service_id(name)')
                .eq('supervisor_id', supervisorId)
                .eq('event_type', 'ingreso')
                .gte('occurred_at', start.toISOString())
                .lte('occurred_at', end.toISOString())
                .range(from, from + PAGE - 1);
            if (error) throw error;
            ingresos.push(...(data || []));
            if (!data || data.length < PAGE) break;
        }

        // Contar por servicio (solo servicios reales).
        const porServicio = new Map();
        let cotizadas = 0;
        for (const ev of ingresos) {
            if (ev.es_cotizada || !ev.service_id) { if (ev.es_cotizada) cotizadas++; continue; }
            const nombre = ev.services?.name || 'Sin nombre';
            const actual = porServicio.get(ev.service_id) || { service_id: ev.service_id, service_name: nombre, visitas: 0 };
            actual.visitas += 1;
            porServicio.set(ev.service_id, actual);
        }

        const servicios = [...porServicio.values()].sort((a, b) => b.visitas - a.visitas);
        const totalVisitas = servicios.reduce((acc, s) => acc + s.visitas, 0);

        return Response.json({
            supervisor: { id: Number(supervisorId), nombre: supNombre },
            dateFrom,
            dateTo,
            totalVisitas,                       // total de visitas a servicios reales
            serviciosDistintos: servicios.length,
            cotizadas,                          // visitas cotizadas (informativo, no suma al total)
            servicios,                          // [{ service_id, service_name, visitas }] ordenado desc
        });
    } catch (error) {
        console.error('Error en visitas-supervisor:', error);
        return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
}
