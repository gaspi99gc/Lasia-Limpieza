import { supabase } from '@/lib/db';

export async function GET(_req, { params }) {
    try {
        const { id } = await params;
        const { data, error } = await supabase
            .from('maintenance_ticket_comments')
            .select('id, author_id, author_name, author_role, body, created_at')
            .eq('ticket_id', id)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return Response.json(data || []);
    } catch (error) {
        console.error('Error fetching maintenance_ticket_comments:', error);
        return Response.json({ error: 'Failed to fetch comments' }, { status: 500 });
    }
}

export async function POST(req, { params }) {
    try {
        const { id } = await params;
        const body = await req.json();
        const text = (body.body || '').toString().trim();
        const author_id = body.author_id ? Number(body.author_id) : null;
        const author_name = (body.author_name || '').toString().trim() || null;
        const author_role = (body.author_role || '').toString().trim() || null;

        if (!text) {
            return Response.json({ error: 'El comentario no puede estar vacío.' }, { status: 400 });
        }

        const { data: ticket, error: curErr } = await supabase
            .from('maintenance_tickets')
            .select('id')
            .eq('id', id)
            .single();
        if (curErr || !ticket) {
            return Response.json({ error: 'Ticket no encontrado' }, { status: 404 });
        }

        const { data, error } = await supabase
            .from('maintenance_ticket_comments')
            .insert({
                ticket_id: Number(id),
                author_id,
                author_name,
                author_role,
                body: text,
            })
            .select('id, author_id, author_name, author_role, body, created_at')
            .single();
        if (error) throw error;

        await supabase
            .from('maintenance_tickets')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', id);

        return Response.json(data, { status: 201 });
    } catch (error) {
        console.error('Error creating maintenance_ticket_comment:', error);
        return Response.json({ error: 'Failed to create comment' }, { status: 500 });
    }
}
