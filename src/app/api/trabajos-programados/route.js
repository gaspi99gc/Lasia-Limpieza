import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { ESTADO_LABEL, fmtFecha, fmtHora, nombreOperario } from '@/lib/trabajos';
import { ROLES_ESCRITURA, ROLES_LECTURA, quienEs, registrarHistorial } from '@/lib/trabajos-server';

// Trabajos especiales agendados: limpieza de vidrios, tanques, pisos.
//
// Los cargan y coordinan las de Operaciones; el supervisor del trabajo los ve y
// recibe los avisos para estar al tanto. Direccion queda afuera: es
// coordinacion interna.
//
// Cada cambio queda en trabajos_historial (quien, cuando, que tenia antes).
// Coordinar (elegir los operarios) va por /api/trabajos-programados/coordinar.

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
// La hora de inicio llega como la manda un <input type="time">: '08:30'.
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// 'coordinado' no se acepta aca: coordinar es elegir quienes van, y eso pasa
// por /coordinar. Asi el boton no queda en un "ya esta" sin saber con quien.
const ESTADOS_PATCH = ['pendiente', 'hecho', 'cancelado'];

const limpiar = (v) => (typeof v === 'string' ? v.trim() : '') || null;

// El supervisor que recibe el aviso es opcional: vacio = solo Operaciones.
// Devuelve undefined si el valor no sirve, para distinguirlo de "sin supervisor".
function supervisorValido(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : undefined;
}

const nombreSupervisor = (sup) => {
    const u = sup?.app_users;
    return u ? `${u.name || ''} ${u.surname || ''}`.trim() || null : null;
};

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
            .select(`*,
                services:service_id (id, name, address),
                supervisors:supervisor_id (id, app_users:app_user_id (name, surname)),
                operarios:trabajos_operarios (employee_id, employees:employee_id (id, nombre, apellido, legajo)),
                avisos:trabajos_avisos (dias_antes, fecha_trabajo, estado, intentos, destinatarios, dispositivos, ultimo_error, enviado_at)`)
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
            supervisor_nombre: nombreSupervisor(t.supervisors),
            operarios: (t.operarios || [])
                .map((o) => ({ id: o.employee_id, nombre: nombreOperario(o.employees || { id: o.employee_id }) }))
                .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
            // Solo los avisos de la fecha actual: si se reprogramo, los de la
            // fecha vieja ya no dicen nada sobre lo que viene.
            avisos: (t.avisos || [])
                .filter((a) => a.fecha_trabajo === t.fecha)
                .sort((a, b) => b.dias_antes - a.dias_antes),
            services: undefined,
            supervisors: undefined,
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
        const { service_id, titulo, descripcion, fecha, hora_inicio, operarios_necesarios, supervisor_id } = await request.json();

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
        if (!HORA_RE.test(hora_inicio || '')) {
            return Response.json({ error: 'Poné a qué hora empieza el trabajo.' }, { status: 400 });
        }

        const cuantos = Math.trunc(Number(operarios_necesarios));
        if (!Number.isFinite(cuantos) || cuantos < 1) {
            return Response.json({ error: 'Cuántos operarios hacen falta tiene que ser 1 o más.' }, { status: 400 });
        }

        const supervisor = supervisorValido(supervisor_id);
        if (supervisor === undefined) {
            return Response.json({ error: 'Supervisor inválido.' }, { status: 400 });
        }

        const quien = await quienEs(request);
        const { data, error } = await supabase
            .from('trabajos_programados')
            .insert({
                service_id: servicioId,
                titulo: limpiar(titulo),
                descripcion: limpiar(descripcion),
                fecha,
                hora_inicio,
                operarios_necesarios: cuantos,
                supervisor_id: supervisor,
                creado_por: quien,
            })
            .select()
            .single();

        if (error) throw error;

        await registrarHistorial([{
            trabajo_id: data.id,
            campo: 'creado',
            valor_nuevo: `${data.titulo} · ${fmtFecha(data.fecha)} · ${fmtHora(data.hora_inicio)}`,
        }], quien);

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
 * PATCH: editar un trabajo, marcarlo hecho/cancelado o volverlo a sin
 * coordinar. Cada campo que cambia queda en el historial.
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

        // Como estaba antes, para poder decir en el historial "del 15 al 20".
        const { data: antes, error: errAntes } = await supabase
            .from('trabajos_programados')
            .select('*, services:service_id (name), supervisors:supervisor_id (app_users:app_user_id (name, surname))')
            .eq('id', id)
            .is('anulado_at', null)
            .maybeSingle();
        if (errAntes) throw errAntes;
        if (!antes) return Response.json({ error: 'El trabajo no existe o fue anulado.' }, { status: 404 });

        const quien = await quienEs(request);
        const cambios = {};

        if ('titulo' in body) {
            if (!limpiar(body.titulo)) return Response.json({ error: 'El título no puede quedar vacío.' }, { status: 400 });
            cambios.titulo = limpiar(body.titulo);
        }
        if ('descripcion' in body) cambios.descripcion = limpiar(body.descripcion);
        if ('fecha' in body) {
            if (!FECHA_RE.test(body.fecha || '')) return Response.json({ error: 'Fecha inválida.' }, { status: 400 });
            cambios.fecha = body.fecha;
        }
        if ('hora_inicio' in body) {
            if (!HORA_RE.test(body.hora_inicio || '')) {
                return Response.json({ error: 'Poné a qué hora empieza el trabajo.' }, { status: 400 });
            }
            cambios.hora_inicio = body.hora_inicio;
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
        if ('supervisor_id' in body) {
            const s = supervisorValido(body.supervisor_id);
            if (s === undefined) return Response.json({ error: 'Supervisor inválido.' }, { status: 400 });
            cambios.supervisor_id = s;
        }
        if ('estado' in body) {
            if (body.estado === 'coordinado') {
                return Response.json({ error: 'Para coordinar, elegí qué operarios van con "Coordinar".' }, { status: 400 });
            }
            if (!ESTADOS_PATCH.includes(body.estado)) {
                return Response.json({ error: 'Estado inválido.' }, { status: 400 });
            }
            cambios.estado = body.estado;
            // Al volver a pendiente se limpia quien lo coordino: si no, queda
            // diciendo que alguien lo resolvio cuando esta sin resolver de nuevo.
            if (body.estado === 'pendiente') {
                cambios.coordinado_por = null;
                cambios.coordinado_at = null;
            }
        }

        // Solo lo que de verdad cambia: guardar el formulario sin tocar nada no
        // tiene que llenar el historial de renglones vacios.
        const campos = Object.keys(cambios).filter((k) => !k.startsWith('coordinado_'));
        const comparable = (k, v) => (k === 'hora_inicio' && v ? String(v).slice(0, 5) : v ?? null);
        const distintos = campos.filter((k) => comparable(k, antes[k]) !== comparable(k, cambios[k]));
        if (!distintos.length) return Response.json(antes);

        const { data, error } = await supabase
            .from('trabajos_programados')
            .update({ ...cambios, actualizado_por: quien, updated_at: new Date().toISOString() })
            .eq('id', id)
            .is('anulado_at', null)
            .select()
            .maybeSingle();

        if (error) throw error;
        if (!data) return Response.json({ error: 'El trabajo no existe o fue anulado.' }, { status: 404 });

        // Los nombres nuevos de servicio y supervisor, para escribirlos como se leen.
        const [svc, sup] = await Promise.all([
            distintos.includes('service_id')
                ? supabase.from('services').select('name').eq('id', data.service_id).maybeSingle()
                : Promise.resolve({ data: null }),
            distintos.includes('supervisor_id') && data.supervisor_id
                ? supabase.from('supervisors').select('app_users:app_user_id (name, surname)').eq('id', data.supervisor_id).maybeSingle()
                : Promise.resolve({ data: null }),
        ]);

        const comoSeLee = {
            titulo: (v) => v,
            descripcion: (v) => v,
            fecha: (v) => fmtFecha(v),
            hora_inicio: (v) => fmtHora(v) || 'Sin hora',
            operarios_necesarios: (v) => (v == null ? null : String(v)),
            estado: (v) => ESTADO_LABEL[v] || v,
        };
        const asientos = distintos.map((k) => {
            if (k === 'service_id') {
                return { trabajo_id: id, campo: 'servicio', valor_anterior: antes.services?.name || null, valor_nuevo: svc.data?.name || null };
            }
            if (k === 'supervisor_id') {
                return {
                    trabajo_id: id,
                    campo: 'supervisor',
                    valor_anterior: nombreSupervisor(antes.supervisors) || 'Sin supervisor',
                    valor_nuevo: nombreSupervisor(sup.data) || 'Sin supervisor',
                };
            }
            return { trabajo_id: id, campo: k, valor_anterior: comoSeLee[k](antes[k]), valor_nuevo: comoSeLee[k](data[k]) };
        });
        await registrarHistorial(asientos, quien);

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
        const quien = await quienEs(request);

        const { data, error } = await supabase
            .from('trabajos_programados')
            .update({
                anulado_at: new Date().toISOString(),
                anulado_por: quien,
                anulado_motivo: motivo,
            })
            .eq('id', id)
            .is('anulado_at', null)     // no re-anular uno ya anulado
            .select();

        if (error) throw error;
        if (!data?.length) {
            return Response.json({ error: 'El trabajo no existe o ya estaba anulado.' }, { status: 404 });
        }

        await registrarHistorial([{ trabajo_id: id, campo: 'anulado', valor_nuevo: motivo }], quien);

        return Response.json({ ok: true });
    } catch (error) {
        console.error('Error anulando trabajo programado:', error);
        return Response.json({ error: 'No se pudo anular el trabajo.' }, { status: 500 });
    }
}
