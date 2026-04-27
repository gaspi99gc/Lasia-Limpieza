import { db } from '@/lib/db';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const employeeId = searchParams.get('employee_id');
        const status = searchParams.get('status');
        const type = searchParams.get('type');
        
        let sql = `
            SELECT l.*, e.nombre, e.apellido, e.legajo, e.servicio_id, s.name as service_name
            FROM licenses l
            JOIN employees e ON l.employee_id = e.id
            LEFT JOIN services s ON e.servicio_id = s.id
            WHERE 1=1
        `;
        const args = [];
        
        if (employeeId) {
            sql += ' AND l.employee_id = ?';
            args.push(employeeId);
        }
        
        if (status) {
            sql += ' AND l.status = ?';
            args.push(status);
        }
        
        if (type) {
            sql += ' AND l.type = ?';
            args.push(type);
        }
        
        sql += ' ORDER BY l.start_date DESC';
        
        const { rows } = await db.execute({ sql, args });
        return Response.json(rows);
    } catch (error) {
        console.error('Error fetching licenses:', error);
        return Response.json({ error: 'Failed to fetch licenses' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const data = await req.json();
        const { employee_id, type, start_date, end_date, notes } = data;
        
        if (!employee_id || !type || !start_date || !end_date) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }
        
        // Validar que no haya solapamiento
        const overlapCheck = await db.execute({
            sql: `
                SELECT id FROM licenses 
                WHERE employee_id = ? 
                AND status = 'activa'
                AND (
                    (start_date <= ? AND end_date >= ?) OR
                    (start_date <= ? AND end_date >= ?) OR
                    (start_date >= ? AND end_date <= ?)
                )
            `,
            args: [employee_id, end_date, start_date, end_date, start_date, start_date, end_date]
        });
        
        if (overlapCheck.rows.length > 0) {
            return Response.json({ error: 'El empleado ya tiene una licencia en esas fechas' }, { status: 400 });
        }
        
        const result = await db.execute({
            sql: `INSERT INTO licenses (employee_id, type, start_date, end_date, notes, status) 
                  VALUES (?, ?, ?, ?, ?, 'activa') RETURNING id`,
            args: [employee_id, type, start_date, end_date, notes || null]
        });
        
        return Response.json({ id: result.rows[0].id, ...data, status: 'activa' }, { status: 201 });
    } catch (error) {
        console.error('Error creating license:', error);
        return Response.json({ error: 'Failed to create license' }, { status: 500 });
    }
}
