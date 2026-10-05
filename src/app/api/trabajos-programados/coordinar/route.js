import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { ESTADO_LABEL, nombreOperario } from '@/lib/trabajos';
import { ROLES_ESCRITURA, quienEs, registrarHistorial } from '@/lib/trabajos-server';

// Coordinar un trabajo = decir que operarios van.
//
// POST { id, operarios: [employee_id, ...], coordinado: true|false }
//
// `operarios` es la lista completa de los que van (no un delta): lo que no
// esta, se quita. `coordinado` es como tiene que quedar el trabajo:
//   - true:  coordinado. Hace falta al menos uno, pero pueden ser menos de los
//            necesarios (decidido el 2026-10-05: lo deciden ellas).
//   - false: sigue (o vuelve a) sin coordinar. Sirve para ir anotando los que
//            ya confirmaron mientras se busca al resto; los avisos siguen.
//
// Cada operario que entra o sale, y el cambio de estado, quedan en el historial.

const MAX_OPERARIOS = 50;

export async function POST(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const body = await request.json();
        const id = Number(body?.id);
        if (!Number.isFinite(id)) return Response.json({ error: 'Falta el id del trabajo.' }, { status: 400 });

        if (!Array.isArray(body?.operarios)) {
            return Response.json({ error: 'Falta la lista de operarios.' }, { status: 400 });
        }
        const elegidos = [...new Set(body.operarios.map(Number))];
        if (elegidos.some((e) => !Number.isInteger(e) || e <= 0)) {
            return Response.json({ error: 'Operario inválido.' }, { status: 400 });
        }
        if (elegidos.length > MAX_OPERARIOS) {
            return Response.json({ error: `No pueden ser más de ${MAX_OPERARIOS} operarios.` }, { status: 400 });
        }

        const coordinado = body?.coordinado === true;
        if (coordinado && !elegidos.length) {
            return Response.json({ error: 'Elegí al menos un operario para darlo por coordinado.' }, { status: 400 });
        }

        const { data: trabajo, error: errTrabajo } = await supabase
            .from('trabajos_programados')
            .select('id, estado')
            .eq('id', id)
            .is('anulado_at', null)
            .maybeSingle();
        if (errTrabajo) throw errTrabajo;
        if (!trabajo) return Response.json({ error: 'El trabajo no existe o fue anulado.' }, { status: 404 });
        if (trabajo.estado === 'hecho' || trabajo.estado === 'cancelado') {
            return Response.json({ error: `El trabajo ya está ${ESTADO_LABEL[trabajo.estado].toLowerCase()}.` }, { status: 400 });
        }

        const { data: actuales, error: errActuales } = await supabase
            .from('trabajos_operarios')
            .select('employee_id')
            .eq('trabajo_id', id);
        if (errActuales) throw errActuales;

        const tenia = new Set((actuales || []).map((o) => Number(o.employee_id)));
        const agregar = elegidos.filter((e) => !tenia.has(e));
        const quitar = [...tenia].filter((e) => !elegidos.includes(e));

        // Los nombres de todos los que entran o salen, para el historial. A los
        // que entran ademas se les exige estar activos: no se asigna a alguien
        // dado de baja. Los que ya estaban asignados no se tocan aunque despues
        // les hayan dado la baja: sacarlos es decision de Operaciones.
        const tocados = [...agregar, ...quitar];
        const { data: emps, error: errEmps } = tocados.length
            ? await supabase.from('employees').select('id, nombre, apellido, legajo, fecha_baja').in('id', tocados)
            : { data: [], error: null };
        if (errEmps) throw errEmps;
        const porId = new Map((emps || []).map((e) => [Number(e.id), e]));

        for (const e of agregar) {
            const emp = porId.get(e);
            if (!emp) return Response.json({ error: 'Uno de los operarios no existe en el legajo.' }, { status: 400 });
            if (emp.fecha_baja) return Response.json({ error: `${nombreOperario(emp)} está dado de baja.` }, { status: 400 });
        }

        const quien = await quienEs(request);

        if (agregar.length) {
            const { error } = await supabase
                .from('trabajos_operarios')
                .upsert(
                    agregar.map((e) => ({ trabajo_id: id, employee_id: e, asignado_por: quien })),
                    { onConflict: 'trabajo_id,employee_id', ignoreDuplicates: true }
                );
            if (error) throw error;
        }
        if (quitar.length) {
            const { error } = await supabase
                .from('trabajos_operarios')
                .delete()
                .eq('trabajo_id', id)
                .in('employee_id', quitar);
            if (error) throw error;
        }

        // Se toca el trabajo si cambio algo: el estado, y siempre quien lo
        // actualizo por ultima vez (la pantalla refresca el historial con eso).
        const estadoNuevo = coordinado ? 'coordinado' : 'pendiente';
        const cambiaEstado = estadoNuevo !== trabajo.estado;
        if (cambiaEstado || agregar.length || quitar.length) {
            const ahora = new Date().toISOString();
            const { error } = await supabase
                .from('trabajos_programados')
                .update({
                    ...(cambiaEstado ? {
                        estado: estadoNuevo,
                        coordinado_por: coordinado ? quien : null,
                        coordinado_at: coordinado ? ahora : null,
                    } : {}),
                    actualizado_por: quien,
                    updated_at: ahora,
                })
                .eq('id', id)
                .is('anulado_at', null);
            if (error) throw error;
        }

        await registrarHistorial([
            ...agregar.map((e) => ({ trabajo_id: id, campo: 'operario_agregado', valor_nuevo: nombreOperario(porId.get(e)) })),
            ...quitar.map((e) => ({ trabajo_id: id, campo: 'operario_quitado', valor_anterior: nombreOperario(porId.get(e) || { id: e }) })),
            ...(cambiaEstado
                ? [{ trabajo_id: id, campo: 'estado', valor_anterior: ESTADO_LABEL[trabajo.estado], valor_nuevo: ESTADO_LABEL[estadoNuevo] }]
                : []),
        ], quien);

        return Response.json({ ok: true, estado: estadoNuevo, operarios: elegidos.length });
    } catch (error) {
        console.error('Error coordinando trabajo programado:', error);
        return Response.json(
            { error: `No se pudo guardar: ${error.message || 'error desconocido'}` },
            { status: 500 }
        );
    }
}
