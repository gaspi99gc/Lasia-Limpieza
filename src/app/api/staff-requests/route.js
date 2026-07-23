import { supabase } from '@/lib/db';

export const ESTADOS = ['pendiente', 'en_proceso', 'cubierta'];
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

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('staff_requests')
            .select('*, services:service_id(name)')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const rows = (data || []).map(r => ({
            ...r,
            service_name: r.services?.name || null,
            services: undefined,
        }));
        return Response.json(rows);
    } catch (error) {
        console.error('Error fetching staff_requests:', error);
        return Response.json({ error: 'No se pudieron obtener las solicitudes de personal' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const body = await req.json();

        if (!body.service_id) {
            return Response.json({ error: 'Elegí el servicio.' }, { status: 400 });
        }

        const insert = {
            service_id: Number(body.service_id),
            cantidad: toPosInt(body.cantidad),
            tipo_jornada: JORNADAS.includes(body.tipo_jornada) ? body.tipo_jornada : null,
            urgencia: URGENCIAS.includes(body.urgencia) ? body.urgencia : 'normal',
            fecha_necesaria: cleanDate(body.fecha_necesaria),
            motivo: cleanText(body.motivo),
            notas: cleanText(body.notas),
            estado: 'pendiente',
            creado_por_nombre: cleanText(body.creado_por_nombre),
            creado_por_rol: cleanText(body.creado_por_rol),
        };

        const { data, error } = await supabase
            .from('staff_requests')
            .insert(insert)
            .select('*, services:service_id(name)')
            .single();

        if (error) throw error;
        return Response.json({ ...data, service_name: data.services?.name || null, services: undefined }, { status: 201 });
    } catch (error) {
        console.error('Error creating staff_request:', error);
        return Response.json({ error: 'No se pudo crear la solicitud' }, { status: 500 });
    }
}
