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
// Hora del turno pedido. Acepta "HH:MM" y "HH:MM:SS"; cualquier otra cosa queda
// en null en vez de romper el guardado.
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
export function cleanTime(v) {
    return (typeof v === 'string' && TIME_RE.test(v.trim())) ? v.trim().slice(0, 5) : null;
}

// Dias de la semana, guardados como 'lun,mar,mie'. Se normaliza y se ordena por
// dia real (no alfabetico) para que siempre se lean igual, venga como venga.
export const DIAS_VALIDOS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
export function cleanDias(v) {
    const crudos = Array.isArray(v) ? v : String(v || '').split(',');
    const vistos = new Set(
        crudos.map((d) => String(d).trim().toLowerCase()).filter((d) => DIAS_VALIDOS.includes(d))
    );
    if (!vistos.size) return null;
    return DIAS_VALIDOS.filter((d) => vistos.has(d)).join(',');
}

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('staff_requests')
            .select('*, services:service_id(name), servicio2:service_id_2(name)')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const rows = (data || []).map(r => ({
            ...r,
            service_name: r.services?.name || null,
            service_name_2: r.servicio2?.name || null,
            services: undefined,
            servicio2: undefined,
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

        // El segundo servicio es opcional y tiene su propio horario: es la misma
        // persona cubriendo dos lugares, no dos busquedas. Si viene igual al
        // primero se ignora, que es un error de carga y no un puesto doble.
        const segundo = Number(body.service_id_2) || null;
        const service_id_2 = segundo && segundo !== Number(body.service_id) ? segundo : null;

        const insert = {
            service_id: Number(body.service_id),
            service_id_2,
            hora_desde_2: service_id_2 ? cleanTime(body.hora_desde_2) : null,
            hora_hasta_2: service_id_2 ? cleanTime(body.hora_hasta_2) : null,
            dias: cleanDias(body.dias),
            // dias_2 en null = "los mismos que el primer servicio". Solo se
            // guarda cuando de verdad son distintos, asi no quedan dos listas
            // que mantener sincronizadas cuando coinciden.
            dias_2: service_id_2 ? cleanDias(body.dias_2) : null,
            cantidad: toPosInt(body.cantidad),
            tipo_jornada: JORNADAS.includes(body.tipo_jornada) ? body.tipo_jornada : null,
            hora_desde: cleanTime(body.hora_desde),
            hora_hasta: cleanTime(body.hora_hasta),
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
            .select('*, services:service_id(name), servicio2:service_id_2(name)')
            .single();

        if (error) throw error;
        return Response.json({
            ...data,
            service_name: data.services?.name || null,
            service_name_2: data.servicio2?.name || null,
            services: undefined,
            servicio2: undefined,
        }, { status: 201 });
    } catch (error) {
        console.error('Error creating staff_request:', error);
        return Response.json({ error: 'No se pudo crear la solicitud' }, { status: 500 });
    }
}
