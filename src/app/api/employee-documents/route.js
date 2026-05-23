import { supabase } from '@/lib/db';
import { randomUUID } from 'crypto';

const BUCKET = 'employee-documents';
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB (docs: PDF o imagen)

async function withSignedUrl(row) {
    if (!row?.file_path) return { ...row, url: null };
    const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(row.file_path, 60 * 60); // 1 h
    return { ...row, url: signed?.signedUrl || null };
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const empleadoId = searchParams.get('empleado_id');

        let query = supabase
            .from('employee_documents')
            .select('id, empleado_id, documento_tipo_id, file_path, file_name, mime_type, size_bytes, fecha_vencimiento, cargado_por, created_at')
            .order('created_at', { ascending: false });

        if (empleadoId) query = query.eq('empleado_id', empleadoId);

        const { data, error } = await query;
        if (error) throw error;

        const rows = await Promise.all((data || []).map(withSignedUrl));
        return Response.json(rows);
    } catch (error) {
        console.error('Error fetching employee_documents:', error);
        return Response.json({ error: 'Failed to fetch documents' }, { status: 500 });
    }
}

export async function POST(req) {
    let uploadedPath = null;
    try {
        const form = await req.formData();
        const empleadoId = Number(form.get('empleado_id'));
        const documentoTipoId = Number(form.get('documento_tipo_id'));
        const fechaVencimiento = (form.get('fecha_vencimiento') || '').toString().trim() || null;
        const cargadoPor = (form.get('cargado_por') || '').toString().trim() || null;
        const file = form.get('file');

        if (!empleadoId || !documentoTipoId) {
            return Response.json({ error: 'empleado_id y documento_tipo_id son obligatorios' }, { status: 400 });
        }
        if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
            return Response.json({ error: 'Archivo obligatorio' }, { status: 400 });
        }
        if (!/^(image\/|application\/pdf)/.test(file.type || '')) {
            return Response.json({ error: 'Solo se permiten imágenes o PDF' }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
            return Response.json({ error: `Archivo demasiado grande: ${file.name} (máx 25 MB).` }, { status: 400 });
        }

        const buf = Buffer.from(await file.arrayBuffer());
        const safeName = file.name.replace(/[^\w.\-]+/g, '_');
        const path = `${empleadoId}/${randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .upload(path, buf, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        uploadedPath = path;

        const { data, error } = await supabase
            .from('employee_documents')
            .insert({
                empleado_id: empleadoId,
                documento_tipo_id: documentoTipoId,
                file_path: path,
                file_name: file.name,
                mime_type: file.type,
                size_bytes: file.size,
                fecha_vencimiento: fechaVencimiento,
                cargado_por: cargadoPor,
            })
            .select()
            .single();
        if (error) throw error;

        const withUrl = await withSignedUrl(data);
        return Response.json(withUrl, { status: 201 });
    } catch (error) {
        console.error('Error creating employee_document:', error);
        if (uploadedPath) {
            try { await supabase.storage.from(BUCKET).remove([uploadedPath]); } catch {}
        }
        return Response.json({ error: error?.message || 'Failed to create document' }, { status: 500 });
    }
}
