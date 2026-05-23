import { supabase } from '@/lib/db';

const BUCKET = 'employee-documents';

export async function DELETE(req, { params }) {
    try {
        const { id } = await params;

        const { data: doc, error: findErr } = await supabase
            .from('employee_documents')
            .select('id, file_path')
            .eq('id', id)
            .single();
        if (findErr || !doc) {
            return Response.json({ error: 'Documento no encontrado' }, { status: 404 });
        }

        if (doc.file_path) {
            try { await supabase.storage.from(BUCKET).remove([doc.file_path]); } catch {}
        }

        const { error } = await supabase.from('employee_documents').delete().eq('id', id);
        if (error) throw error;

        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting employee_document:', error);
        return Response.json({ error: 'Failed to delete document' }, { status: 500 });
    }
}
