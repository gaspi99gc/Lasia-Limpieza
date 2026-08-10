import { supabase } from '@/lib/db';
import { getSupervisorScope } from '@/lib/apiAuth';

async function fetchRoutesWithService(supervisorId) {
    const { data, error } = await supabase
        .from('supervisor_routes')
        .select('*, services:service_id(name, address, lat, lng)')
        .eq('supervisor_id', supervisorId)
        .order('route_order', { ascending: true });

    if (error) throw error;

    return (data || []).map(row => ({
        ...row,
        service_name: row.services?.name || null,
        service_address: row.services?.address || null,
        lat: row.services?.lat || null,
        lng: row.services?.lng || null,
        services: undefined,
    }));
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);

        // Un supervisor solo consulta su propia ruta, sin importar que id mande.
        const { supervisorId, forced } = await getSupervisorScope(req, searchParams.get('supervisor_id'));
        if (!supervisorId) {
            if (forced) return Response.json([]);
            return Response.json({ error: 'supervisor_id is required' }, { status: 400 });
        }

        const rows = await fetchRoutesWithService(supervisorId);
        return Response.json(rows);
    } catch (error) {
        console.error('Error fetching supervisor routes:', error);
        return Response.json({ error: 'Failed to fetch routes' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const body = await req.json();
        const { services } = body;

        // Sin esto un supervisor podia reescribir la ruta de otro.
        const { supervisorId: supervisor_id } = await getSupervisorScope(req, body.supervisor_id);

        if (!supervisor_id || !services || !Array.isArray(services)) {
            return Response.json({ error: 'supervisor_id and services array required' }, { status: 400 });
        }

        await supabase.from('supervisor_routes').delete().eq('supervisor_id', supervisor_id);

        if (services.length > 0) {
            await supabase.from('supervisor_routes').insert(
                services.map(svc => ({
                    supervisor_id,
                    service_id: svc.service_id,
                    route_order: svc.route_order,
                }))
            );
        }

        const rows = await fetchRoutesWithService(supervisor_id);
        return Response.json(rows, { status: 201 });
    } catch (error) {
        console.error('Error saving supervisor routes:', error);
        return Response.json({ error: 'Failed to save routes' }, { status: 500 });
    }
}
