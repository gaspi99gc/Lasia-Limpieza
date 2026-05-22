import { supabase } from '@/lib/db';

// PATCH: toggle de "faltante" sobre un ítem existente del pedido (Nestor).
export async function PATCH(req) {
    try {
        const { item_id, faltante, marcado_por } = await req.json();
        if (!item_id) {
            return Response.json({ error: 'item_id es requerido.' }, { status: 400 });
        }

        const updateData = {
            faltante: Boolean(faltante),
            marcado_por: marcado_por || null,
            marcado_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from('supply_request_items')
            .update(updateData)
            .eq('id', item_id)
            .select('id, request_id, supply_id, cantidad, faltante, agregado')
            .single();

        if (error) throw error;
        return Response.json(data);
    } catch (error) {
        console.error('Error updating supply request item:', error);
        return Response.json({ error: 'Failed to update item' }, { status: 500 });
    }
}

// POST: agregar un ítem nuevo a un pedido existente, marcado como "agregado" (supervisor).
export async function POST(req) {
    try {
        const { request_id, supply_id, cantidad, marcado_por } = await req.json();
        if (!request_id || !supply_id || !Number(cantidad)) {
            return Response.json({ error: 'request_id, supply_id y cantidad son obligatorios.' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('supply_request_items')
            .insert({
                request_id,
                supply_id,
                cantidad: Number(cantidad),
                agregado: true,
                marcado_por: marcado_por || null,
                marcado_at: new Date().toISOString(),
            })
            .select('id, request_id, supply_id, cantidad, faltante, agregado')
            .single();

        if (error) throw error;
        return Response.json(data, { status: 201 });
    } catch (error) {
        console.error('Error adding supply request item:', error);
        return Response.json({ error: 'Failed to add item' }, { status: 500 });
    }
}

// DELETE: solo permite borrar ítems que fueron agregados (deshacer agregado mal hecho).
export async function DELETE(req) {
    try {
        const { searchParams } = new URL(req.url);
        const itemId = searchParams.get('item_id');
        if (!itemId) {
            return Response.json({ error: 'item_id es requerido.' }, { status: 400 });
        }

        const { data: existing, error: fetchError } = await supabase
            .from('supply_request_items')
            .select('id, agregado')
            .eq('id', itemId)
            .single();

        if (fetchError) throw fetchError;
        if (!existing) {
            return Response.json({ error: 'Ítem no encontrado.' }, { status: 404 });
        }
        if (!existing.agregado) {
            return Response.json({ error: 'Solo se pueden borrar ítems agregados.' }, { status: 403 });
        }

        const { error: deleteError } = await supabase
            .from('supply_request_items')
            .delete()
            .eq('id', itemId);

        if (deleteError) throw deleteError;
        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting supply request item:', error);
        return Response.json({ error: 'Failed to delete item' }, { status: 500 });
    }
}
