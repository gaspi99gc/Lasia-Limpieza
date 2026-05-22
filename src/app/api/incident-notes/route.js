import { supabase } from '@/lib/db';

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const incidentId = searchParams.get('incident_id');

        let query = supabase
            .from('incident_notes')
            .select('id, incident_id, nota, autor, created_at')
            .order('created_at', { ascending: true });

        if (incidentId) query = query.eq('incident_id', incidentId);

        const { data, error } = await query;
        if (error) throw error;
        return Response.json(data || []);
    } catch (error) {
        console.error('Error fetching incident_notes:', error);
        return Response.json({ error: 'Failed to fetch notes' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { incident_id, nota, autor } = await req.json();

        if (!incident_id) {
            return Response.json({ error: 'incident_id es obligatorio' }, { status: 400 });
        }
        if (!nota?.trim()) {
            return Response.json({ error: 'La nota no puede estar vacía' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('incident_notes')
            .insert({
                incident_id,
                nota: nota.trim(),
                autor: autor?.trim() || null,
            })
            .select()
            .single();

        if (error) throw error;
        return Response.json(data, { status: 201 });
    } catch (error) {
        console.error('Error creating incident_note:', error);
        return Response.json({ error: 'Failed to create note' }, { status: 500 });
    }
}
