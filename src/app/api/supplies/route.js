import { supabase } from '@/lib/db';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('supplies')
            .select('*')
            .order('nombre', { ascending: true });

        if (error) throw error;
        return Response.json(data || []);
    } catch (error) {
        console.error('Error fetching supplies:', error);
        return Response.json({ error: 'Failed to fetch supplies' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { nombre, unidad, activo, proveedor } = await req.json();

        if (!nombre?.trim()) {
            return Response.json({ error: 'El nombre es obligatorio' }, { status: 400 });
        }
        if (!proveedor?.trim()) {
            return Response.json({ error: 'El proveedor es obligatorio' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('supplies')
            .insert({ nombre: nombre.trim(), unidad: unidad || 'unidades', activo: activo !== false, proveedor: proveedor.trim() })
            .select()
            .single();

        if (error) throw error;
        return Response.json(data, { status: 201 });
    } catch (error) {
        console.error('Error creating supply:', error);
        return Response.json({ error: 'Failed to create supply' }, { status: 500 });
    }
}
