import { supabase } from '@/lib/db';

const ESTADOS = ['pendiente', 'en_proceso', 'cubierta'];
const JORNADAS = ['completa', 'media', 'turno'];
const URGENCIAS = ['normal', 'urgente'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(v) {
    return (typeof v === 'string' ? v.trim() : '') || null;
}
function cleanDate(v) {
    return (typeof v === 'string' && DATE_RE.test(v)) ? v : null;
}
function toPosInt(v) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 1;
}

export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const body = await req.json();

        if (!body.service_id) {
            return Response.json({ error: 'Elegí el servicio.' }, { status: 400 });
        }

        const update = {
            service_id: Number(body.service_id),
            cantidad: toPosInt(body.cantidad),
            tipo_jornada: JORNADAS.includes(body.tipo_jornada) ? body.tipo_jornada : null,
            urgencia: URGENCIAS.includes(body.urgencia) ? body.urgencia : 'normal',
            fecha_necesaria: cleanDate(body.fecha_necesaria),
            motivo: cleanText(body.motivo),
            notas: cleanText(body.notas),
            estado: ESTADOS.includes(body.estado) ? body.estado : 'pendiente',
        };

        const { data, error } = await supabase
            .from('staff_requests')
            .update(update)
            .eq('id', id)
            .select('*, services:service_id(name)')
            .single();

        if (error) throw error;
        return Response.json({ ...data, service_name: data.services?.name || null, services: undefined });
    } catch (error) {
        console.error('Error updating staff_request:', error);
        return Response.json({ error: 'No se pudo actualizar la solicitud' }, { status: 500 });
    }
}

export async function DELETE(_req, { params }) {
    try {
        const { id } = await params;
        const { error } = await supabase.from('staff_requests').delete().eq('id', id);
        if (error) throw error;
        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting staff_request:', error);
        return Response.json({ error: 'No se pudo eliminar la solicitud' }, { status: 500 });
    }
}
