import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { getSessionFromRequest } from '@/lib/authCookie';

// Movimientos de vacaciones: los dias que cada uno usa de los que le
// corresponden.
//
// Se carga la FECHA DE INICIO y la CANTIDAD de dias; la fecha de fin la calcula
// el servidor. Elegir las dos puntas a mano es lo que produjo las cargas viejas
// de 8, 15 y 4 dias, que no cuadran con semanas completas.

const ROLES_LECTURA = ['admin', 'rrhh', 'direccion'];
// Direccion consulta el saldo pero no carga movimientos: es un dato de RRHH.
const ROLES_ESCRITURA = ['admin', 'rrhh'];

// 'ajuste' existe en la base pero NO se ofrece en la pantalla: el usuario no le
// encontró un caso de uso ("no sé en qué casos se usaría"), y un tipo que nadie
// entiende se usa mal. Corregir se hace anulando el movimiento equivocado y
// cargando el correcto, que además deja el rastro de qué pasó.
const TIPOS = ['tomado', 'pagado', 'ajuste'];
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

const limpiar = (v) => (typeof v === 'string' ? v.trim() : '') || null;

const todayAR = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

/**
 * Suma dias corridos a una fecha, contando el primero.
 * Del 3/11 por 14 dias -> 16/11, no 17.
 */
export function sumarDias(desde, dias) {
    // Valida antes de calcular: hoy la ruta ya chequea el formato, pero si
    // mañana esto se llama desde otro lado, una fecha a medias produciría un
    // "Invalid time value" en vez de un error entendible.
    if (!FECHA_RE.test(desde || '') || !Number.isFinite(dias) || dias < 1) return null;
    const [a, m, d] = desde.split('-').map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const base = new Date(Date.UTC(a, m - 1, d + dias - 1));
    return Number.isNaN(base.getTime()) ? null : base.toISOString().slice(0, 10);
}

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
        const empleadoId = Number(searchParams.get('empleado_id')) || null;
        const periodo = Number(searchParams.get('periodo')) || null;
        const incluirAnulados = searchParams.get('anulados') === '1';

        let q = supabase
            .from('vacaciones_movimientos')
            .select('*, employees:employee_id (nombre, apellido, legajo)')
            .order('fecha_desde', { ascending: false, nullsFirst: false })
            .order('id', { ascending: false });

        if (empleadoId) q = q.eq('employee_id', empleadoId);
        if (periodo) q = q.eq('periodo', periodo);
        if (!incluirAnulados) q = q.is('anulado_at', null);

        const { data, error } = await q;
        if (error) throw error;

        return Response.json((data || []).map(m => ({
            ...m,
            nombre: m.employees ? `${m.employees.apellido} ${m.employees.nombre}`.trim() : null,
            legajo: m.employees?.legajo || null,
            employees: undefined,
        })));
    } catch (error) {
        console.error('Error listando movimientos de vacaciones:', error);
        return Response.json({ error: 'No se pudieron cargar los movimientos.' }, { status: 500 });
    }
}

/**
 * POST: crea uno o VARIOS movimientos.
 *
 * Acepta `{ movimientos: [...] }` o un movimiento suelto en la raíz. Lo de
 * varios existe porque cargar vacaciones casi siempre son DOS movimientos a la
 * vez —se toma unos días y cobra el resto— y antes la pantalla mandaba dos
 * requests seguidos: si el primero entraba y el segundo fallaba, quedaba media
 * carga, el saldo bajaba a la mitad de lo que correspondía y nadie se enteraba.
 *
 * Con un solo insert entran los dos o ninguno, sin transacción explícita.
 */
export async function POST(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const body = await request.json();
        const entrada = Array.isArray(body?.movimientos) ? body.movimientos : [body];
        if (!entrada.length) {
            return Response.json({ error: 'No mandaste ningún movimiento.' }, { status: 400 });
        }

        // Cuando vino un solo movimiento los mensajes no llevan número de ítem:
        // "en el ítem 1" sobre algo que es lo único que mandaste confunde.
        const varios = entrada.length > 1;
        const en = (i) => (varios ? ` en el ítem ${i + 1}` : '');

        const periodoComun = Number(body?.periodo) || Number(todayAR().slice(0, 4));

        const filas = [];
        for (const [i, m] of entrada.entries()) {
            const employeeId = Number(m?.employee_id ?? body?.employee_id);
            if (!employeeId) {
                return Response.json({ error: `Elegí a quién corresponden los días${en(i)}.` }, { status: 400 });
            }

            const tipo = TIPOS.includes(m?.tipo) ? m.tipo : null;
            if (!tipo) {
                return Response.json({ error: `Tipo de movimiento inválido${en(i)}.` }, { status: 400 });
            }

            const cantidad = Math.trunc(Number(m?.cantidad));
            if (!Number.isFinite(cantidad) || cantidad === 0) {
                return Response.json({ error: `Poné la cantidad de días${en(i)}.` }, { status: 400 });
            }
            // Solo el ajuste puede ser negativo: es la via para corregir de menos.
            if (cantidad < 0 && tipo !== 'ajuste') {
                return Response.json(
                    { error: `La cantidad${en(i)} tiene que ser positiva. Para restar días usá un ajuste.` },
                    { status: 400 }
                );
            }

            let fechaDesde = null;
            let fechaHasta = null;
            if (tipo === 'tomado') {
                // Los dias tomados son una ausencia concreta: sin fecha no se sabe
                // cuando falta la persona ni se puede planificar la cobertura.
                if (!FECHA_RE.test(m?.fecha_desde || '')) {
                    return Response.json({ error: `Poné desde qué día se toma las vacaciones${en(i)}.` }, { status: 400 });
                }
                fechaDesde = m.fecha_desde;
                fechaHasta = sumarDias(fechaDesde, cantidad);
                // Una fecha con formato válido pero imposible (mes 13, día 45) pasa
                // el regex y falla acá. Mejor rechazarla que guardar el período con
                // la fecha de fin vacía.
                if (!fechaHasta) {
                    return Response.json({ error: `La fecha de inicio no es válida${en(i)}.` }, { status: 400 });
                }
            }

            filas.push({
                employee_id: employeeId,
                periodo: Number(m?.periodo) || periodoComun,
                tipo,
                cantidad,
                fecha_desde: fechaDesde,
                fecha_hasta: fechaHasta,
                nota: limpiar(m?.nota ?? body?.nota),
            });
        }

        // Dos períodos tomados que se pisan son siempre un error de carga.
        //
        // Se mira contra la base Y entre los ítems del mismo envío. Lo segundo
        // no hacía falta cuando entraba un movimiento por request: ahora dos
        // tramos que se pisan entre sí pasarían los dos el chequeo contra la
        // base, porque ninguno está guardado todavía.
        const tomados = filas.filter((f) => f.tipo === 'tomado');
        for (const [i, f] of tomados.entries()) {
            for (const otro of tomados.slice(i + 1)) {
                if (f.employee_id !== otro.employee_id) continue;
                if (f.fecha_desde <= otro.fecha_hasta && f.fecha_hasta >= otro.fecha_desde) {
                    return Response.json({
                        error: `Mandaste dos períodos que se pisan: del ${f.fecha_desde} al ${f.fecha_hasta} `
                            + `y del ${otro.fecha_desde} al ${otro.fecha_hasta}.`,
                    }, { status: 400 });
                }
            }
        }

        for (const f of tomados) {
            const { data: choque, error: eChoque } = await supabase
                .from('vacaciones_movimientos')
                .select('id, fecha_desde, fecha_hasta')
                .eq('employee_id', f.employee_id)
                .eq('tipo', 'tomado')
                .is('anulado_at', null)
                .lte('fecha_desde', f.fecha_hasta)
                .gte('fecha_hasta', f.fecha_desde);
            if (eChoque) throw eChoque;
            if (choque?.length) {
                const c = choque[0];
                return Response.json({
                    error: `Ya tiene vacaciones cargadas del ${c.fecha_desde} al ${c.fecha_hasta}. `
                        + 'Revisá las fechas o anulá el movimiento anterior.',
                }, { status: 409 });
            }
        }

        const quien = await quienEs(await getSessionFromRequest(request));

        const { data, error } = await supabase
            .from('vacaciones_movimientos')
            .insert(filas.map((f) => ({ ...f, registrado_por: quien })))
            .select();
        if (error) throw error;

        // Respuesta retrocompatible: quien mandó un movimiento suelto sigue
        // recibiendo el movimiento, no un envoltorio.
        return Response.json(
            varios ? { creados: data.length, movimientos: data } : data[0],
            { status: 201 }
        );
    } catch (error) {
        console.error('Error creando movimiento de vacaciones:', error);
        return Response.json({ error: 'No se pudo guardar: ' + (error.message || '') }, { status: 500 });
    }
}

// Borrar es anular: el saldo tiene que poder reconstruirse.
export async function DELETE(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const { searchParams } = new URL(request.url);
        const id = Number(searchParams.get('id'));
        if (!id) return Response.json({ error: 'Falta el id del movimiento.' }, { status: 400 });

        const quien = await quienEs(await getSessionFromRequest(request));
        const { data, error } = await supabase
            .from('vacaciones_movimientos')
            .update({
                anulado_at: new Date().toISOString(),
                anulado_por: quien,
                anulado_motivo: limpiar(searchParams.get('motivo')),
            })
            .eq('id', id)
            .is('anulado_at', null)
            .select();
        if (error) throw error;

        if (!data?.length) {
            return Response.json({ error: 'Ese movimiento no existe o ya estaba anulado.' }, { status: 404 });
        }
        return Response.json({ anulado: data[0] });
    } catch (error) {
        console.error('Error anulando movimiento de vacaciones:', error);
        return Response.json({ error: 'No se pudo anular el movimiento.' }, { status: 500 });
    }
}
