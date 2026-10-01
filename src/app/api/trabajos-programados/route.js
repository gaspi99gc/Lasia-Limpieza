import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { getSessionFromRequest } from '@/lib/authCookie';

// Trabajos especiales agendados: limpieza de vidrios, tanques, pisos.
//
// Los carga Operaciones y los ve tambien el supervisor del servicio, que es
// quien va a estar ese dia. Direccion queda afuera: es coordinacion interna.

const ROLES_LECTURA = ['admin', 'operaciones', 'rrhh', 'jefe_operativo', 'supervisor'];
const ROLES_ESCRITURA = ['admin', 'operaciones'];

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ESTADOS = ['pendiente', 'coordinado', 'hecho', 'cancelado'];

// Quien hace la accion, sacado de la sesion y nunca del cliente.
async function quienEs(request) {
    const s = await getSessionFromRequest(request);
    const nombre = `${s?.name || ''} ${s?.surname || ''}`.trim();
    return nombre || s?.role || 'desconocido';
}

const limpiar = (v) => (typeof v === 'string' ? v.trim() : '') || null;

export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES_LECTURA);
    if (denied) return denied;

    try {
        const { searchParams } = new URL(request.url);
        const desde = searchParams.get('desde');
        const hasta = searchParams.get('hasta');
        const incluirHechos = searchParams.get('historico') === '1';

        let q = supabase
            .from('trabajos_programados')
            .select('*, services:service_id (id, name, address)')
            .is('anulado_at', null)
            .order('fecha', { ascending: true });

        if (FECHA_RE.test(desde || '')) q = q.gte('fecha', desde);
        if (FECHA_RE.test(hasta || '')) q = q.lte('fecha', hasta);

        const { data, error } = await q;
        if (error) throw error;

        const filas = (data || []).map((t) => ({
            ...t,
            servicio_nombre: t.services?.name || null,
            servicio_direccion: t.services?.address || null,
            services: undefined,
        }));

        // Por defecto no se muestran los terminados: la pantalla es "que viene",
        // no un historico. Se piden aparte con ?historico=1.
        const visibles = incluirHechos
            ? filas
            : filas.filter((t) => t.estado !== 'hecho' && t.estado !== 'cancelado');

        return Response.json(visibles);
    } catch (error) {
        console.error('Error listando trabajos programados:', error);
        return Response.json({ error: 'No se pudieron cargar los trabajos.' }, { status: 500 });
    }
}

export async function POST(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const { service_id, titulo, descripcion, fecha, operarios_necesarios } = await request.json();

        const servicioId = Number(service_id);
        if (!Number.isFinite(servicioId) || servicioId <= 0) {
            return Response.json({ error: 'Elegí el servicio.' }, { status: 400 });
        }
        if (!limpiar(titulo)) {
            return Response.json({ error: 'Poné qué trabajo es.' }, { status: 400 });
        }
        if (!FECHA_RE.test(fecha || '')) {
            return Response.json({ error: 'Elegí la fecha del trabajo.' }, { status: 400 });
        }

        const cuantos = Math.trunc(Number(operarios_necesarios));
        if (!Number.isFinite(cuantos) || cuantos < 1) {
            return Response.json({ error: 'Cuántos operarios hacen falta tiene que ser 1 o más.' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('trabajos_programados')
            .insert({
                service_id: servicioId,
                titulo: limpiar(titulo),
                descripcion: limpiar(descripcion),
                fecha,
                operarios_necesarios: cuantos,
                creado_por: await quienEs(request),
            })
            .select()
            .single();

        if (error) throw error;
        return Response.json(data, { status: 201 });
    } catch (error) {
        console.error('Error creando trabajo programado:', error);
        return Response.json(
            { error: `No se pudo guardar: ${error.message || 'error desconocido'}` },
            { status: 500 }
        );
    }
}

/**
 * PATCH: editar un trabajo o cambiarle el estado.
 *
 * Marcar como 'coordinado' es la accion principal: es la respuesta a "ya
 * conseguiste la gente?". Se guarda quien y cuando, porque en el sprint 3 el
 * sistema va a dejar de insistir en base a eso.
 */
export async function PATCH(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const body = await request.json();
        const id = Number(body?.id);
        if (!Number.isFinite(id)) {
            return Response.json({ error: 'Falta el id del trabajo.' }, { status: 400 });
        }

        const quien = await quienEs(request);
        const cambios = { actualizado_por: quien, updated_at: new Date().toISOString() };

        if ('titulo' in body) {
            if (!limpiar(body.titulo)) return Response.json({ error: 'El título no puede quedar vacío.' }, { status: 400 });
            cambios.titulo = limpiar(body.titulo);
        }
        if ('descripcion' in body) cambios.descripcion = limpiar(body.descripcion);
        if ('fecha' in body) {
            if (!FECHA_RE.test(body.fecha || '')) return Response.json({ error: 'Fecha inválida.' }, { status: 400 });
            cambios.fecha = body.fecha;
        }
        if ('service_id' in body) {
            const s = Number(body.service_id);
            if (!Number.isFinite(s) || s <= 0) return Response.json({ error: 'Servicio inválido.' }, { status: 400 });
            cambios.service_id = s;
        }
        if ('operarios_necesarios' in body) {
            const n = Math.trunc(Number(body.operarios_necesarios));
            if (!Number.isFinite(n) || n < 1) return Response.json({ error: 'Tiene que ser 1 o más.' }, { status: 400 });
            cambios.operarios_necesarios = n;
        }
        if ('estado' in body) {
            if (!ESTADOS.includes(body.estado)) {
                return Response.json({ error: 'Estado inválido.' }, { status: 400 });
            }
            cambios.estado = body.estado;
            // Al coordinar se registra quien fue. Al volver a pendiente se
            // limpia, porque si no queda diciendo que alguien lo coordino
            // cuando en realidad esta sin resolver de nuevo.
            if (body.estado === 'coordinado') {
                cambios.coordinado_por = quien;
                cambios.coordinado_at = new Date().toISOString();
            } else if (body.estado === 'pendiente') {
                cambios.coordinado_por = null;
                cambios.coordinado_at = null;
            }
        }

        const { data, error } = await supabase
            .from('trabajos_programados')
            .update(cambios)
            .eq('id', id)
            .is('anulado_at', null)
            .select()
            .single();

        if (error) throw error;
        if (!data) return Response.json({ error: 'El trabajo no existe o fue anulado.' }, { status: 404 });

        return Response.json(data);
    } catch (error) {
        console.error('Error actualizando trabajo programado:', error);
        return Response.json(
            { error: `No se pudo actualizar: ${error.message || 'error desconocido'}` },
            { status: 500 }
        );
    }
}

// Borrar es ANULAR: un trabajo que se cargo y desaparecio deja a todos
// preguntandose si existio. Queda fuera de las listas pero se puede reconstruir.
export async function DELETE(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const { searchParams } = new URL(request.url);
        const id = Number(searchParams.get('id'));
        if (!Number.isFinite(id)) {
            return Response.json({ error: 'Falta el id.' }, { status: 400 });
        }

        const motivo = limpiar(searchParams.get('motivo'));

        const { data, error } = await supabase
            .from('trabajos_programados')
            .update({
                anulado_at: new Date().toISOString(),
                anulado_por: await quienEs(request),
                anulado_motivo: motivo,
            })
            .eq('id', id)
            .is('anulado_at', null)     // no re-anular uno ya anulado
            .select();

        if (error) throw error;
        if (!data?.length) {
            return Response.json({ error: 'El trabajo no existe o ya estaba anulado.' }, { status: 404 });
        }

        return Response.json({ ok: true });
    } catch (error) {
        console.error('Error anulando trabajo programado:', error);
        return Response.json({ error: 'No se pudo anular el trabajo.' }, { status: 500 });
    }
}
