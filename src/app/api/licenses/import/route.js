import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

export async function POST(req) {
    try {
        const formData = await req.formData();
        const file = formData.get('file');
        
        if (!file) {
            return Response.json({ error: 'No file provided' }, { status: 400 });
        }
        
        const bytes = await file.arrayBuffer();
        const workbook = XLSX.read(bytes, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(worksheet);
        
        let addedCount = 0;
        let errors = [];
        
        for (const row of data) {
            const legajo = row.Legajo || row.legajo;
            const nombre = row.Nombre || row.nombre;
            const apellido = row.Apellido || row.apellido;
            const type = (row['Tipo Licencia'] || row.tipo_licencia || row.type || '').toLowerCase();
            const startDate = row['Fecha Inicio'] || row.fecha_inicio || row.start_date;
            const endDate = row['Fecha Fin'] || row.fecha_fin || row.end_date;
            const notes = row.Observaciones || row.observaciones || row.notes || '';
            
            if (!legajo || !type || !startDate || !endDate) {
                errors.push(`Fila incompleta: ${JSON.stringify(row)}`);
                continue;
            }
            
            // Buscar empleado por legajo
            const empResult = await db.execute({
                sql: 'SELECT id FROM employees WHERE legajo = ?',
                args: [legajo]
            });
            
            if (empResult.rows.length === 0) {
                errors.push(`Empleado no encontrado: ${legajo}`);
                continue;
            }
            
            const employee_id = empResult.rows[0].id;
            
            // Validar tipo de licencia
            const validTypes = ['vacaciones', 'enfermedad', 'maternidad', 'paternidad', 'psiquiatrica', 'sin_goce'];
            if (!validTypes.includes(type)) {
                errors.push(`Tipo de licencia inválido: ${type}`);
                continue;
            }
            
            // Validar solapamiento
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
                args: [employee_id, endDate, startDate, endDate, startDate, startDate, endDate]
            });
            
            if (overlapCheck.rows.length > 0) {
                errors.push(`Solapamiento para ${legajo}: ${startDate} a ${endDate}`);
                continue;
            }
            
            try {
                await db.execute({
                    sql: `INSERT INTO licenses (employee_id, type, start_date, end_date, notes, status) 
                          VALUES (?, ?, ?, ?, ?, 'activa')`,
                    args: [employee_id, type, startDate, endDate, notes]
                });
                addedCount++;
            } catch (e) {
                errors.push(`Error insertando ${legajo}: ${e.message}`);
            }
        }
        
        return Response.json({ 
            message: `Importación completada. ${addedCount} licencias agregadas.`,
            added: addedCount,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('Error importing licenses:', error);
        return Response.json({ error: 'Failed to import licenses' }, { status: 500 });
    }
}

export async function GET() {
    try {
        const { rows } = await db.execute(`
            SELECT l.*, e.nombre, e.apellido, e.legajo, e.servicio_id, s.name as service_name
            FROM licenses l
            JOIN employees e ON l.employee_id = e.id
            LEFT JOIN services s ON e.servicio_id = s.id
            ORDER BY l.start_date DESC
        `);
        
        // Convertir a Excel
        const data = rows.map(row => ({
            'Legajo': row.legajo,
            'Apellido': row.apellido,
            'Nombre': row.nombre,
            'Tipo Licencia': row.type,
            'Fecha Inicio': row.start_date,
            'Fecha Fin': row.end_date,
            'Observaciones': row.notes,
            'Estado': row.status
        }));
        
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Licencias');
        
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        return new Response(buf, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': 'attachment; filename="licencias.xlsx"'
            }
        });
    } catch (error) {
        console.error('Error exporting licenses:', error);
        return Response.json({ error: 'Failed to export licenses' }, { status: 500 });
    }
}
