import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { getSessionFromRequest } from '@/lib/authCookie';
import {
    ROLES_LECTURA, ROLES_ESCRITURA, TIPOS, ESTADOS, traerTodo, calcularStock, calcularEnRotacion, calcularACargo,
} from '@/lib/uniformes';

// Libro de movimientos de uniformes. Es la fuente de verdad: el stock se deriva
// de esta tabla, no hay ninguna columna de saldo.
//
// El POST acepta VARIOS movimientos en un request porque vestir a alguien que
// entra son 4-6 prendas de una sola vez. Con ~37 ingresos por mes, obligar a un
// request (y un formulario) por prenda es la friccion que hace que el modulo se
// abandone a las dos semanas.

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
// El supervisor es opcional en TODOS los movimientos. La entrega lo exigía,
// pero hay entregas sin supervisor de por medio y el usuario pidió poder
// cargarlas igual (2026-10-06). Sin supervisor, la prenda sale del armario y
// cuenta en "la calle" sin quedar a cargo de nadie.

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
        // Lo que tiene y lo que devolvió un operario (la tarjeta del legajo).
        const empleadoId = Number(searchParams.get('employee_id')) || null;
        // Los anulados no se mezclan con los vigentes: van al pie de la lista.
        const soloAnulados = searchParams.get('anulados') === '1';

        const filas = await traerTodo(() => {
            let q = supabase
                .from('uniformes_movimientos')
                .select(`
                    *,
                    uniformes_prendas:prenda_id (prenda, talle),
                    supervisors:supervisor_id (id, app_users:app_user_id (name, surname)),
                    employees:employee_id (apellido, nombre, legajo)
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
            if (empleadoId) q = q.eq('employee_id', empleadoId);
            return q;
        });

        const salida = filas.map((m) => {
            const u = m.supervisors?.app_users;
            return {
                ...m,
                prenda: m.uniformes_prendas?.prenda || null,
                talle: m.uniformes_prendas?.talle || null,
                supervisor_nombre: u ? [u.name, u.surname].filter(Boolean).join(' ').trim() : null,
                operario_nombre: m.employees ? `${m.employees.apellido} ${m.employees.nombre}`.trim() : null,
                operario_legajo: m.employees?.legajo || null,
                uniformes_prendas: undefined,
                supervisors: undefined,
                employees: undefined,
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

            const fecha = FECHA_RE.test(m?.fecha || '') ? m.fecha : fechaComun;

            filas.push({
                fecha,
                prenda_id: prendaId,
                tipo,
                estado,
                cantidad,
                // Se guarda en cualquier tipo si viene: antes se descartaba en
                // silencio salvo en entrega y devolucion, asi que elegir un
                // supervisor en una compra no dejaba rastro. Sin supervisor
                // tiene que quedar NULL y no 0 (Number(null) es 0, que
                // apuntaría a un supervisor inexistente).
                supervisor_id: supervisorId ? Number(supervisorId) : null,
                employee_id: m?.employee_id ? Number(m.employee_id) : (body?.employee_id ? Number(body.employee_id) : null),
                para_nombre: limpiar(m?.para_nombre ?? body?.para_nombre),
                precio_unitario: precioPorPrenda.get(prendaId),
                nota: limpiar(m?.nota ?? body?.nota),
            });
        }

        // Toda entrega es a un operario (decisión del usuario, 2026-10-19): así
        // queda en su legajo con la fecha, que es lo que permite saber qué tiene
        // cada uno y calcular las renovaciones.
        const sinOperario = filas.find((f) => f.tipo === 'entrega' && !f.employee_id);
        if (sinOperario) {
            return Response.json({ error: 'Elegí a qué operario se le entrega.' }, { status: 400 });
        }
        const empleadosIds = [...new Set(filas.map((f) => f.employee_id).filter(Boolean))];
        if (empleadosIds.length) {
            const { data: existen, error: eEmp } = await supabase
                .from('employees').select('id').in('id', empleadosIds);
            if (eEmp) throw eEmp;
            if ((existen || []).length !== empleadosIds.length) {
                return Response.json({ error: 'Ese operario no está en el legajo.' }, { status: 400 });
            }
        }

        // Los movimientos vigentes: hacen falta para validar lo que sale y para
        // repartir las devoluciones. Se traen una sola vez.
        const necesitaLibro = filas.some((f) => ['entrega', 'descarte', 'devolucion'].includes(f.tipo));
        const libro = necesitaLibro
            ? await traerTodo(() =>
                supabase.from('uniformes_movimientos')
                    .select('prenda_id, tipo, estado, cantidad, employee_id, fecha, anulado_at')
                    .is('anulado_at', null)
                    .order('id'))
            : [];

        // Una devolución solo puede bajar "la calle" de lo que figura entregado.
        //
        // La ropa que se repartió antes del sistema nunca tuvo su entrega
        // cargada: devolverla como devolución dejaba "en la calle" en negativo
        // (pasó el 24/09), y la pantalla mandaba a usar Corregir. Ahora se carga
        // siempre como devolución y acá se reparte sola: lo que figuraba
        // entregado (a ese operario, o a alguien si no se sabe de quién es) es
        // devolución; lo que sobra entra al armario como corrección, sin tocar
        // la calle. Quien carga no tiene que saber nada de esto.
        let sinRegistro = 0;
        if (filas.some((f) => f.tipo === 'devolucion')) {
            const aCargo = calcularACargo(libro);
            const { porPrenda: enCalle } = calcularEnRotacion(libro);
            const usado = new Map();   // lo que ya se descontó en este mismo envío
            const repartidas = [];
            for (const f of filas) {
                if (f.tipo !== 'devolucion') { repartidas.push(f); continue; }
                const clave = `${f.employee_id || 'x'}|${f.prenda_id}`;
                const tenia = f.employee_id
                    ? (aCargo.get(f.employee_id)?.get(f.prenda_id)?.cantidad || 0)
                    : Math.max(0, enCalle.get(f.prenda_id) || 0);
                const queda = Math.max(0, tenia - (usado.get(clave) || 0));
                const devuelve = Math.min(f.cantidad, queda);
                const sobra = f.cantidad - devuelve;
                usado.set(clave, (usado.get(clave) || 0) + devuelve);
                if (devuelve > 0) repartidas.push({ ...f, cantidad: devuelve });
                if (sobra > 0) {
                    sinRegistro += sobra;
                    repartidas.push({
                        ...f,
                        tipo: 'ajuste',
                        cantidad: sobra,
                        nota: ['Devolución de ropa que no figuraba entregada', f.nota].filter(Boolean).join(' · '),
                    });
                }
            }
            filas.splice(0, filas.length, ...repartidas);
        }

        // No se puede sacar del armario lo que no hay.
        //
        // La pantalla ya avisaba ("hay 5, estás sacando 7") pero no frenaba, y
        // acá no habia ninguna validacion: asi quedaron stocks en -2, que es
        // imposible. Se valida por ESTADO, no por total: entregar 7 nuevos
        // teniendo 5 nuevos y 7 usados sigue siendo sacar 2 nuevos de mas.
        //
        // El ajuste queda afuera a proposito: justamente es la via para
        // corregir un conteo, y a veces hay que bajarlo.
        const TIPOS_QUE_SACAN = ['entrega', 'descarte'];
        const aSacar = filas.filter((f) => TIPOS_QUE_SACAN.includes(f.tipo));
        if (aSacar.length) {
            const stock = calcularStock(libro);

            // Lo pedido se acumula: dos lineas de la misma prenda+estado en el
            // mismo envio tienen que contarse juntas contra el mismo stock.
            const pedido = new Map();
            for (const f of aSacar) {
                const clave = `${f.prenda_id}|${f.estado}`;
                pedido.set(clave, (pedido.get(clave) || 0) + Math.abs(f.cantidad));
            }

            for (const [clave, cuanto] of pedido) {
                const [prendaId, estado] = clave.split('|');
                const s = stock.get(Number(prendaId));
                const hay = estado === 'usado' ? (s?.usado || 0) : (s?.nuevo || 0);
                if (cuanto > hay) {
                    const p = prendas.find((x) => x.id === Number(prendaId));
                    const nombre = p ? `${p.prenda} ${p.talle}` : `prenda ${prendaId}`;
                    return Response.json({
                        error: `No hay stock: de ${nombre} ${estado} hay ${hay} y estás sacando ${cuanto}. Si el conteo del armario está mal, corregilo primero con "Corregir".`,
                    }, { status: 400 });
                }
            }
        }

        const quien = await quienEs(await getSessionFromRequest(request));
        const { data, error } = await supabase
            .from('uniformes_movimientos')
            .insert(filas.map((f) => ({ ...f, registrado_por: quien })))
            .select();
        if (error) throw error;

        return Response.json({ creados: data.length, movimientos: data, sin_registro: sinRegistro }, { status: 201 });
    } catch (error) {
        console.error('Error registrando movimientos de uniformes:', error);
        return Response.json({ error: 'No se pudo registrar el movimiento.' }, { status: 500 });
    }
}

// Corregir cuánto tiene un operario de una prenda, desde su legajo.
//
// Antes la única forma era "Corregir" en /uniformes, que es un ajuste del
// armario: arreglaba el stock pero la persona seguía figurando con lo que se
// cargó mal (pasó el 23/10: una entrega cargada dos veces). Acá se corrige la
// ENTREGA misma, y como el stock sale de las mismas filas, se arreglan los dos
// juntos.
//
// Nada se pisa: la entrega mal cargada se anula con el motivo y se carga de
// nuevo con la cantidad buena, la misma fecha y los mismos datos.
export async function PATCH(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const body = await request.json();
        const empleadoId = Number(body?.employee_id);
        const prendaId = Number(body?.prenda_id);
        const nueva = Number(body?.cantidad);
        if (!empleadoId || !prendaId) {
            return Response.json({ error: 'Falta el operario o la prenda.' }, { status: 400 });
        }
        if (!Number.isInteger(nueva) || nueva < 0) {
            return Response.json({ error: 'La cantidad tiene que ser un número entero, 0 o más.' }, { status: 400 });
        }

        // Toda la prenda: lo del operario y, para la validación de stock, el resto.
        const libro = await traerTodo(() =>
            supabase.from('uniformes_movimientos')
                .select('*')
                .eq('prenda_id', prendaId)
                .is('anulado_at', null)
                .order('fecha', { ascending: false })
                .order('id', { ascending: false })
        );
        const tenia = calcularACargo(libro).get(empleadoId)?.get(prendaId)?.cantidad || 0;
        if (nueva === tenia) return Response.json({ sinCambios: true });

        // De la más nueva a la más vieja: lo que se cargó de más casi siempre
        // es lo último.
        const entregas = libro.filter((m) => m.tipo === 'entrega' && m.employee_id === empleadoId);
        if (!entregas.length) {
            return Response.json({ error: 'No tiene entregas de esa prenda para corregir. Para darle algo, usá Entregar en Uniformes.' }, { status: 400 });
        }

        // [{ vieja, cantidad }]: cada entrega que cambia y con cuánto queda.
        const cambios = [];
        if (nueva < tenia) {
            let sobra = tenia - nueva;
            for (const e of entregas) {
                if (!sobra) break;
                const c = Math.abs(Number(e.cantidad));
                const saca = Math.min(c, sobra);
                cambios.push({ vieja: e, cantidad: c - saca });
                sobra -= saca;
            }
        } else {
            const e = entregas[0];
            const suma = nueva - tenia;
            // Subir una entrega común saca más del armario: tiene que haber.
            // La que vino de un traspaso (ropa repartida antes del sistema) no
            // toca el armario, así que no se valida.
            if (!e.traspaso_id) {
                const s = calcularStock(libro).get(prendaId);
                const hay = e.estado === 'usado' ? (s?.usado || 0) : (s?.nuevo || 0);
                if (suma > hay) {
                    return Response.json({ error: `No hay stock: quedan ${hay} ${e.estado === 'usado' ? 'usadas' : 'nuevas'} y estás sumando ${suma}.` }, { status: 400 });
                }
            }
            cambios.push({ vieja: e, cantidad: Math.abs(Number(e.cantidad)) + suma });
        }

        // Una entrega de traspaso va de a par con una devolución sin operario
        // (la que la saca de "la calle"): si cambia una y no la otra, el
        // armario se mueve cuando no tenía que moverse.
        const pares = [];
        for (const c of cambios) {
            if (!c.vieja.traspaso_id) continue;
            const par = libro.find((m) => m.tipo === 'devolucion' && !m.employee_id
                && m.traspaso_id === c.vieja.traspaso_id && !pares.some((p) => p.vieja.id === m.id));
            if (par) pares.push({ vieja: par, cantidad: c.cantidad });
        }
        const todos = [...cambios, ...pares];

        const quien = await quienEs(await getSessionFromRequest(request));
        const copia = (m, cantidad) => ({
            fecha: m.fecha, prenda_id: m.prenda_id, tipo: m.tipo, estado: m.estado, cantidad,
            supervisor_id: m.supervisor_id, employee_id: m.employee_id, para_nombre: m.para_nombre,
            precio_unitario: m.precio_unitario, nota: m.nota, traspaso_id: m.traspaso_id,
            registrado_por: m.registrado_por,
        });

        // Primero lo nuevo y después se anula lo viejo: si se cortara en el
        // medio, se borra lo nuevo y queda todo como estaba.
        const nuevas = todos.filter((c) => c.cantidad > 0).map((c) => copia(c.vieja, c.cantidad));
        let insertadas = [];
        if (nuevas.length) {
            const { data, error } = await supabase.from('uniformes_movimientos').insert(nuevas).select('id');
            if (error) throw error;
            insertadas = data || [];
        }
        const { error: eAnular } = await supabase
            .from('uniformes_movimientos')
            .update({
                anulado_at: new Date().toISOString(),
                anulado_por: quien,
                anulado_motivo: `Corrección desde el legajo: tenía ${tenia}, son ${nueva}`,
            })
            .in('id', todos.map((c) => c.vieja.id))
            .is('anulado_at', null);
        if (eAnular) {
            if (insertadas.length) {
                await supabase.from('uniformes_movimientos').delete().in('id', insertadas.map((r) => r.id));
            }
            throw eAnular;
        }

        return Response.json({ tenia, cantidad: nueva });
    } catch (error) {
        console.error('Error corrigiendo uniformes del operario:', error);
        return Response.json({ error: 'No se pudo corregir.' }, { status: 500 });
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
