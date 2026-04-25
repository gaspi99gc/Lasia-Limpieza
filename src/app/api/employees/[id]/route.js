import { db } from '@/lib/db';

function getTrialEndDate(fechaIngreso) {
    if (!fechaIngreso) return null;

    const endDate = new Date(`${fechaIngreso}T12:00:00Z`);
    endDate.setUTCMonth(endDate.getUTCMonth() + 6);
    return endDate.toISOString().split('T')[0];
}

export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const data = await req.json();

        // Check if Legajo exists on another employee
        if (data.legajo) {
            const existing = await db.execute({
                sql: 'SELECT id FROM employees WHERE legajo = ? AND id != ?',
                args: [data.legajo, id]
            });
            if (existing.rows.length > 0) {
                return Response.json({ error: 'Ya existe un empleado con este Legajo' }, { status: 400 });
            }
        }

        // Build dynamic update query
        const updates = [];
        const args = [];

        if ('legajo' in data) {
            updates.push('legajo = ?');
            args.push(data.legajo || null);
        }
        if ('nombre' in data) {
            updates.push('nombre = ?');
            args.push(data.nombre);
        }
        if ('apellido' in data) {
            updates.push('apellido = ?');
            args.push(data.apellido);
        }
        if ('dni' in data) {
            updates.push('dni = ?');
            args.push(data.dni || null);
        }
        if ('cuil' in data) {
            updates.push('cuil = ?');
            args.push(data.cuil || null);
        }
        if ('fecha_ingreso' in data) {
            updates.push('fecha_ingreso = ?');
            args.push(data.fecha_ingreso || null);
            // Recalculate fecha_fin_prueba when fecha_ingreso changes
            updates.push('fecha_fin_prueba = ?');
            args.push(getTrialEndDate(data.fecha_ingreso));
        }
        if ('servicio_id' in data) {
            updates.push('servicio_id = ?');
            args.push(data.servicio_id || null);
        }
        if ('supervisor_id' in data) {
            updates.push('supervisor_id = ?');
            args.push(data.supervisor_id || null);
        }
        if ('estado_empleado' in data) {
            updates.push('estado_empleado = ?');
            args.push(data.estado_empleado);
        }
        if ('fecha_baja' in data) {
            updates.push('fecha_baja = ?');
            args.push(data.fecha_baja || null);
        }
        if ('motivo_baja' in data) {
            updates.push('motivo_baja = ?');
            args.push(data.motivo_baja || null);
        }

        if (updates.length === 0) {
            return Response.json({ error: 'No fields to update' }, { status: 400 });
        }

        args.push(id);

        await db.execute({
            sql: `UPDATE employees SET ${updates.join(', ')} WHERE id = ?`,
            args
        });

        // Fetch updated employee to return complete data
        const { rows } = await db.execute({
            sql: `SELECT e.*, s.name as service_name, sup.name as supervisor_name, sup.surname as supervisor_surname
                  FROM employees e
                  LEFT JOIN services s ON e.servicio_id = s.id
                  LEFT JOIN supervisors sup ON e.supervisor_id = sup.id
                  WHERE e.id = ?`,
            args: [id]
        });

        return Response.json(rows[0], { status: 200 });
    } catch (error) {
        console.error('Error updating employee:', error);
        return Response.json({ error: 'Failed to update employee' }, { status: 500 });
    }
}
