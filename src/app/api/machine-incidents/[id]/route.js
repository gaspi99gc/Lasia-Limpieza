import { supabase } from '@/lib/db';

const ESTADOS = ['abierta', 'en_revision', 'reparada', 'reemplazada', 'descartada', 'completada'];
const BUCKET = 'machine-incidents';

async function executeTransfer(incident) {
    const { service_id, machine_id, service_destino_id } = incident;
    if (!service_destino_id) {
        throw new Error('La incidencia de traspaso no tiene servicio destino');
    }

    // Restar 1 del origen
    const { data: srcRow } = await supabase
        .from('service_machines')
        .select('quantity')
        .eq('service_id', service_id)
        .eq('machine_id', machine_id)
        .maybeSingle();
    const srcQty = srcRow?.quantity ?? 0;
    const newSrcQty = Math.max(0, srcQty - 1);
    if (newSrcQty === 0) {
        await supabase
            .from('service_machines')
            .delete()
            .eq('service_id', service_id)
            .eq('machine_id', machine_id);
    } else {
        await supabase
            .from('service_machines')
            .update({ quantity: newSrcQty })
            .eq('service_id', service_id)
            .eq('machine_id', machine_id);
    }

    // Sumar 1 al destino
    const { data: dstRow } = await supabase
        .from('service_machines')
        .select('quantity')
        .eq('service_id', service_destino_id)
        .eq('machine_id', machine_id)
        .maybeSingle();
    const dstQty = dstRow?.quantity ?? 0;
    await supabase
        .from('service_machines')
        .upsert(
            { service_id: service_destino_id, machine_id, quantity: dstQty + 1 },
            { onConflict: 'service_id,machine_id' }
        );

    // Buscar nombre del destino para la nota
    const { data: destSvc } = await supabase
        .from('services')
        .select('name')
        .eq('id', service_destino_id)
        .maybeSingle();
    return destSvc?.name || `servicio #${service_destino_id}`;
}

export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const body = await req.json();
        const { descripcion, nota_interna, estado, tipo_falla, service_destino_id } = body;

        const { data: current, error: curErr } = await supabase
            .from('machine_incidents')
            .select('id, service_id, machine_id, estado, tipo_falla, service_destino_id, nota_interna')
            .eq('id', id)
            .single();
        if (curErr || !current) {
            return Response.json({ error: 'Incidencia no encontrada' }, { status: 404 });
        }

        const patch = { updated_at: new Date().toISOString() };
        if (descripcion !== undefined) {
            if (!descripcion?.trim()) {
                return Response.json({ error: 'La descripción no puede estar vacía' }, { status: 400 });
            }
            patch.descripcion = descripcion.trim();
        }
        if (nota_interna !== undefined) patch.nota_interna = nota_interna?.trim() || null;
        if (estado !== undefined) {
            if (!ESTADOS.includes(estado)) {
                return Response.json({ error: 'Estado inválido' }, { status: 400 });
            }
            patch.estado = estado;
        }
        if (tipo_falla !== undefined) patch.tipo_falla = tipo_falla?.trim() || null;
        if (service_destino_id !== undefined) {
            patch.service_destino_id = service_destino_id ? Number(service_destino_id) : null;
        }

        // Hook de traspaso: si pasa a completada y es traspaso, ejecutar transferencia
        const willBeCompleted = patch.estado === 'completada' && current.estado !== 'completada';
        const effectiveTipo = patch.tipo_falla ?? current.tipo_falla;
        const effectiveDestino = patch.service_destino_id ?? current.service_destino_id;
        let transferNote = null;

        if (willBeCompleted && effectiveTipo === 'Traspaso') {
            try {
                const destName = await executeTransfer({
                    service_id: current.service_id,
                    machine_id: current.machine_id,
                    service_destino_id: effectiveDestino,
                });
                const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
                transferNote = `Traspasada a ${destName} el ${fecha}`;
            } catch (err) {
                console.error('Transfer failed:', err);
                return Response.json({ error: err?.message || 'Error al ejecutar el traspaso' }, { status: 500 });
            }
        }

        if (transferNote) {
            const baseNote = patch.nota_interna ?? current.nota_interna ?? '';
            patch.nota_interna = baseNote ? `${baseNote}\n${transferNote}` : transferNote;
        }

        const { error } = await supabase
            .from('machine_incidents')
            .update(patch)
            .eq('id', id);

        if (error) throw error;
        return Response.json({ success: true });
    } catch (error) {
        console.error('Error updating machine_incident:', error);
        return Response.json({ error: 'Failed to update incident' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        const { id } = await params;

        const { data: atts } = await supabase
            .from('machine_incident_attachments')
            .select('file_path')
            .eq('incident_id', id);
        const paths = (atts || []).map(a => a.file_path);
        if (paths.length) {
            try { await supabase.storage.from(BUCKET).remove(paths); } catch {}
        }

        const { error } = await supabase
            .from('machine_incidents')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting machine_incident:', error);
        return Response.json({ error: 'Failed to delete incident' }, { status: 500 });
    }
}
