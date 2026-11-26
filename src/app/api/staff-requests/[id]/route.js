import { supabase } from '@/lib/db';
// Los dias se normalizan igual que en el alta: una sola implementación para que
// editar no guarde un formato distinto al de crear.
import { cleanDias } from '@/app/api/staff-requests/route';
import { limpiarSexo } from '@/lib/sexo-solicitud';
import { notaCambio } from '@/lib/nota-solicitud';
import { limpiarGrupo, limpiarPersonas } from '@/lib/solicitud-personal';
import { denyUnlessRole } from '@/lib/apiAuth';
import { getSessionFromRequest } from '@/lib/authCookie';
import { quienEs } from '@/lib/nomina-documentacion-server';

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
// Hora del turno pedido. Acepta "HH:MM" y "HH:MM:SS"; cualquier otra cosa queda
// en null en vez de romper el guardado.
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
function cleanTime(v) {
    return (typeof v === 'string' && TIME_RE.test(v.trim())) ? v.trim().slice(0, 5) : null;
}

export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const body = await req.json();

        if (!body.service_id) {
            return Response.json({ error: 'Elegí el servicio.' }, { status: 400 });
        }

        const estado = ESTADOS.includes(body.estado) ? body.estado : 'pendiente';

        // Traemos el estado actual para saber si recién ahora pasa a 'cubierta'.
        // También la nota, para saber si cambió (ver "Nota nueva" más abajo).
        const { data: current } = await supabase
            .from('staff_requests')
            .select('estado, cubierta_at, notas')
            .eq('id', id)
            .single();

        // cubierta_at: se sella al pasar a 'cubierta' (si no lo estaba ya) y se
        // limpia si la solicitud vuelve a un estado no-cubierta.
        let cubierta_at;
        if (estado === 'cubierta') {
            cubierta_at = current?.cubierta_at || new Date().toISOString();
        } else {
            cubierta_at = null;
        }

        // Quién entró al puesto. Para pasar a Cubierta hace falta el DNI y el
        // nombre de cada persona pedida (los pide el cuadro de la pantalla). Si
        // ya estaba cubierta, solo se tocan si vienen. Al reabrir se borran.
        let personas = {};
        if (estado === 'cubierta') {
            const pasaAhora = current?.estado !== 'cubierta';
            if (pasaAhora || Array.isArray(body.personas_tomadas)) {
                const r = limpiarPersonas(body.personas_tomadas, toPosInt(body.cantidad));
                if (r.error) return Response.json({ error: r.error }, { status: 400 });
                personas = { personas_tomadas: r.personas };
            }
        } else {
            personas = { personas_tomadas: null };
        }

        // Mismo criterio que en el alta: el segundo servicio es opcional y si
        // repite al primero se ignora.
        const segundo = Number(body.service_id_2) || null;
        const service_id_2 = segundo && segundo !== Number(body.service_id) ? segundo : null;

        const update = {
            service_id: Number(body.service_id),
            service_id_2,
            hora_desde_2: service_id_2 ? cleanTime(body.hora_desde_2) : null,
            hora_hasta_2: service_id_2 ? cleanTime(body.hora_hasta_2) : null,
            dias: cleanDias(body.dias),
            dias_2: service_id_2 ? cleanDias(body.dias_2) : null,
            cantidad: toPosInt(body.cantidad),
            tipo_jornada: JORNADAS.includes(body.tipo_jornada) ? body.tipo_jornada : null,
            hora_desde: cleanTime(body.hora_desde),
            hora_hasta: cleanTime(body.hora_hasta),
            urgencia: URGENCIAS.includes(body.urgencia) ? body.urgencia : 'normal',
            fecha_necesaria: cleanDate(body.fecha_necesaria),
            motivo: cleanText(body.motivo),
            notas: cleanText(body.notas),
            estado,
            cubierta_at,
            // Solo si viene: un pedido sin el campo no lo vuelve a indistinto.
            ...(body.sexo !== undefined && { sexo: limpiarSexo(body.sexo) }),
            // Si la nota cambió, RRHH la vuelve a ver como "Nota nueva". Cambiar
            // el estado manda la misma nota, así que no la toca.
            ...(current && notaCambio(current.notas, body.notas) && { nota_vista_at: null, nota_vista_por: null }),
            // Los campos del 2026-11-27, solo si vienen (mismo criterio que el sexo).
            ...(body.encargado_nombre !== undefined && { encargado_nombre: cleanText(body.encargado_nombre) }),
            ...(body.por_vacaciones !== undefined && { por_vacaciones: body.por_vacaciones === true }),
            ...(body.grupo_id !== undefined && { grupo_id: limpiarGrupo(body.grupo_id) }),
            ...personas,
        };

        const { data, error } = await supabase
            .from('staff_requests')
            .update(update)
            .eq('id', id)
            .select('*, services:service_id(name), servicio2:service_id_2(name)')
            .single();

        if (error) throw error;
        return Response.json({
            ...data,
            service_name: data.services?.name || null,
            service_name_2: data.servicio2?.name || null,
            services: undefined,
            servicio2: undefined,
        });
    } catch (error) {
        console.error('Error updating staff_request:', error);
        return Response.json({ error: 'No se pudo actualizar la solicitud' }, { status: 500 });
    }
}

// RRHH abrió la nota: deja de ser "Nota nueva". Solo cuenta RRHH, que es para
// quien está la etiqueta: si la abre admin, a RRHH le sigue apareciendo. Guarda
// solo la primera vez, para que quede quién la leyó primero.
export async function PATCH(req, { params }) {
    const denied = await denyUnlessRole(req, ['rrhh']);
    if (denied) return denied;
    try {
        const { id } = await params;
        const session = await getSessionFromRequest(req);
        const { data, error } = await supabase
            .from('staff_requests')
            .update({ nota_vista_at: new Date().toISOString(), nota_vista_por: await quienEs(session) })
            .eq('id', id)
            .is('nota_vista_at', null)
            .select('id, nota_vista_at, nota_vista_por');
        if (error) throw error;
        return Response.json({ marcada: data.length > 0, ...(data[0] || {}) });
    } catch (error) {
        console.error('Error marking staff_request note as read:', error);
        return Response.json({ error: 'No se pudo marcar la nota como leída' }, { status: 500 });
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
