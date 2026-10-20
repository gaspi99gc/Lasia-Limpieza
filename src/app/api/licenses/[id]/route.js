import { supabase } from '@/lib/db';
import { sincronizarConLicencia, anularPorLicencia } from '@/lib/vacaciones-licencias';

export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const data = await req.json();
        const { employee_id, type, start_date, end_date, notes, status } = data;
        
        if (!employee_id || !type || !start_date || !end_date) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }
        
        // Validar que no haya solapamiento (excluyendo la licencia actual)
        const { data: existingLicenses, error: overlapError } = await supabase
            .from('licenses')
            .select('id')
            .eq('employee_id', employee_id)
            .eq('status', 'activa')
            .neq('id', id)
            .or(`and(start_date.lte.${end_date},end_date.gte.${start_date})`);
        
        if (overlapError) {
            console.error('Overlap check error:', overlapError);
        }
        
        if (existingLicenses && existingLicenses.length > 0) {
            return Response.json({ error: 'El empleado ya tiene una licencia en esas fechas' }, { status: 400 });
        }
        
        const { data: result, error } = await supabase
            .from('licenses')
            .update({
                employee_id,
                type,
                start_date,
                end_date,
                notes: notes || null,
                status: status || 'activa'
            })
            .eq('id', id)
            .select()
            .single();
        
        if (error) {
            console.error('Error updating license:', error);
            return Response.json({ error: 'Failed to update license: ' + error.message }, { status: 500 });
        }
        
        // Si descontaba vacaciones, el saldo sigue a la licencia.
        const aviso_vacaciones = await sincronizarConLicencia(req, result);
        return Response.json({ ...result, aviso_vacaciones });
    } catch (error) {
        console.error('Error updating license:', error.message);
        return Response.json({ error: 'Failed to update license: ' + error.message }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        const { id } = await params;

        // Si descontaba vacaciones, los días vuelven al saldo.
        await anularPorLicencia(req, Number(id));
        
        const { error } = await supabase
            .from('licenses')
            .delete()
            .eq('id', id);
        
        if (error) {
            console.error('Error deleting license:', error);
            return Response.json({ error: 'Failed to delete license: ' + error.message }, { status: 500 });
        }
        
        return Response.json({ message: 'License deleted successfully' });
    } catch (error) {
        console.error('Error deleting license:', error.message);
        return Response.json({ error: 'Failed to delete license: ' + error.message }, { status: 500 });
    }
}
