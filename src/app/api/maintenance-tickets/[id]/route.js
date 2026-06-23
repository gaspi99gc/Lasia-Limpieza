import { supabase } from '@/lib/db';

const ESTADOS = ['abierto', 'en_proceso', 'resuelto'];
const BUCKET = 'maintenance-tickets';

async function attachSignedUrls(rows) {
    if (!rows?.length) return [];
    const paths = rows.map(r => r.file_path);
    const { data: signed, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, 60 * 60);
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

export async function GET(_req, { params }) {
    try {
        const { id } = await params;
        const { data, error } = await supabase
            .from('maintenance_tickets')
            .select('id, service_id, titulo, descripcion, estado, reportado_por_id, reportado_por_nombre, created_at, updated_at, services(name), maintenance_ticket_attachments(id, file_path, file_name, mime_type, size_bytes), maintenance_ticket_comments(id, author_id, author_name, author_role, body, created_at)')
            .eq('id', id)
            .single();
        if (error || !data) {
            return Response.json({ error: 'Ticket no encontrado' }, { status: 404 });
        }

        const comments = (data.maintenance_ticket_comments || [])
            .slice()
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        return Response.json({
            id: data.id,
            service_id: data.service_id,
            service_name: data.services?.name || null,
            titulo: data.titulo,
            descripcion: data.descripcion,
            estado: data.estado,
            reportado_por_id: data.reportado_por_id || null,
            reportado_por_nombre: data.reportado_por_nombre || null,
            created_at: data.created_at,
            updated_at: data.updated_at,
            attachments: await attachSignedUrls(data.maintenance_ticket_attachments || []),
            comments,
        });
    } catch (error) {
        console.error('Error fetching maintenance_ticket:', error);
        return Response.json({ error: 'Failed to fetch ticket' }, { status: 500 });
    }
}

export async function PATCH(req, { params }) {
    try {
        const { id } = await params;
        const body = await req.json();
        const { estado } = body;

        if (estado === undefined) {
            return Response.json({ error: 'Nada que actualizar.' }, { status: 400 });
        }
        if (!ESTADOS.includes(estado)) {
            return Response.json({ error: 'Estado inválido' }, { status: 400 });
        }

        const { error } = await supabase
            .from('maintenance_tickets')
            .update({ estado, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
        return Response.json({ success: true });
    } catch (error) {
        console.error('Error updating maintenance_ticket:', error);
        return Response.json({ error: 'Failed to update ticket' }, { status: 500 });
    }
}
