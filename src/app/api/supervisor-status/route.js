import { db } from '@/lib/db';
import { ensureSupervisorStatusTable, getSupervisorStatus, updateSupervisorStatus, updateSupervisorStatusWithService } from '@/lib/supervisor-status';

function getErrorStatus(error) {
    const message = error?.message?.toLowerCase() || '';
    return message.includes('seleccion') || message.includes('servicio') || message.includes('estado invalido')
        ? 400
        : 500;
}

export async function GET(req) {
    try {
        await ensureSupervisorStatusTable();

        const { searchParams } = new URL(req.url);
        const supervisorId = searchParams.get('supervisor_id');
        const statusFilter = searchParams.get('status');

        if (statusFilter) {
            const normalizedStatus = statusFilter === 'trabajando' ? 'chambeando' : statusFilter;

            const { rows } = await db.execute({
                sql: `SELECT ss.supervisor_id, ss.status, ss.current_service_id, ss.entered_at, ss.exited_at, ss.updated_at,
                             s.name AS current_service_name, s.address AS current_service_address,
                             sup.name AS supervisor_name, sup.surname AS supervisor_surname, sup.dni AS supervisor_dni
                      FROM supervisor_status ss
                      JOIN supervisors sup ON sup.id = ss.supervisor_id
                      LEFT JOIN services s ON s.id = ss.current_service_id
                      WHERE ss.status = ?
                      ORDER BY ss.entered_at ASC, sup.surname ASC, sup.name ASC`,
                args: [normalizedStatus]
            });

            return Response.json(rows);
        }

        if (!supervisorId) {
            return Response.json({ error: 'supervisor_id es requerido' }, { status: 400 });
        }

        const { rows } = await db.execute({
            sql: 'SELECT id FROM supervisors WHERE id = ?',
            args: [supervisorId]
        });

        if (rows.length === 0) {
            return Response.json({ error: 'Supervisor no encontrado' }, { status: 404 });
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
        const { supervisor_id, status, service_id } = await req.json();

        if (!supervisor_id) {
            return Response.json({ error: 'supervisor_id es requerido' }, { status: 400 });
        }

        if (!['afuera', 'trabajando', 'chambeando'].includes(status)) {
            return Response.json({ error: 'Estado invalido' }, { status: 400 });
        }

        const { rows } = await db.execute({
            sql: 'SELECT id FROM supervisors WHERE id = ?',
            args: [supervisor_id]
        });

        if (rows.length === 0) {
            return Response.json({ error: 'Supervisor no encontrado' }, { status: 404 });
        }

        if (status === 'chambeando' || status === 'trabajando') {
            if (!service_id) {
                return Response.json({ error: 'Seleccioná un servicio antes de ingresar.' }, { status: 400 });
            }

            const { rows: serviceRows } = await db.execute({
                sql: 'SELECT id FROM services WHERE id = ?',
                args: [service_id]
            });

            if (serviceRows.length === 0) {
                return Response.json({ error: 'Servicio no encontrado' }, { status: 404 });
            }

            const nextStatus = await updateSupervisorStatusWithService(supervisor_id, status, service_id);
            return Response.json(nextStatus);
        }

        const nextStatus = await updateSupervisorStatus(supervisor_id, status);
        return Response.json(nextStatus);
    } catch (error) {
        console.error('Error updating supervisor status:', error);
        return Response.json({ error: error.message || 'No se pudo actualizar el estado del supervisor' }, { status: getErrorStatus(error) });
    }
}
