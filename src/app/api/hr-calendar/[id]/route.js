import { supabase } from '@/lib/db';

export const runtime = 'nodejs';

// Soft delete. Solo admin/rrhh pueden borrar cualquiera; el resto solo los propios.
export async function DELETE(req, { params }) {
    try {
        const { id } = await params;
        const { searchParams } = new URL(req.url);
        const userRol = searchParams.get('user_rol');
        const userId = searchParams.get('user_id');

        if (!id) {
            return Response.json({ error: 'Falta el id.' }, { status: 400 });
        }

        const { data: existing, error: fetchErr } = await supabase
            .from('hr_calendar_events')
            .select('id, creado_por_id')
            .eq('id', id)
            .eq('eliminado', false)
            .single();

        if (fetchErr || !existing) {
            return Response.json({ error: 'Evento no encontrado.' }, { status: 404 });
        }

        const esAdminORrhh = userRol === 'admin' || userRol === 'rrhh';
        const esPropio = userId && existing.creado_por_id === userId;
        if (!esAdminORrhh && !esPropio) {
            return Response.json({ error: 'No tenés permiso para borrar este evento.' }, { status: 403 });
        }

        const { error } = await supabase
            .from('hr_calendar_events')
            .update({ eliminado: true, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;

        return Response.json({ ok: true });
    } catch (error) {
        console.error('Error deleting hr_calendar_event:', error);
        return Response.json({ error: 'Failed to delete event' }, { status: 500 });
    }
}
