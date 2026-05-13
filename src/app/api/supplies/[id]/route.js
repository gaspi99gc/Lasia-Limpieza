import { supabase } from '@/lib/db';

export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const { nombre, unidad, activo, provider_id } = await req.json();

        if (!nombre?.trim()) {
            return Response.json({ error: 'El nombre es obligatorio' }, { status: 400 });
        }
        if (!provider_id) {
            return Response.json({ error: 'El proveedor es obligatorio' }, { status: 400 });
        }

        const { error } = await supabase
            .from('supplies')
            .update({ nombre: nombre.trim(), unidad: unidad || 'unidades', activo: activo !== false, provider_id })
            .eq('id', id);

        if (error) throw error;
        return Response.json({ success: true });
    } catch (error) {
        console.error('Error updating supply:', error);
        return Response.json({ error: 'Failed to update supply' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        const { id } = await params;
        const { error } = await supabase.from('supplies').delete().eq('id', id);
        if (error) throw error;
        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting supply:', error);
        return Response.json({ error: 'Failed to delete supply' }, { status: 500 });
    }
}
