import { supabase } from '@/lib/db';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('machines')
            .select('*')
            .order('orden', { ascending: true })
            .order('nombre', { ascending: true });

        if (error) throw error;
        return Response.json(data || []);
    } catch (error) {
        console.error('Error fetching machines:', error);
        return Response.json({ error: 'Failed to fetch machines' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { nombre, activo } = await req.json();

        if (!nombre?.trim()) {
            return Response.json({ error: 'El nombre es obligatorio' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('machines')
            .insert({ nombre: nombre.trim(), activo: activo !== false })
            .select()
            .single();

        if (error) throw error;
        return Response.json(data, { status: 201 });
    } catch (error) {
        console.error('Error creating machine:', error);
        return Response.json({ error: 'Failed to create machine' }, { status: 500 });
    }
}
