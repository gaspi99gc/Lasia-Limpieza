import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { ROLES_LECTURA, traerTodo, calcularACargo, renovacionesDe, sumarMeses, compararTalles } from '@/lib/uniformes';

// Quién tiene que renovar uniforme: atrasados, este mes y el que viene.
//
// Sale de las entregas a nombre de cada operario (desde el 19/10) más el plazo
// de cada prenda (meses_renovacion). Solo operarios activos: a quien se fue no
// hay que darle ropa nueva.
//
// También devuelve qué comprar, sumado por prenda y talle, para tenerlo antes
// de que haga falta.

const hoyAR = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES_LECTURA);
    if (denied) return denied;

    try {
        const [prendas, movimientos] = await Promise.all([
            traerTodo(() => supabase.from('uniformes_prendas').select('*').order('id')),
            traerTodo(() => supabase.from('uniformes_movimientos')
                .select('prenda_id, tipo, estado, cantidad, employee_id, fecha, anulado_at')
                .is('anulado_at', null)
                .not('employee_id', 'is', null)
                .in('tipo', ['entrega', 'devolucion'])
                .order('id')),
        ]);

        const hayPlazos = prendas.some((p) => Number(p.meses_renovacion) > 0);
        const hoy = hoyAR();
        const mesActual = hoy.slice(0, 7);
        const mesSiguiente = sumarMeses(`${mesActual}-01`, 1).slice(0, 7);

        const aCargo = calcularACargo(movimientos);
        const ids = [...aCargo.keys()];
        const empleados = ids.length
            ? await traerTodo(() => supabase.from('employees')
                .select('id, apellido, nombre, legajo, estado_empleado, fecha_baja, services:servicio_id (name)')
                .in('id', ids)
                .order('id'))
            : [];
        const activos = new Map(empleados
            .filter((e) => e.estado_empleado === 'Activo' && !e.fecha_baja)
            .map((e) => [e.id, e]));

        const filas = [];
        for (const [empleadoId, susPrendas] of aCargo) {
            const e = activos.get(empleadoId);
            if (!e) continue;
            for (const r of renovacionesDe(susPrendas, prendas)) {
                const mes = r.vence.slice(0, 7);
                const estado = r.vence < hoy ? 'vencida'
                    : mes === mesActual ? 'este_mes'
                        : mes === mesSiguiente ? 'proximo_mes'
                            : null;
                if (!estado) continue;
                filas.push({
                    employee_id: empleadoId,
                    nombre: `${e.apellido} ${e.nombre}`.trim(),
                    legajo: e.legajo,
                    servicio: e.services?.name || null,
                    ...r,
                    estado,
                });
            }
        }
        filas.sort((a, b) => a.vence.localeCompare(b.vence) || a.nombre.localeCompare(b.nombre, 'es'));

        // Qué comprar: lo que vence de acá al mes que viene, por prenda y talle
        // (el talle de la última entrega, que es el que usa hoy).
        const compra = new Map();
        for (const f of filas) {
            const k = `${f.prenda}|${f.talle}`;
            compra.set(k, (compra.get(k) || 0) + f.cantidad);
        }

        return Response.json({
            hayPlazos,
            hoy,
            mesActual,
            mesSiguiente,
            filas,
            compra: [...compra].map(([k, cantidad]) => {
                const [prenda, talle] = k.split('|');
                return { prenda, talle, cantidad };
            }).sort((a, b) => a.prenda.localeCompare(b.prenda, 'es') || compararTalles(a.talle, b.talle)),
        });
    } catch (error) {
        console.error('Error calculando renovaciones de uniformes:', error);
        return Response.json({ error: 'No se pudieron calcular las renovaciones.' }, { status: 500 });
    }
}
