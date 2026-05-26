import { supabase } from '@/lib/db';

// Helper: confirma que el item existe y devuelve los datos minimos.
// Tambien valida que el pedido NO este cerrado (regla general para esta API).
async function getItemAndAssertActive(item_id) {
    const { data: item, error: itemErr } = await supabase
        .from('supply_request_items')
        .select('id, request_id, cantidad, cantidad_original, agregado')
        .eq('id', item_id)
        .single();
    if (itemErr || !item) return { error: 'Ítem no encontrado.', status: 404 };

    const { data: req, error: reqErr } = await supabase
        .from('supply_requests')
        .select('status')
        .eq('id', item.request_id)
        .single();
    if (reqErr || !req) return { error: 'Pedido no encontrado.', status: 404 };
    if (req.status === 'cerrado') return { error: 'No se puede modificar un pedido cerrado.', status: 403 };

    return { item };
}

// PATCH: dos modos
//   - {item_id, faltante, marcado_por} -> toggle de faltante (lo usa el supervisor tecnico)
//   - {item_id, cantidad, editado_por} -> cambiar la cantidad (lo usa compras). Guarda la cantidad
//     original la primera vez que se edita para auditoria.
export async function PATCH(req) {
    try {
        const body = await req.json();
        const { item_id } = body;
        if (!item_id) {
            return Response.json({ error: 'item_id es requerido.' }, { status: 400 });
        }

        const hasFaltante = Object.prototype.hasOwnProperty.call(body, 'faltante');
        const hasCantidad = Object.prototype.hasOwnProperty.call(body, 'cantidad');

        if (!hasFaltante && !hasCantidad) {
            return Response.json({ error: 'Hay que enviar "faltante" o "cantidad".' }, { status: 400 });
        }

        // Modo: editar cantidad
        if (hasCantidad) {
            const nuevaCantidad = Number(body.cantidad);
            if (!Number.isFinite(nuevaCantidad) || nuevaCantidad <= 0) {
                return Response.json({ error: 'La cantidad debe ser un número mayor a 0.' }, { status: 400 });
            }
            const check = await getItemAndAssertActive(item_id);
            if (check.error) return Response.json({ error: check.error }, { status: check.status });

            const updateData = {
                cantidad: nuevaCantidad,
                editado_por: (body.editado_por || '').toString().trim() || null,
                editado_at: new Date().toISOString(),
            };
            // Si nunca fue editada, guardamos la cantidad original (para mostrar el "de X a Y").
            if (check.item.cantidad_original == null && Number(check.item.cantidad) !== nuevaCantidad) {
                updateData.cantidad_original = Number(check.item.cantidad);
            }

            const { data, error } = await supabase
                .from('supply_request_items')
                .update(updateData)
                .eq('id', item_id)
                .select('id, request_id, supply_id, cantidad, cantidad_original, faltante, agregado, editado_por, editado_at')
                .single();
            if (error) throw error;
            return Response.json(data);
        }

        // Modo: toggle faltante (compatibilidad: NO valida pedido cerrado, no rompe flujos viejos)
        const updateData = {
            faltante: Boolean(body.faltante),
            marcado_por: body.marcado_por || null,
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

// POST: agregar un ítem nuevo a un pedido existente (marcado como "agregado").
// Lo usan supervisores y tambien compras.
export async function POST(req) {
    try {
        const { request_id, supply_id, cantidad, marcado_por } = await req.json();
        if (!request_id || !supply_id || !Number(cantidad)) {
            return Response.json({ error: 'request_id, supply_id y cantidad son obligatorios.' }, { status: 400 });
        }

        // Bloquear agregar items en pedidos cerrados.
        const { data: req2, error: reqErr } = await supabase
            .from('supply_requests')
            .select('status')
            .eq('id', request_id)
            .single();
        if (reqErr) throw reqErr;
        if (req2?.status === 'cerrado') {
            return Response.json({ error: 'No se pueden agregar ítems a un pedido cerrado.' }, { status: 403 });
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
            .select('id, request_id, supply_id, cantidad, faltante, agregado, marcado_por, marcado_at')
            .single();

        if (error) throw error;
        return Response.json(data, { status: 201 });
    } catch (error) {
        console.error('Error adding supply request item:', error);
        return Response.json({ error: 'Failed to add item' }, { status: 500 });
    }
}

// DELETE: dos comportamientos segun el origen del item
//   - Agregado: hard delete (deshacer un agregado mal hecho, como antes).
//   - Original: soft delete (marcar eliminado=true + autor + fecha), para auditoria.
// Eliminado_por viene como query param ?eliminado_por=...
export async function DELETE(req) {
    try {
        const { searchParams } = new URL(req.url);
        const itemId = searchParams.get('item_id');
        const eliminadoPor = (searchParams.get('eliminado_por') || '').trim() || null;
        if (!itemId) {
            return Response.json({ error: 'item_id es requerido.' }, { status: 400 });
        }

        const check = await getItemAndAssertActive(itemId);
        if (check.error) return Response.json({ error: check.error }, { status: check.status });

        if (check.item.agregado) {
            // Hard delete: el agregado se borra de verdad.
            const { error: deleteError } = await supabase
                .from('supply_request_items')
                .delete()
                .eq('id', itemId);
            if (deleteError) throw deleteError;
            return Response.json({ success: true, hard_deleted: true });
        }

        // Soft delete del item original.
        const { data, error } = await supabase
            .from('supply_request_items')
            .update({
                eliminado: true,
                eliminado_por: eliminadoPor,
                eliminado_at: new Date().toISOString(),
            })
            .eq('id', itemId)
            .select('id, eliminado, eliminado_por, eliminado_at')
            .single();
        if (error) throw error;
        return Response.json({ success: true, soft_deleted: true, ...data });
    } catch (error) {
        console.error('Error deleting supply request item:', error);
        return Response.json({ error: 'Failed to delete item' }, { status: 500 });
    }
}
