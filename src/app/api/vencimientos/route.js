import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { getSessionFromRequest } from '@/lib/authCookie';
import { ROLES_VER, ROLES_GESTION, siguienteFecha } from '@/lib/vencimientos';
import { limpiarBajas, nominaVigente, quienEs, resumenVigente } from '@/lib/nomina-documentacion-server';

// Documentación mensual (ex Vencimientos de RRHH): lo que hay que presentar a
// los clientes en una fecha, una sola vez o cada N meses. Avisan por push a
// los responsables elegidos (ver src/lib/avisos-vencimientos.js, que corre con
// el cron de las 8).
//
// La ven admin, RRHH, Operaciones y la jefa operativa (ROLES_VER), cada una
// con su nómina. Crear, editar, "Hecho", "Ya la mandé" y borrar es solo de
// admin y RRHH (ROLES_GESTION). La nómina se arma en ./nomina.

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const limpiar = (v) => (typeof v === 'string' ? v.trim() : '') || null;

// Los que pueden ser responsables: RRHH y admin habilitados.
async function usuariosPosibles() {
    const { data, error } = await supabase
        .from('app_users')
        .select('id, name, surname, username')
        .in('role', ROLES_GESTION)
        .eq('login_enabled', true)
        .order('name');
    if (error) throw error;
    return (data || []).map((u) => ({
        id: u.id,
        nombre: [u.name, u.surname].filter(Boolean).join(' ').trim() || u.username,
    }));
}

// Valida y arma los campos editables. Devuelve { campos } o { error }.
async function leerCampos(body, session) {
    const titulo = limpiar(body?.titulo);
    if (!titulo) return { error: 'Poné qué documentación es.' };
    if (!FECHA_RE.test(body?.fecha || '')) return { error: 'Elegí la fecha.' };

    const cada = body?.cada_meses === null || body?.cada_meses === '' || body?.cada_meses === undefined
        ? null : Number(body.cada_meses);
    if (cada !== null && (!Number.isInteger(cada) || cada < 1 || cada > 24)) {
        return { error: 'Cada cuántos meses: un número de 1 a 24.' };
    }

    const posibles = new Set((await usuariosPosibles()).map((u) => u.id));
    let responsables = Array.isArray(body?.responsables) ? body.responsables.filter((id) => posibles.has(id)) : [];
    // Sin nadie elegido, le avisa a quien lo carga.
    if (!responsables.length && session?.appUserId && posibles.has(session.appUserId)) {
        responsables = [session.appUserId];
    }
    if (!responsables.length) return { error: 'Elegí a quién avisarle.' };

    return {
        campos: {
            titulo,
            nota: limpiar(body?.nota),
            fecha: body.fecha,
            cada_meses: cada,
            dia_mes: Number(body.fecha.slice(8, 10)),
            responsables: [...new Set(responsables)],
        },
    };
}

const CAMPOS = 'id, titulo, nota, fecha, cada_meses, dia_mes, responsables, creado_por, estado';

export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES_VER);
    if (denied) return denied;

    try {
        const { searchParams } = new URL(request.url);
        const session = await getSessionFromRequest(request);
        const puedeGestionar = ROLES_GESTION.includes(session?.role);
        // Los responsables posibles solo le sirven a quien edita.
        const usuarios = puedeGestionar ? await usuariosPosibles() : [];

        // El detalle: la documentación y su nómina vigente.
        if (searchParams.has('id')) {
            const id = Number(searchParams.get('id'));
            const { data: vencimiento, error } = await supabase
                .from('rrhh_vencimientos')
                .select(`${CAMPOS}, anulado_at`)
                .eq('id', id || 0)
                .maybeSingle();
            if (error) throw error;
            if (!vencimiento || vencimiento.anulado_at) {
                return Response.json({ error: 'Esa documentación no existe.' }, { status: 404 });
            }
            await limpiarBajas([id]);
            const { anulado_at: _anulado, ...v } = vencimiento;
            return Response.json({ vencimiento: v, nomina: await nominaVigente(id), usuarios, puede_gestionar: puedeGestionar });
        }

        // Antes de contar, se sacan de las nóminas los que se dieron de baja:
        // si no, la lista los contaría hasta que alguien abra el detalle.
        await limpiarBajas();
        const [{ data, error }, resumen] = await Promise.all([
            supabase
                .from('rrhh_vencimientos')
                .select(`${CAMPOS}, rrhh_vencimientos_avisos (fecha_vencimiento, dias_antes, estado, destinatarios, dispositivos, ultimo_error, enviado_at)`)
                .is('anulado_at', null)
                .eq('estado', 'pendiente')
                .order('fecha', { ascending: true })
                .order('id', { ascending: true }),
            resumenVigente(),
        ]);
        if (error) throw error;

        return Response.json({
            usuarios,
            puede_gestionar: puedeGestionar,
            vencimientos: (data || []).map(({ rrhh_vencimientos_avisos: avisos, ...v }) => ({
                ...v,
                // Solo los avisos de la fecha actual: los de vencimientos
                // anteriores (en los que se repiten) ya no dicen nada.
                avisos: (avisos || []).filter((a) => a.fecha_vencimiento === v.fecha),
                nomina_total: resumen[v.id]?.total || 0,
                pendientes: resumen[v.id]?.pendientes || 0,
            })),
        });
    } catch (error) {
        console.error('Error listando la documentación mensual:', error);
        return Response.json({ error: 'No se pudo cargar la documentación.' }, { status: 500 });
    }
}

export async function POST(request) {
    const denied = await denyUnlessRole(request, ROLES_GESTION);
    if (denied) return denied;

    try {
        const session = await getSessionFromRequest(request);
        const { campos, error: invalido } = await leerCampos(await request.json(), session);
        if (invalido) return Response.json({ error: invalido }, { status: 400 });

        const { data, error } = await supabase
            .from('rrhh_vencimientos')
            .insert({ ...campos, creado_por: await quienEs(session) })
            .select()
            .single();
        if (error) throw error;
        return Response.json(data, { status: 201 });
    } catch (error) {
        console.error('Error creando vencimiento:', error);
        return Response.json({ error: 'No se pudo guardar.' }, { status: 500 });
    }
}

// Editar ({ id, ...campos }) o marcar hecho ({ id, accion: 'hecho' }).
export async function PATCH(request) {
    const denied = await denyUnlessRole(request, ROLES_GESTION);
    if (denied) return denied;

    try {
        const session = await getSessionFromRequest(request);
        const body = await request.json();
        const id = Number(body?.id);
        if (!id) return Response.json({ error: 'Falta el id.' }, { status: 400 });

        const { data: actual, error: eActual } = await supabase
            .from('rrhh_vencimientos')
            .select('id, fecha, cada_meses, dia_mes, estado, anulado_at')
            .eq('id', id)
            .maybeSingle();
        if (eActual) throw eActual;
        if (!actual || actual.anulado_at) return Response.json({ error: 'Esa documentación no existe.' }, { status: 404 });

        const quien = await quienEs(session);

        if (body.accion === 'hecho') {
            if (actual.estado !== 'pendiente') {
                return Response.json({ error: 'Ya estaba marcado como hecho.' }, { status: 409 });
            }
            // Primero el registro: su UNIQUE (vencimiento + fecha) es lo que
            // impide que un doble clic avance la fecha dos veces.
            const { error: eHecho } = await supabase
                .from('rrhh_vencimientos_hechos')
                .insert({ vencimiento_id: id, fecha_vencimiento: actual.fecha, hecho_por: quien });
            if (eHecho) {
                if (eHecho.code !== '23505') throw eHecho;
                // Ya había un "hecho" para esta fecha. Si el vencimiento sigue en
                // esa fecha, alguien lo deshizo editándolo (le volvió a poner la
                // fecha, pasó el 29/10): se marca de nuevo. Si ya avanzó, fue un
                // doble clic y no se toca.
                const { data: ahora, error: eAhora } = await supabase
                    .from('rrhh_vencimientos').select('fecha, estado').eq('id', id).single();
                if (eAhora) throw eAhora;
                if (ahora.estado !== 'pendiente' || ahora.fecha !== actual.fecha) {
                    return Response.json({ error: 'Ya estaba marcado como hecho.' }, { status: 409 });
                }
                const { error: eRehecho } = await supabase
                    .from('rrhh_vencimientos_hechos')
                    .update({ hecho_por: quien, hecho_at: new Date().toISOString() })
                    .eq('vencimiento_id', id)
                    .eq('fecha_vencimiento', actual.fecha);
                if (eRehecho) throw eRehecho;
            }

            // El que se repite pasa a la fecha siguiente; el de una vez se cierra.
            // El eq('fecha') hace que dos clics simultáneos avancen una sola vez.
            const cambios = actual.cada_meses
                ? { fecha: siguienteFecha(actual.fecha, actual.cada_meses, actual.dia_mes) }
                : { estado: 'hecho' };
            const { data, error } = await supabase
                .from('rrhh_vencimientos')
                .update({ ...cambios, actualizado_por: quien, updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('fecha', actual.fecha)
                .select();
            if (error) throw error;
            if (!data?.length) return Response.json({ error: 'Ya estaba marcado como hecho.' }, { status: 409 });
            return Response.json(data[0]);
        }

        const { campos, error: invalido } = await leerCampos(body, session);
        if (invalido) return Response.json({ error: invalido }, { status: 400 });

        const { data, error } = await supabase
            .from('rrhh_vencimientos')
            .update({ ...campos, actualizado_por: quien, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return Response.json(data);
    } catch (error) {
        console.error('Error actualizando vencimiento:', error);
        return Response.json({ error: 'No se pudo guardar.' }, { status: 500 });
    }
}

// Borrar es anular, como en el resto del sistema.
export async function DELETE(request) {
    const denied = await denyUnlessRole(request, ROLES_GESTION);
    if (denied) return denied;

    try {
        const { searchParams } = new URL(request.url);
        const id = Number(searchParams.get('id'));
        if (!id) return Response.json({ error: 'Falta el id.' }, { status: 400 });

        const { data, error } = await supabase
            .from('rrhh_vencimientos')
            .update({ anulado_at: new Date().toISOString(), anulado_por: await quienEs(await getSessionFromRequest(request)) })
            .eq('id', id)
            .is('anulado_at', null)
            .select('id');
        if (error) throw error;
        if (!data?.length) return Response.json({ error: 'Esa documentación no existe o ya estaba borrada.' }, { status: 404 });
        return Response.json({ ok: true });
    } catch (error) {
        console.error('Error anulando vencimiento:', error);
        return Response.json({ error: 'No se pudo borrar.' }, { status: 500 });
    }
}
