import { supabase } from '@/lib/db';

const BUCKET = 'machine-incidents';

export async function DELETE(req, { params }) {
    try {
        const { id, attId } = await params;

        const { data: att, error: findErr } = await supabase
            .from('machine_incident_attachments')
            .select('id, file_path')
            .eq('id', attId)
            .eq('incident_id', id)
            .single();
        if (findErr || !att) {
            return Response.json({ error: 'Adjunto no encontrado' }, { status: 404 });
        }

        try { await supabase.storage.from(BUCKET).remove([att.file_path]); } catch {}

        const { error } = await supabase
            .from('machine_incident_attachments')
            .delete()
            .eq('id', attId);
        if (error) throw error;

        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting attachment:', error);
        return Response.json({ error: 'Failed to delete attachment' }, { status: 500 });
    }
}
