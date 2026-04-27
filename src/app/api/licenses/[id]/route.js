import { db } from '@/lib/db';

export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const data = await req.json();
        const { employee_id, type, start_date, end_date, notes, status } = data;
        
        if (!employee_id || !type || !start_date || !end_date) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }
        
        // Validar que no haya solapamiento (excluyendo la licencia actual)
        const overlapCheck = await db.execute({
            sql: `
                SELECT id FROM licenses 
                WHERE employee_id = ? 
                AND status = 'activa'
                AND id != ?
                AND (
                    (start_date <= ? AND end_date >= ?) OR
                    (start_date <= ? AND end_date >= ?) OR
                    (start_date >= ? AND end_date <= ?)
                )
            `,
            args: [employee_id, id, end_date, start_date, end_date, start_date, start_date, end_date]
        });
        
        if (overlapCheck.rows.length > 0) {
            return Response.json({ error: 'El empleado ya tiene una licencia en esas fechas' }, { status: 400 });
        }
        
        await db.execute({
            sql: `UPDATE licenses 
                  SET employee_id = ?, type = ?, start_date = ?, end_date = ?, notes = ?, status = ?, updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?`,
            args: [employee_id, type, start_date, end_date, notes || null, status || 'activa', id]
        });
        
        return Response.json({ id: parseInt(id), ...data });
    } catch (error) {
        console.error('Error updating license:', error);
        return Response.json({ error: 'Failed to update license' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        const { id } = await params;
        
        await db.execute({
            sql: 'DELETE FROM licenses WHERE id = ?',
            args: [id]
        });
        
        return Response.json({ message: 'License deleted successfully' });
    } catch (error) {
        console.error('Error deleting license:', error);
        return Response.json({ error: 'Failed to delete license' }, { status: 500 });
    }
}
