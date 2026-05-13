import { supabase } from '@/lib/db';

export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const { nombre, activo } = await req.json();

        if (!nombre?.trim()) {
            return Response.json({ error: 'El nombre es obligatorio' }, { status: 400 });
        }

        const { error } = await supabase
            .from('machines')
            .update({ nombre: nombre.trim(), activo: activo !== false })
            .eq('id', id);

        if (error) throw error;
        return Response.json({ success: true });
    } catch (error) {
        console.error('Error updating machine:', error);
        return Response.json({ error: 'Failed to update machine' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        const { id } = await params;

        const { error } = await supabase
            .from('machines')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting machine:', error);
        return Response.json({ error: 'Failed to delete machine' }, { status: 500 });
    }
}
