import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { getSessionFromRequest } from '@/lib/authCookie';
import { ROLES_LECTURA, ROLES_ESCRITURA, TIPOS, ESTADOS, traerTodo } from '@/lib/uniformes';

// Libro de movimientos de uniformes. Es la fuente de verdad: el stock se deriva
// de esta tabla, no hay ninguna columna de saldo.
//
// El POST acepta VARIOS movimientos en un request porque vestir a alguien que
// entra son 4-6 prendas de una sola vez. Con ~37 ingresos por mes, obligar a un
// request (y un formulario) por prenda es la friccion que hace que el modulo se
// abandone a las dos semanas.

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIPOS_CON_SUPERVISOR = ['entrega', 'devolucion'];

const todayAR = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

const limpiar = (v) => (typeof v === 'string' ? v.trim() : '') || null;

// Quien esta haciendo la accion. Sale de la sesion, no de lo que mande el
// cliente: es un dato de auditoria y tiene que ser confiable.
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
        const desde = searchParams.get('desde');
        const hasta = searchParams.get('hasta');
        const prendaId = searchParams.get('prenda_id');
        const supervisorId = searchParams.get('supervisor_id');
        const tipo = searchParams.get('tipo');
        // Los anulados no se mezclan con los vigentes: van al pie de la lista.
        const soloAnulados = searchParams.get('anulados') === '1';

        const filas = await traerTodo(() => {
            let q = supabase
                .from('uniformes_movimientos')
                .select(`
                    *,
                    uniformes_prendas:prenda_id (prenda, talle),
                    supervisors:supervisor_id (id, app_users:app_user_id (name, surname))
                `)
                .order('fecha', { ascending: false })
                .order('id', { ascending: false });

            if (soloAnulados) q = q.not('anulado_at', 'is', null);
            else q = q.is('anulado_at', null);

            if (desde && FECHA_RE.test(desde)) q = q.gte('fecha', desde);
            if (hasta && FECHA_RE.test(hasta)) q = q.lte('fecha', hasta);
            if (prendaId) q = q.eq('prenda_id', Number(prendaId));
            if (supervisorId) q = q.eq('supervisor_id', Number(supervisorId));
            if (tipo && TIPOS.includes(tipo)) q = q.eq('tipo', tipo);
            return q;
        });

        const salida = filas.map((m) => {
            const u = m.supervisors?.app_users;
            return {
                ...m,
                prenda: m.uniformes_prendas?.prenda || null,
                talle: m.uniformes_prendas?.talle || null,
                supervisor_nombre: u ? [u.name, u.surname].filter(Boolean).join(' ').trim() : null,
                uniformes_prendas: undefined,
                supervisors: undefined,
            };
        });

        return Response.json(salida);
    } catch (error) {
        console.error('Error listando movimientos de uniformes:', error);
        return Response.json({ error: 'No se pudieron cargar los movimientos.' }, { status: 500 });
    }
}

export async function POST(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const body = await request.json();
        const entrada = Array.isArray(body?.movimientos) ? body.movimientos : [body];
        if (!entrada.length) {
            return Response.json({ error: 'No mandaste ningún movimiento.' }, { status: 400 });
        }

        const fechaComun = FECHA_RE.test(body?.fecha || '') ? body.fecha : todayAR();

        // Los precios se congelan al momento del movimiento: el gasto de marzo
        // no puede cambiar porque hoy se corrigio un precio.
        const prendas = await traerTodo(() =>
            supabase.from('uniformes_prendas').select('id, precio, prenda, talle').order('id')
        );
        const precioPorPrenda = new Map(prendas.map((p) => [p.id, Number(p.precio) || 0]));

        const filas = [];
        for (const [i, m] of entrada.entries()) {
            const prendaId = Number(m?.prenda_id);
            if (!precioPorPrenda.has(prendaId)) {
                return Response.json({ error: `La prenda del ítem ${i + 1} no existe.` }, { status: 400 });
            }

            const tipo = m?.tipo || body?.tipo;
            if (!TIPOS.includes(tipo)) {
                return Response.json({ error: `Tipo de movimiento inválido en el ítem ${i + 1}.` }, { status: 400 });
            }

            const estado = m?.estado || body?.estado;
            if (!ESTADOS.includes(estado)) {
                return Response.json({ error: `Estado inválido en el ítem ${i + 1}.` }, { status: 400 });
            }

            const cantidad = Math.trunc(Number(m?.cantidad));
            if (!Number.isFinite(cantidad) || cantidad === 0) {
                return Response.json({ error: `Poné una cantidad en el ítem ${i + 1}.` }, { status: 400 });
            }
            // Solo el ajuste puede ser negativo (una correccion de inventario
            // puede ser para abajo). En el resto el sentido lo pone el tipo.
            if (cantidad < 0 && tipo !== 'ajuste') {
                return Response.json(
                    { error: `La cantidad del ítem ${i + 1} tiene que ser positiva.` },
                    { status: 400 }
                );
            }

            const supervisorId = m?.supervisor_id ?? body?.supervisor_id ?? null;
            if (TIPOS_CON_SUPERVISOR.includes(tipo) && !supervisorId) {
                return Response.json(
                    { error: 'Elegí el supervisor: es quien queda responsable del uniforme.' },
                    { status: 400 }
                );
            }

            const fecha = FECHA_RE.test(m?.fecha || '') ? m.fecha : fechaComun;

            filas.push({
                fecha,
                prenda_id: prendaId,
                tipo,
                estado,
                cantidad,
                // En compra/descarte/ajuste el supervisor no aplica: son
                // movimientos de deposito.
                supervisor_id: TIPOS_CON_SUPERVISOR.includes(tipo) ? Number(supervisorId) : null,
                employee_id: m?.employee_id ? Number(m.employee_id) : (body?.employee_id ? Number(body.employee_id) : null),
                para_nombre: limpiar(m?.para_nombre ?? body?.para_nombre),
                precio_unitario: precioPorPrenda.get(prendaId),
                nota: limpiar(m?.nota ?? body?.nota),
            });
        }

        const quien = await quienEs(await getSessionFromRequest(request));
        const { data, error } = await supabase
            .from('uniformes_movimientos')
            .insert(filas.map((f) => ({ ...f, registrado_por: quien })))
            .select();
        if (error) throw error;

        return Response.json({ creados: data.length, movimientos: data }, { status: 201 });
    } catch (error) {
        console.error('Error registrando movimientos de uniformes:', error);
        return Response.json({ error: 'No se pudo registrar el movimiento.' }, { status: 500 });
    }
}

// Borrar es ANULAR. Si editar deja rastro y borrar no, el que quiera tapar un
// error simplemente borra. De paso, un movimiento anulado por error se recupera.
export async function DELETE(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const { searchParams } = new URL(request.url);
        const id = Number(searchParams.get('id'));
        if (!id) return Response.json({ error: 'Falta el id del movimiento.' }, { status: 400 });

        const motivo = limpiar(searchParams.get('motivo'));
        const quien = await quienEs(await getSessionFromRequest(request));

        const { data, error } = await supabase
            .from('uniformes_movimientos')
            .update({ anulado_at: new Date().toISOString(), anulado_por: quien, anulado_motivo: motivo })
            .eq('id', id)
            .is('anulado_at', null)   // no re-anular uno ya anulado
            .select();
        if (error) throw error;

        if (!data?.length) {
            return Response.json({ error: 'Ese movimiento no existe o ya estaba anulado.' }, { status: 404 });
        }
        return Response.json({ anulado: data[0] });
    } catch (error) {
        console.error('Error anulando movimiento de uniformes:', error);
        return Response.json({ error: 'No se pudo anular el movimiento.' }, { status: 500 });
    }
}
