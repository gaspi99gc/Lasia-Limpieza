import { supabase } from '@/lib/db';
import { getSupervisorStatus, updateSupervisorStatus, updateSupervisorStatusWithService } from '@/lib/supervisor-status';

function getErrorStatus(error) {
    const message = error?.message?.toLowerCase() || '';
    return message.includes('seleccion') || message.includes('servicio') || message.includes('estado invalido') || message.includes('coordenadas')
        ? 400
        : 500;
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const supervisorId = searchParams.get('supervisor_id');
        const statusFilter = searchParams.get('status');

        if (statusFilter) {
            const dbStatuses = statusFilter === 'trabajando' ? ['trabajando', 'chambeando'] : [statusFilter];

            const { data, error } = await supabase
                .from('supervisor_status')
                .select('supervisor_id, status, current_service_id, entered_at, exited_at, updated_at, supervisors(id, app_users(name, surname, username)), services(name, address)')
                .in('status', dbStatuses);

            if (error) throw error;

            const rows = (data || [])
                .map(row => ({
                    supervisor_id: row.supervisor_id,
                    status: row.status,
                    current_service_id: row.current_service_id,
                    entered_at: row.entered_at,
                    exited_at: row.exited_at,
                    updated_at: row.updated_at,
                    current_service_name: row.services?.name || null,
                    current_service_address: row.services?.address || null,
                    supervisor_name: row.supervisors?.app_users?.name || null,
                    supervisor_surname: row.supervisors?.app_users?.surname || null,
                    supervisor_dni: row.supervisors?.app_users?.username || null,
                }))
                .sort((a, b) => {
                    const byEntered = (a.entered_at || '').localeCompare(b.entered_at || '');
                    if (byEntered !== 0) return byEntered;
                    const bySurname = (a.supervisor_surname || '').localeCompare(b.supervisor_surname || '');
                    if (bySurname !== 0) return bySurname;
                    return (a.supervisor_name || '').localeCompare(b.supervisor_name || '');
                });

            return Response.json(rows);
        }

        if (!supervisorId) {
            return Response.json({ error: 'supervisor_id es requerido' }, { status: 400 });
        }

        const status = await getSupervisorStatus(supervisorId);
        return Response.json(status);
    } catch (error) {
        console.error('Error fetching supervisor status:', error);
        return Response.json({ error: 'No se pudo obtener el estado del supervisor' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { supervisor_id, status, service_id, lat, lng } = await req.json();

        if (!supervisor_id) {
            return Response.json({ error: 'supervisor_id es requerido' }, { status: 400 });
        }

        if (!['afuera', 'trabajando'].includes(status)) {
            return Response.json({ error: 'Estado invalido' }, { status: 400 });
        }

        const { data: sup, error: supError } = await supabase
            .from('supervisors')
            .select('id')
            .eq('id', supervisor_id)
            .maybeSingle();

        if (supError) throw supError;
        if (!sup) {
            return Response.json({ error: 'Supervisor no encontrado' }, { status: 404 });
        }

        if (status === 'trabajando') {
            if (!service_id) {
                return Response.json({ error: 'Seleccioná un servicio antes de ingresar.' }, { status: 400 });
            }

            const { data: service, error: serviceError } = await supabase
                .from('services')
                .select('id')
                .eq('id', service_id)
                .maybeSingle();

            if (serviceError) throw serviceError;
            if (!service) {
                return Response.json({ error: 'Servicio no encontrado' }, { status: 404 });
            }

            const nextStatus = await updateSupervisorStatusWithService(supervisor_id, status, service_id, { lat, lng });
            return Response.json(nextStatus);
        }

        const nextStatus = await updateSupervisorStatus(supervisor_id, status);
        return Response.json(nextStatus);
    } catch (error) {
        console.error('Error updating supervisor status:', error);
        return Response.json({ error: error.message || 'No se pudo actualizar el estado del supervisor' }, { status: getErrorStatus(error) });
    }
}
