import { supabase } from '@/lib/db';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('providers')
            .select('id, name, active')
            .eq('active', true)
            .order('name', { ascending: true });
        if (error) throw error;
        return Response.json(data || []);
    } catch (error) {
        console.error('Error fetching providers:', error);
        return Response.json({ error: 'Failed to fetch providers' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { name } = await req.json();
        if (!name?.trim()) {
            return Response.json({ error: 'El nombre es obligatorio' }, { status: 400 });
        }
        const { data, error } = await supabase
            .from('providers')
            .insert({ name: name.trim(), active: true })
            .select()
            .single();
        if (error) throw error;
        return Response.json(data, { status: 201 });
    } catch (error) {
        console.error('Error creating provider:', error);
        return Response.json({ error: 'Failed to create provider' }, { status: 500 });
    }
}
