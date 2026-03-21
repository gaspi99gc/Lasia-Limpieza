import { db } from '@/lib/db';
import { ensureSupervisorStatusTable } from '@/lib/supervisor-status';

export async function GET(req) {
    try {
        await ensureSupervisorStatusTable();

        const { searchParams } = new URL(req.url);
        const supervisorId = searchParams.get('supervisor_id');
        const serviceId = searchParams.get('service_id');
        const days = Number(searchParams.get('days'));

        let query = `
            SELECT pl.id, pl.event_type, pl.occurred_at,
                   s.id AS service_id, s.name AS service_name, s.address AS service_address,
                   sup.id AS supervisor_id, sup.name AS supervisor_name, sup.surname AS supervisor_surname, sup.dni AS supervisor_dni
            FROM supervisor_presentismo_logs pl
            JOIN services s ON s.id = pl.service_id
            JOIN supervisors sup ON sup.id = pl.supervisor_id
        `;

        const conditions = [];
        const args = [];

        if (supervisorId) {
            conditions.push('pl.supervisor_id = ?');
            args.push(supervisorId);
        }

        if (serviceId) {
            conditions.push('pl.service_id = ?');
            args.push(serviceId);
        }

        if (Number.isFinite(days) && days > 0) {
            conditions.push(`datetime(pl.occurred_at, '-3 hours') >= datetime('now', '-3 hours', ?)`);
            args.push(`-${days} days`);
        }

        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }

        query += ' ORDER BY pl.occurred_at DESC';

        const { rows } = await db.execute({ sql: query, args });
        return Response.json(rows);
    } catch (error) {
        console.error('Error fetching presentismo logs:', error);
        return Response.json({ error: 'No se pudieron obtener los logs de presentismo' }, { status: 500 });
    }
}
