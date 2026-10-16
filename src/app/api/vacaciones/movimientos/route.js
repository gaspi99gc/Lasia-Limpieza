import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { getSessionFromRequest } from '@/lib/authCookie';
import { periodoVigente } from '@/lib/quincenas-vacaciones';

// Movimientos de vacaciones: los dias que cada uno usa de los que le
// corresponden.
//
// Se carga la FECHA DE INICIO y la CANTIDAD de dias; la fecha de fin la calcula
// el servidor. Elegir las dos puntas a mano es lo que produjo las cargas viejas
// de 8, 15 y 4 dias, que no cuadran con semanas completas.

const ROLES_LECTURA = ['admin', 'rrhh', 'direccion', 'operaciones', 'jefe_operativo'];
// Direccion consulta el saldo pero no carga movimientos: es un dato de RRHH.
const ROLES_ESCRITURA = ['admin', 'rrhh'];
// Quien aprueba, rechaza o mueve lo que cargó RRHH. RRHH no aprueba lo que
// carga ella misma: el control es justamente que lo mire otra persona.
const ROLES_APROBACION = ['admin', 'jefe_operativo'];

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
        const estado = ['pendiente', 'aprobado', 'rechazado'].includes(searchParams.get('estado'))
            ? searchParams.get('estado') : null;
        // ?respuestas=15 -> lo que la jefa rechazó o movió en los últimos 15
        // días. Es lo que RRHH tiene que comunicarle al operario; lo aprobado
        // tal cual no hace falta mirarlo.
        const respuestasDias = Number(searchParams.get('respuestas')) || null;
        const tipo = TIPOS.includes(searchParams.get('tipo')) ? searchParams.get('tipo') : null;

        const consulta = () => {
            // Por id y no por fecha: paginar necesita un orden estable. El orden
            // que ve la pantalla se arma después, en memoria.
            let q = supabase
                .from('vacaciones_movimientos')
                .select(`*, employees:employee_id (nombre, apellido, legajo, estado_empleado, fecha_baja,
                    servicio:servicio_id (name))`)
                .order('id');

            if (empleadoId) q = q.eq('employee_id', empleadoId);
            if (periodo) q = q.eq('periodo', periodo);
            if (tipo) q = q.eq('tipo', tipo);
            if (!incluirAnulados) q = q.is('anulado_at', null);
            if (estado) {
                q = q.eq('estado', estado);
            } else if (!incluirAnulados && !respuestasDias) {
                // Un rechazado no cuenta para nada, igual que un anulado: por
                // defecto no se devuelve.
                q = q.neq('estado', 'rechazado');
            }
            if (respuestasDias) {
                const desde = new Date(Date.now() - respuestasDias * 86400000).toISOString();
                q = q.gte('resuelto_at', desde)
                    .or('estado.eq.rechazado,fecha_desde_original.not.is.null');
            }
            return q;
        };

        // De a 1000: es lo máximo que devuelve Supabase por consulta, y con
        // ~300 vacaciones por temporada se pasa en pocos años.
        const data = [];
        for (let desde = 0; ; desde += 1000) {
            const { data: pagina, error } = await consulta().range(desde, desde + 999);
            if (error) throw error;
            data.push(...(pagina || []));
            if (!pagina || pagina.length < 1000) break;
        }

        // Lo más nuevo primero, como estaba antes de paginar.
        data.sort((a, b) =>
            String(b.fecha_desde || '').localeCompare(String(a.fecha_desde || '')) || b.id - a.id);

        return Response.json(data.map(m => ({
            ...m,
            nombre: m.employees ? `${m.employees.apellido} ${m.employees.nombre}`.trim() : null,
            legajo: m.employees?.legajo || null,
            servicio: m.employees?.servicio?.name || null,
            de_baja: m.employees ? m.employees.estado_empleado !== 'Activo' : false,
            fecha_baja: m.employees?.fecha_baja || null,
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

        const periodoComun = Number(body?.periodo) || periodoVigente(todayAR());

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

            // Segunda opción: otra quincena que le serviría si la primera no se
            // puede. No reserva fechas; se controla si la jefa la aprueba.
            let opcion2 = null;
            if (tipo === 'tomado' && m?.fecha_desde_opcion2) {
                if (!sumarDias(m.fecha_desde_opcion2, cantidad)) {
                    return Response.json({ error: `La fecha de la 2ª opción no es válida${en(i)}.` }, { status: 400 });
                }
                if (m.fecha_desde_opcion2 === fechaDesde) {
                    return Response.json({ error: `La 2ª opción es igual a la 1ª${en(i)}.` }, { status: 400 });
                }
                opcion2 = m.fecha_desde_opcion2;
            }

            filas.push({
                fecha_desde_opcion2: opcion2,
                // Solo lo tomado pasa por la jefa operativa: es una ausencia que
                // hay que cubrir. Cobrar días o ajustar no deja a nadie sin gente.
                estado: tipo === 'tomado' ? 'pendiente' : 'aprobado',
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
                .neq('estado', 'rechazado')
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

/**
 * PATCH: la jefa operativa resuelve un pendiente.
 *
 *   { id, accion: 'aprobar' }              -> la 1ª opción
 *   { id, accion: 'aprobar_2' }            -> la 2ª opción que pidió
 *   { id, accion: 'mover', fecha_desde }   -> otra fecha; queda aprobado
 *   { id, accion: 'rechazar', nota }       -> el motivo es obligatorio
 *
 * Mover cambia solo el día de inicio: la cantidad de días la decide RRHH. Si la
 * jefa quiere otra cantidad, rechaza con el motivo y RRHH vuelve a cargar.
 */
export async function PATCH(request) {
    const denied = await denyUnlessRole(request, ROLES_APROBACION);
    if (denied) return denied;

    try {
        const body = await request.json();
        const id = Number(body?.id);
        let accion = body?.accion;
        let fechaPedida = body?.fecha_desde;
        const nota = limpiar(body?.nota);
        if (!id) return Response.json({ error: 'Falta el id del movimiento.' }, { status: 400 });
        if (!['aprobar', 'aprobar_2', 'mover', 'rechazar'].includes(accion)) {
            return Response.json({ error: 'Acción inválida.' }, { status: 400 });
        }
        if (accion === 'rechazar' && !nota) {
            return Response.json(
                { error: 'Escribí por qué se rechaza: RRHH se lo tiene que explicar al operario.' },
                { status: 400 }
            );
        }

        const { data: mov, error: eMov } = await supabase
            .from('vacaciones_movimientos')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (eMov) throw eMov;
        if (!mov || mov.anulado_at) {
            return Response.json({ error: 'Ese movimiento no existe o fue anulado.' }, { status: 404 });
        }
        if (mov.estado !== 'pendiente') {
            return Response.json({ error: `Ya estaba ${mov.estado}. Recargá la lista.` }, { status: 409 });
        }

        // Aprobar la 2ª opción es mover a la fecha que ya había pedido: así pasa
        // por el mismo control de superposición y queda guardada la 1ª.
        if (accion === 'aprobar_2') {
            if (!mov.fecha_desde_opcion2) {
                return Response.json({ error: 'No tiene 2ª opción cargada.' }, { status: 400 });
            }
            accion = 'mover';
            fechaPedida = mov.fecha_desde_opcion2;
        }

        const quien = await quienEs(await getSessionFromRequest(request));
        const cambios = {
            estado: accion === 'rechazar' ? 'rechazado' : 'aprobado',
            resuelto_por: quien,
            resuelto_at: new Date().toISOString(),
            resuelto_nota: nota,
        };

        if (accion === 'mover') {
            const nuevaDesde = fechaPedida;
            if (!FECHA_RE.test(nuevaDesde || '')) {
                return Response.json({ error: 'Elegí la nueva fecha de inicio.' }, { status: 400 });
            }
            const nuevaHasta = sumarDias(nuevaDesde, mov.cantidad);
            if (!nuevaHasta) return Response.json({ error: 'La fecha nueva no es válida.' }, { status: 400 });

            // Mismo control que al cargar, sin contarse a sí mismo.
            const { data: choque, error: eChoque } = await supabase
                .from('vacaciones_movimientos')
                .select('id, fecha_desde, fecha_hasta')
                .eq('employee_id', mov.employee_id)
                .eq('tipo', 'tomado')
                .is('anulado_at', null)
                .neq('estado', 'rechazado')
                .neq('id', id)
                .lte('fecha_desde', nuevaHasta)
                .gte('fecha_hasta', nuevaDesde);
            if (eChoque) throw eChoque;
            if (choque?.length) {
                const c = choque[0];
                return Response.json({
                    error: `Con esa fecha se pisa con otras vacaciones suyas, del ${c.fecha_desde} al ${c.fecha_hasta}.`,
                }, { status: 409 });
            }

            if (nuevaDesde !== mov.fecha_desde) {
                cambios.fecha_desde = nuevaDesde;
                cambios.fecha_hasta = nuevaHasta;
                // La fecha que cargó RRHH se guarda una sola vez y no se pisa.
                cambios.fecha_desde_original = mov.fecha_desde_original || mov.fecha_desde;
            }
        }

        // El eq('estado','pendiente') evita que dos personas resuelvan lo mismo a
        // la vez y la segunda pise a la primera.
        const { data, error } = await supabase
            .from('vacaciones_movimientos')
            .update(cambios)
            .eq('id', id)
            .eq('estado', 'pendiente')
            .is('anulado_at', null)
            .select();
        if (error) throw error;
        if (!data?.length) {
            return Response.json({ error: 'Alguien lo resolvió recién. Recargá la lista.' }, { status: 409 });
        }
        return Response.json(data[0]);
    } catch (error) {
        console.error('Error resolviendo vacaciones:', error);
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
