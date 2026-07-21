import { supabase } from '@/lib/db';

export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const { nombre, unidad, activo, provider_id, precio } = await req.json();

        if (!nombre?.trim()) {
            return Response.json({ error: 'El nombre es obligatorio' }, { status: 400 });
        }
        if (!provider_id) {
            return Response.json({ error: 'El proveedor es obligatorio' }, { status: 400 });
        }

        const precioNum = Number(precio);
        const { error } = await supabase
            .from('supplies')
            .update({ nombre: nombre.trim(), unidad: unidad || 'unidades', activo: activo !== false, provider_id, precio: Number.isFinite(precioNum) && precioNum >= 0 ? precioNum : 0 })
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

        // Antes de borrar: ¿el insumo está usado en pedidos? Si es así, no se puede
        // eliminar (rompería pedidos/remitos históricos). Se guía a desactivarlo.
        const { count } = await supabase
            .from('supply_request_items')
            .select('*', { count: 'exact', head: true })
            .eq('supply_id', id);

        if (count && count > 0) {
            return Response.json({
                error: `No se puede eliminar: este insumo está usado en ${count} pedido${count !== 1 ? 's' : ''}. Desactivalo en su lugar (con el interruptor "Insumo activo") para ocultarlo en los pedidos sin perder el historial.`,
                inUse: true,
                count,
            }, { status: 409 });
        }

        const { error } = await supabase.from('supplies').delete().eq('id', id);
        if (error) {
            // Fallback: si igual salta una FK (por otra tabla), damos un mensaje claro.
            if (error.code === '23503') {
                return Response.json({
                    error: 'No se puede eliminar: el insumo está referenciado en otros registros. Desactivalo en su lugar.',
                    inUse: true,
                }, { status: 409 });
            }
            throw error;
        }
        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting supply:', error);
        return Response.json({ error: 'Failed to delete supply' }, { status: 500 });
    }
}
