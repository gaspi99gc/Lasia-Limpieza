import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { getSessionFromRequest } from '@/lib/authCookie';
import { ROLES_VENCIMIENTOS, siguienteFecha } from '@/lib/vencimientos';

// Vencimientos de RRHH: lo que hay que presentar o renovar en una fecha, una
// sola vez o cada N meses. Avisan por push a los responsables elegidos (ver
// src/lib/avisos-vencimientos.js, que corre con el cron de las 8).
//
// Todo RRHH ve y edita todo: el responsable solo decide a quién le suena el
// celular.

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const limpiar = (v) => (typeof v === 'string' ? v.trim() : '') || null;

// Quién está haciendo la acción. Sale de la sesión, no de lo que mande el
// cliente: es un dato de auditoría y tiene que ser confiable.
async function quienEs(session) {
    let quien = session?.role || null;
    if (session?.appUserId) {
        const { data: u } = await supabase
            .from('app_users')
            .select('name, surname, username')
            .eq('id', session.appUserId)
            .maybeSingle();
        if (u) quien = [u.name, u.surname].filter(Boolean).join(' ').trim() || u.username || quien;
    }
    return quien;
}

// Los que pueden ser responsables: RRHH y admin habilitados.
async function usuariosPosibles() {
    const { data, error } = await supabase
        .from('app_users')
        .select('id, name, surname, username')
        .in('role', ROLES_VENCIMIENTOS)
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
    if (!titulo) return { error: 'Poné qué vence.' };
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

export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES_VENCIMIENTOS);
    if (denied) return denied;

    try {
        const { searchParams } = new URL(request.url);

        // Lo ya hecho: cada "Hecho" con quién y cuándo, lo más nuevo primero.
        if (searchParams.get('hechos') === '1') {
            const { data, error } = await supabase
                .from('rrhh_vencimientos_hechos')
                .select('id, fecha_vencimiento, hecho_por, hecho_at, rrhh_vencimientos:vencimiento_id (titulo, cada_meses, anulado_at)')
                .order('hecho_at', { ascending: false })
                .limit(300);
            if (error) throw error;
            return Response.json({
                hechos: (data || [])
                    .filter((h) => h.rrhh_vencimientos && !h.rrhh_vencimientos.anulado_at)
                    .map((h) => ({
                        id: h.id,
                        titulo: h.rrhh_vencimientos.titulo,
                        cada_meses: h.rrhh_vencimientos.cada_meses,
                        fecha_vencimiento: h.fecha_vencimiento,
                        hecho_por: h.hecho_por,
                        hecho_at: h.hecho_at,
                    })),
            });
        }

        const [{ data, error }, usuarios] = await Promise.all([
            supabase
                .from('rrhh_vencimientos')
                .select('id, titulo, nota, fecha, cada_meses, dia_mes, responsables, creado_por, rrhh_vencimientos_avisos (fecha_vencimiento, dias_antes, estado, destinatarios, dispositivos, ultimo_error, enviado_at)')
                .is('anulado_at', null)
                .eq('estado', 'pendiente')
                .order('fecha', { ascending: true })
                .order('id', { ascending: true }),
            usuariosPosibles(),
        ]);
        if (error) throw error;

        return Response.json({
            usuarios,
            vencimientos: (data || []).map(({ rrhh_vencimientos_avisos: avisos, ...v }) => ({
                ...v,
                // Solo los avisos de la fecha actual: los de vencimientos
                // anteriores (en los que se repiten) ya no dicen nada.
                avisos: (avisos || []).filter((a) => a.fecha_vencimiento === v.fecha),
            })),
        });
    } catch (error) {
        console.error('Error listando vencimientos:', error);
        return Response.json({ error: 'No se pudieron cargar los vencimientos.' }, { status: 500 });
    }
}

export async function POST(request) {
    const denied = await denyUnlessRole(request, ROLES_VENCIMIENTOS);
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
    const denied = await denyUnlessRole(request, ROLES_VENCIMIENTOS);
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
        if (!actual || actual.anulado_at) return Response.json({ error: 'Ese vencimiento no existe.' }, { status: 404 });

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
                if (eHecho.code === '23505') return Response.json({ error: 'Ya estaba marcado como hecho.' }, { status: 409 });
                throw eHecho;
            }

            // El que se repite pasa a la fecha siguiente; el de una vez se cierra.
            const cambios = actual.cada_meses
                ? { fecha: siguienteFecha(actual.fecha, actual.cada_meses, actual.dia_mes) }
                : { estado: 'hecho' };
            const { data, error } = await supabase
                .from('rrhh_vencimientos')
                .update({ ...cambios, actualizado_por: quien, updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('fecha', actual.fecha)
                .select()
                .single();
            if (error) throw error;
            return Response.json(data);
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
    const denied = await denyUnlessRole(request, ROLES_VENCIMIENTOS);
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
        if (!data?.length) return Response.json({ error: 'Ese vencimiento no existe o ya estaba borrado.' }, { status: 404 });
        return Response.json({ ok: true });
    } catch (error) {
        console.error('Error anulando vencimiento:', error);
        return Response.json({ error: 'No se pudo borrar.' }, { status: 500 });
    }
}
