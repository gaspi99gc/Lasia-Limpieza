import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { getSessionFromRequest } from '@/lib/authCookie';

// Faltas de operarios. Se registra el hecho una sola vez y de ahí salen después
// las horas perdidas, la cobertura y lo que se le descuenta al cliente.
//
// Quien avisa es el propio operario, así que esto se carga en el momento, con la
// persona al teléfono: la ruta acepta lo mínimo y completa el resto sola.

// Las faltas las carga y las borra SOLO operaciones: son ellos los que atienden
// el llamado y saben qué pasó. El resto de los roles miran. El corte va acá, en
// el servidor: esconder el botón en la pantalla no alcanza.
const ROLES_ESCRITURA = ['operaciones'];
const ROLES_LECTURA = ['operaciones', 'admin', 'jefe_operativo', 'rrhh', 'direccion'];

const MOTIVOS = ['enfermedad', 'personal', 'sin_aviso', 'accidente', 'sin_especificar'];
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

const todayAR = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

// Quién está haciendo la acción. Sale de la sesión, no de lo que mande el
// cliente: es un dato de auditoría y tiene que ser confiable. La cookie solo
// trae el id, así que el nombre se busca en app_users.
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

export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES_LECTURA);
    if (denied) return denied;

    try {
        const { searchParams } = new URL(request.url);
        const desde = searchParams.get('desde') || todayAR();
        const hasta = searchParams.get('hasta') || desde;
        if (!FECHA_RE.test(desde) || !FECHA_RE.test(hasta) || desde > hasta) {
            return Response.json({ error: 'Rango de fechas inválido' }, { status: 400 });
        }

        // Por defecto solo las vigentes. Las anuladas se piden aparte, para la
        // línea discreta al pie del día.
        const soloAnuladas = searchParams.get('anuladas') === '1';

        let query = supabase
            .from('faltas')
            .select(`
                *,
                employees:employee_id (nombre, apellido, legajo),
                services:service_id (name)
            `)
            .gte('fecha', desde)
            .lte('fecha', hasta);
        query = soloAnuladas
            ? query.not('anulada_at', 'is', null).order('anulada_at', { ascending: false })
            : query.is('anulada_at', null).order('created_at', { ascending: false });

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        // El historial de ediciones viaja con cada falta: se muestra a todos los
        // que ven faltas, que es lo que desalienta el retoque silencioso. Los
        // reportes piden rangos largos y no lo necesitan: ahí se saltea.
        const conHistorial = searchParams.get('historial') !== '0';
        const ids = conHistorial ? (data || []).map(f => f.id) : [];
        const historialPorFalta = {};
        if (ids.length) {
            const { data: hist } = await supabase
                .from('faltas_historial')
                .select('falta_id, campo, valor_anterior, valor_nuevo, usuario, created_at')
                .in('falta_id', ids)
                .order('created_at', { ascending: true });
            for (const h of hist || []) {
                (historialPorFalta[h.falta_id] = historialPorFalta[h.falta_id] || []).push(h);
            }
        }

        return Response.json((data || []).map(f => ({
            ...f,
            fecha: f.fecha?.slice(0, 10),
            // Para mostrar: el nombre del legajo si matcheó, si no el del operativo.
            nombre: f.employees
                ? `${f.employees.apellido} ${f.employees.nombre}`
                : (f.nombre_excel || 'Sin identificar'),
            legajo: f.employees?.legajo || null,
            servicio: f.services?.name || f.servicio_excel || null,
            historial: historialPorFalta[f.id] || [],
        })));
    } catch (error) {
        console.error('Error listando faltas:', error);
        return Response.json({ error: 'No se pudieron cargar las faltas: ' + error.message }, { status: 500 });
    }
}

export async function POST(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const session = await getSessionFromRequest(request);
        const body = await request.json();

        const fecha = FECHA_RE.test(body.fecha || '') ? body.fecha : todayAR();

        // Una persona puede tener varios puestos el mismo dia (jornada partida,
        // dos servicios, o un adicional fijo). Si no viene, falta a TODOS: por eso
        // se aceptan varios puestos en una sola carga y se crea una falta por cada
        // uno. Registrarlas de a una seria el trabajo de mas que queremos evitar.
        const puestoIds = Array.isArray(body.puesto_ids)
            ? body.puesto_ids.map(Number).filter(Boolean)
            : (body.puesto_id ? [Number(body.puesto_id)] : []);

        if (!puestoIds.length) {
            return Response.json({ error: 'Falta indicar a qué turno o turnos faltó.' }, { status: 400 });
        }

        // Los puestos del operativo ya saben quién es y dónde: se toman de ahí en
        // vez de confiar en lo que mande el cliente.
        const { data: puestos, error: ePuestos } = await supabase
            .from('operativo_puestos')
            .select('id, employee_id, nombre_excel, service_id, servicio_excel')
            .in('id', puestoIds);
        if (ePuestos) throw new Error(ePuestos.message);
        if (!puestos?.length) {
            return Response.json({ error: 'Esos puestos del operativo no existen.' }, { status: 400 });
        }

        // Horas perdidas de cada turno: las que tenía asignadas ese día.
        const { data: celdas } = await supabase
            .from('operativo_dias')
            .select('puesto_id, hi, he')
            .in('puesto_id', puestoIds)
            .eq('fecha', fecha);
        const horasDe = new Map();
        for (const c of celdas || []) {
            if (c.hi != null && c.he != null) {
                horasDe.set(c.puesto_id, Math.round((Number(c.he) - Number(c.hi)) * 100) / 100);
            }
        }

        // Solo se acepta forzar las horas cuando es un turno solo; con varios no
        // habria forma de saber a cual corresponde el numero.
        const horasForzadas = (puestoIds.length === 1 && body.horas != null && body.horas !== '')
            ? Number(body.horas) : null;
        if (horasForzadas != null && (!Number.isFinite(horasForzadas) || horasForzadas < 0 || horasForzadas > 24)) {
            return Response.json({ error: 'Las horas tienen que estar entre 0 y 24.' }, { status: 400 });
        }

        const motivo = MOTIVOS.includes(body.motivo) ? body.motivo : 'sin_especificar';

        const registrante = await quienEs(session);

        const comun = {
            fecha,
            // "sin_aviso" es la única que por definición no avisó.
            aviso: motivo === 'sin_aviso' ? false : (body.aviso !== false),
            motivo,
            nota: (body.nota || '').trim() || null,
            registrado_por: registrante,
        };
        const filas = puestos.map(p => ({
            ...comun,
            employee_id: p.employee_id,
            nombre_excel: p.nombre_excel,
            puesto_id: p.id,
            service_id: p.service_id,
            servicio_excel: p.servicio_excel,
            horas: horasForzadas ?? horasDe.get(p.id) ?? null,
        }));

        // Una por una, para que un turno ya cargado no tire abajo el resto: es
        // normal cargar un turno y despues enterarse de que falto al dia entero.
        const creadas = [];
        const yaEstaban = [];
        for (const fila of filas) {
            const { data, error } = await supabase.from('faltas').insert(fila).select().single();
            if (error) {
                if (error.code === '23505') { yaEstaban.push(fila.servicio_excel); continue; }
                throw new Error(error.message);
            }
            creadas.push(data);
        }

        if (!creadas.length) {
            return Response.json(
                { error: 'Esa falta ya estaba registrada para ese día.', yaEstaban },
                { status: 409 }
            );
        }

        return Response.json({ creadas, yaEstaban }, { status: 201 });
    } catch (error) {
        console.error('Error registrando falta:', error);
        return Response.json({ error: 'No se pudo registrar la falta: ' + error.message }, { status: 500 });
    }
}

// Corregir una falta ya cargada. Se pueden cambiar el motivo, las horas y la
// nota; la persona y los turnos no, porque una falta de otra persona es en
// realidad otra falta (para eso se borra y se carga de nuevo).
//
// Cada cambio queda asentado en faltas_historial con quién y cuándo, y se
// muestra en la pantalla: sin eso, "editar" pasa a ser la función de tapar.
export async function PATCH(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const { searchParams } = new URL(request.url);
        const id = Number(searchParams.get('id'));
        if (!id) return Response.json({ error: 'Falta el id.' }, { status: 400 });

        const body = await request.json();

        const { data: actual, error: eActual } = await supabase
            .from('faltas').select('id, motivo, horas, nota, anulada_at').eq('id', id).maybeSingle();
        if (eActual) throw new Error(eActual.message);
        if (!actual) return Response.json({ error: 'Esa falta no existe.' }, { status: 404 });
        if (actual.anulada_at) {
            return Response.json({ error: 'Esa falta está anulada: no se puede editar.' }, { status: 409 });
        }

        const cambios = {};

        if ('motivo' in body) {
            if (!MOTIVOS.includes(body.motivo)) {
                return Response.json({ error: 'Motivo inválido.' }, { status: 400 });
            }
            if (body.motivo !== actual.motivo) cambios.motivo = body.motivo;
        }

        if ('horas' in body) {
            const h = body.horas === '' || body.horas === null ? null : Number(body.horas);
            if (h !== null && (!Number.isFinite(h) || h < 0 || h > 24)) {
                return Response.json({ error: 'Las horas tienen que estar entre 0 y 24.' }, { status: 400 });
            }
            if (Number(actual.horas) !== h) cambios.horas = h;
        }

        if ('nota' in body) {
            const n = (body.nota || '').trim() || null;
            if (n !== actual.nota) cambios.nota = n;
        }

        if (!Object.keys(cambios).length) {
            return Response.json({ sinCambios: true, falta: actual });
        }

        const session = await getSessionFromRequest(request);
        const usuario = await quienEs(session);

        // "sin_aviso" es la única que por definición no avisó: si cambia el
        // motivo, el flag tiene que seguirlo.
        const update = { ...cambios, updated_at: new Date().toISOString() };
        if (cambios.motivo) update.aviso = cambios.motivo !== 'sin_aviso';

        const { data: nueva, error } = await supabase
            .from('faltas').update(update).eq('id', id).select().single();
        if (error) throw new Error(error.message);

        // El asiento va DESPUÉS de que el cambio se guardó: si falla el update,
        // no queda un historial de algo que no pasó.
        const asientos = Object.entries(cambios).map(([campo, valorNuevo]) => ({
            falta_id: id,
            campo,
            valor_anterior: actual[campo] === null || actual[campo] === undefined ? null : String(actual[campo]),
            valor_nuevo: valorNuevo === null ? null : String(valorNuevo),
            usuario,
        }));
        const { error: eHist } = await supabase.from('faltas_historial').insert(asientos);
        if (eHist) console.error('No se pudo guardar el historial de la falta', id, eHist.message);

        return Response.json({ falta: nueva, cambios: Object.keys(cambios) });
    } catch (error) {
        console.error('Error editando falta:', error);
        return Response.json({ error: 'No se pudo editar: ' + error.message }, { status: 500 });
    }
}

// Borrar una falta la ANULA: sale de la lista igual que antes, pero la fila
// queda con quién la anuló y cuándo. Si editar deja rastro y borrar no, el que
// quiera tapar un error simplemente borra.
//
// Además, una falta borrada por error ahora se puede recuperar.
export async function DELETE(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const { searchParams } = new URL(request.url);
        const id = Number(searchParams.get('id'));
        if (!id) return Response.json({ error: 'Falta el id.' }, { status: 400 });

        const session = await getSessionFromRequest(request);
        const { data, error } = await supabase
            .from('faltas')
            .update({ anulada_at: new Date().toISOString(), anulada_por: await quienEs(session) })
            .eq('id', id)
            .is('anulada_at', null)   // no re-anular una ya anulada
            .select('id')
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return Response.json({ error: 'Esa falta no existe o ya estaba anulada.' }, { status: 404 });

        return Response.json({ ok: true });
    } catch (error) {
        console.error('Error anulando falta:', error);
        return Response.json({ error: 'No se pudo borrar: ' + error.message }, { status: 500 });
    }
}
