import { supabase } from '@/lib/db';
import { randomUUID } from 'crypto';

const BUCKET = 'machine-incidents';
const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(req, { params }) {
    const uploadedPaths = [];
    try {
        const { id } = await params;
        const incidentId = Number(id);
        if (!incidentId) {
            return Response.json({ error: 'ID inválido' }, { status: 400 });
        }

        const { data: incident, error: findErr } = await supabase
            .from('machine_incidents')
            .select('id')
            .eq('id', incidentId)
            .single();
        if (findErr || !incident) {
            return Response.json({ error: 'Incidencia no encontrada' }, { status: 404 });
        }

        const form = await req.formData();
        const files = form.getAll('files').filter(f => f && typeof f === 'object' && 'arrayBuffer' in f);
        if (files.length === 0) {
            return Response.json({ error: 'No se recibieron archivos' }, { status: 400 });
        }
        for (const f of files) {
            if (!/^(image|video)\//.test(f.type || '')) {
                return Response.json({ error: `Archivo no permitido: ${f.name}. Solo fotos o videos.` }, { status: 400 });
            }
            if (f.size > MAX_BYTES) {
                return Response.json({ error: `Archivo demasiado grande: ${f.name} (máx 50 MB).` }, { status: 400 });
            }
        }

        const rows = [];
        for (const f of files) {
            const buf = Buffer.from(await f.arrayBuffer());
            const safeName = f.name.replace(/[^\w.\-]+/g, '_');
            const path = `${incidentId}/${randomUUID()}-${safeName}`;
            const { error: upErr } = await supabase.storage
                .from(BUCKET)
                .upload(path, buf, { contentType: f.type, upsert: false });
            if (upErr) throw upErr;
            uploadedPaths.push(path);
            rows.push({
                incident_id: incidentId,
                file_path: path,
                file_name: f.name,
                mime_type: f.type,
                size_bytes: f.size,
            });
        }

        const { data: inserted, error: attErr } = await supabase
            .from('machine_incident_attachments')
            .insert(rows)
            .select('id, file_path, file_name, mime_type, size_bytes');
        if (attErr) throw attErr;

        const { data: signed, error: signErr } = await supabase.storage
            .from(BUCKET)
            .createSignedUrls(inserted.map(r => r.file_path), 60 * 60);
        if (signErr) throw signErr;
        const byPath = new Map(signed.map(s => [s.path, s.signedUrl]));
        const attachments = inserted.map(r => ({
            id: r.id,
            file_name: r.file_name,
            mime_type: r.mime_type,
            size_bytes: r.size_bytes,
            url: byPath.get(r.file_path) || null,
        }));

        return Response.json({ attachments }, { status: 201 });
    } catch (error) {
        console.error('Error adding attachment:', error);
        if (uploadedPaths.length) {
            try { await supabase.storage.from(BUCKET).remove(uploadedPaths); } catch {}
        }
        return Response.json({ error: error?.message || 'Failed to add attachment' }, { status: 500 });
    }
}
