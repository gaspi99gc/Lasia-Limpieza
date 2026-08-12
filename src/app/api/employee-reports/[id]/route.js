import { supabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/authCookie';

export async function DELETE(req, { params }) {
    try {
        // Solo admin puede borrar informes (registro histórico).
        const session = await getSessionFromRequest(req);
        if (session?.role !== 'admin') {
            return Response.json({ error: 'Solo un administrador puede eliminar informes.' }, { status: 403 });
        }

        const { id } = await params;
        const { error } = await supabase.from('employee_reports').delete().eq('id', id);
        if (error) throw error;

        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting employee_report:', error);
        return Response.json({ error: 'Failed to delete report' }, { status: 500 });
    }
}
