import { supabase } from '@/lib/db';

const ESTADOS = ['abierto', 'en_proceso', 'resuelto'];
const BUCKET = 'maintenance-tickets';
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

async function attachSignedUrls(rows) {
    if (!rows?.length) return [];
    const paths = rows.map(r => r.file_path);
    const { data: signed, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, 60 * 60); // 1 h
    if (error) throw error;
    const byPath = new Map(signed.map(s => [s.path, s.signedUrl]));
    return rows.map(r => ({
        id: r.id,
        file_name: r.file_name,
        mime_type: r.mime_type,
        size_bytes: r.size_bytes,
        url: byPath.get(r.file_path) || null,
    }));
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const estado = searchParams.get('estado');
        const serviceId = searchParams.get('service_id');
        const reporterId = searchParams.get('reporter_id');

        let query = supabase
            .from('maintenance_tickets')
            .select('id, service_id, titulo, descripcion, estado, reportado_por_id, reportado_por_nombre, created_at, updated_at, services(name), maintenance_ticket_attachments(id, file_path, file_name, mime_type, size_bytes), maintenance_ticket_comments(id)')
            .order('created_at', { ascending: false });

        if (estado) query = query.eq('estado', estado);
        if (serviceId) query = query.eq('service_id', serviceId);
        if (reporterId) query = query.eq('reportado_por_id', reporterId);

        const { data, error } = await query;
        if (error) throw error;

        const flat = await Promise.all((data || []).map(async (r) => ({
            id: r.id,
            service_id: r.service_id,
            service_name: r.services?.name || null,
            titulo: r.titulo,
            descripcion: r.descripcion,
            estado: r.estado,
            reportado_por_id: r.reportado_por_id || null,
            reportado_por_nombre: r.reportado_por_nombre || null,
            created_at: r.created_at,
            updated_at: r.updated_at,
            attachments: await attachSignedUrls(r.maintenance_ticket_attachments || []),
            comment_count: (r.maintenance_ticket_comments || []).length,
        })));

        return Response.json(flat);
    } catch (error) {
        console.error('Error fetching maintenance_tickets:', error);
        return Response.json({ error: 'Failed to fetch tickets' }, { status: 500 });
    }
}

// Crea el ticket con archivos que el cliente ya subio DIRECTO a Storage
// usando las URLs firmadas que devuelve /api/maintenance-tickets/sign-uploads.
// Body JSON: { service_id, titulo, descripcion,
//              reportado_por_id, reportado_por_nombre,
//              attachments: [{path, file_name, mime_type, size_bytes}] }
export async function POST(req) {
    let createdId = null;
    const movedPaths = [];
    try {
        const body = await req.json();
        const service_id = Number(body.service_id);
        const titulo = (body.titulo || '').toString().trim();
        const descripcion = (body.descripcion || '').toString().trim();
        const reportado_por_id = body.reportado_por_id ? Number(body.reportado_por_id) : null;
        const reportado_por_nombre = (body.reportado_por_nombre || '').toString().trim() || null;
        const attachments = Array.isArray(body.attachments) ? body.attachments : [];

        if (!service_id) {
            return Response.json({ error: 'El servicio es obligatorio.' }, { status: 400 });
        }
        if (!titulo) {
            return Response.json({ error: 'El título es obligatorio.' }, { status: 400 });
        }
        if (!descripcion) {
            return Response.json({ error: 'La descripción es obligatoria.' }, { status: 400 });
        }
        if (attachments.length === 0) {
            return Response.json({ error: 'Debés adjuntar al menos una foto o video del incidente.' }, { status: 400 });
        }
        for (const a of attachments) {
            if (!a?.path || !a?.file_name || !a?.mime_type) {
                return Response.json({ error: 'Cada adjunto requiere path, file_name y mime_type.' }, { status: 400 });
            }
            if (!/^(image|video)\//.test(a.mime_type)) {
                return Response.json({ error: `Archivo no permitido: ${a.file_name}. Solo fotos o videos.` }, { status: 400 });
            }
            const size = Number(a.size_bytes) || 0;
            if (size > MAX_BYTES) {
                return Response.json({ error: `Archivo demasiado grande: ${a.file_name} (máx 50 MB).` }, { status: 400 });
            }
            if (!a.path.startsWith('_drafts/')) {
                return Response.json({ error: 'Path de archivo inválido.' }, { status: 400 });
            }
        }

        const { data: ticket, error: insErr } = await supabase
            .from('maintenance_tickets')
            .insert({
                service_id,
                titulo,
                descripcion,
                estado: 'abierto',
                reportado_por_id,
                reportado_por_nombre,
            })
            .select()
            .single();
        if (insErr) throw insErr;
        createdId = ticket.id;

        const attachmentRows = [];
        for (const a of attachments) {
            const fileSeg = a.path.split('/').pop();
            const finalPath = `${ticket.id}/${fileSeg}`;
            const { error: mvErr } = await supabase.storage.from(BUCKET).move(a.path, finalPath);
            if (mvErr) throw mvErr;
            movedPaths.push(finalPath);
            attachmentRows.push({
                ticket_id: ticket.id,
                file_path: finalPath,
                file_name: a.file_name,
                mime_type: a.mime_type,
                size_bytes: Number(a.size_bytes) || 0,
            });
        }

        const { data: insertedAtt, error: attErr } = await supabase
            .from('maintenance_ticket_attachments')
            .insert(attachmentRows)
            .select('id, file_path, file_name, mime_type, size_bytes');
        if (attErr) throw attErr;

        const signed = await attachSignedUrls(insertedAtt);
        return Response.json({ ...ticket, attachments: signed }, { status: 201 });
    } catch (error) {
        console.error('Error creating maintenance_ticket:', error);
        if (movedPaths.length) {
            try { await supabase.storage.from(BUCKET).remove(movedPaths); } catch {}
        }
        if (createdId) {
            try { await supabase.from('maintenance_tickets').delete().eq('id', createdId); } catch {}
        }
        return Response.json({ error: error?.message || 'Failed to create ticket' }, { status: 500 });
    }
}

export { ESTADOS };
