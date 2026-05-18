import { supabase } from '@/lib/db';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const employeeId = searchParams.get('employee_id');
        const status = searchParams.get('status');
        const type = searchParams.get('type');
        const beforeDate = searchParams.get('before_date'); // end_date < this date

        let query = supabase
            .from('licenses')
            .select(`
                *,
                employees:employee_id (nombre, apellido, legajo)
            `)
            .order('start_date', { ascending: false });

        if (employeeId) {
            query = query.eq('employee_id', employeeId);
        }

        if (beforeDate) {
            query = query.lt('end_date', beforeDate);
        } else if (status) {
            query = query.eq('status', status);
        }

        if (type) {
            query = query.eq('type', type);
        }
        
        const { data, error } = await query;
        
        if (error) {
            console.error('Error fetching licenses:', error);
            return Response.json({ error: 'Failed to fetch licenses: ' + error.message }, { status: 500 });
        }
        
        const transformed = data.map(row => ({
            ...row,
            nombre: row.employees?.nombre,
            apellido: row.employees?.apellido,
            legajo: row.employees?.legajo,
            start_date: row.start_date?.slice(0, 10),
            end_date: row.end_date?.slice(0, 10),
        }));
        
        return Response.json(transformed);
    } catch (error) {
        console.error('Error fetching licenses:', error.message);
        return Response.json({ error: 'Failed to fetch licenses: ' + error.message }, { status: 500 });
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
        const { data: existingLicenses, error: overlapError } = await supabase
            .from('licenses')
            .select('id')
            .eq('employee_id', employee_id)
            .eq('status', 'activa')
            .or(`and(start_date.lte.${end_date},end_date.gte.${start_date})`);
        
        if (overlapError) {
            console.error('Overlap check error:', overlapError);
        }
        
        if (existingLicenses && existingLicenses.length > 0) {
            return Response.json({ error: 'El empleado ya tiene una licencia en esas fechas' }, { status: 400 });
        }
        
        const { data: result, error } = await supabase
            .from('licenses')
            .insert([{
                employee_id,
                type,
                start_date,
                end_date,
                notes: notes || null,
                status: 'activa'
            }])
            .select()
            .single();
        
        if (error) {
            console.error('Error creating license:', error);
            return Response.json({ error: 'Failed to create license: ' + error.message }, { status: 500 });
        }
        
        return Response.json(result, { status: 201 });
    } catch (error) {
        console.error('Error creating license:', error.message);
        return Response.json({ error: 'Failed to create license: ' + error.message }, { status: 500 });
    }
}
