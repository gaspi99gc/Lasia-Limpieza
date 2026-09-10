import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import {
    ROLES_LECTURA,
    calcularEnRotacion,
    calcularGastoReal,
    calcularGastoEstimado,
    calcularRecuperoReal,
    traerTodo,
} from '@/lib/uniformes';

// Gasto de uniformes: lo MEDIDO y lo ESTIMADO.
//
// Van en dos objetos separados (`real` y `estimado`) a proposito, para que sea
// imposible mezclarlos por accidente en la pantalla. Un gasto medido y una
// proyeccion no se suman ni se muestran con el mismo peso visual: si el jefe
// toma una decision creyendo que una estimacion es una medicion, el modulo hizo
// mas daño que bien.

export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES_LECTURA);
    if (denied) return denied;

    try {
        const [movimientos, prendas, parametrosFilas] = await Promise.all([
            traerTodo(() =>
                supabase
                    .from('uniformes_movimientos')
                    .select('prenda_id, tipo, estado, cantidad, supervisor_id, precio_unitario, fecha, anulado_at')
                    .order('id')
            ),
            traerTodo(() =>
                supabase
                    .from('uniformes_prendas')
                    .select('id, prenda, talle, precio, unidades_por_operario, activo')
                    .order('id')
            ),
            traerTodo(() => supabase.from('uniformes_parametros').select('*').order('clave')),
        ]);

        const parametros = Object.fromEntries(parametrosFilas.map((p) => [p.clave, Number(p.valor)]));
        const { porPrenda: enRotacion } = calcularEnRotacion(movimientos);

        const real = calcularGastoReal(movimientos);
        const estimado = calcularGastoEstimado({
            prendas,
            enRotacionPorPrenda: enRotacion,
            parametros,
        });

        // El numero que valida (o desmiente) el supuesto de recupero. Si todavia
        // no hay entregas, viene en null: un 0% aca parece una medicion y no lo
        // es.
        const recuperoReal = calcularRecuperoReal(movimientos, 90);

        return Response.json({
            real: {
                porMes: real.porMes,
                total: real.total,
            },
            estimado: {
                ...estimado,
                recuperoReal,
                // Para que la pantalla pueda decir de donde sale cada factor en
                // vez de mostrar un numero que aparece.
                base: {
                    prendasActivas: prendas.filter((p) => p.activo).length,
                    detalleEquipo: prendas
                        .filter((p) => p.activo && Number(p.precio) > 0)
                        .map((p) => ({
                            prenda: p.prenda,
                            talle: p.talle,
                            precio: Number(p.precio),
                            unidades: Math.max(1, Number(p.unidades_por_operario) || 1),
                        })),
                },
            },
            parametros: parametrosFilas,
        });
    } catch (error) {
        console.error('Error calculando gasto de uniformes:', error);
        return Response.json({ error: 'No se pudo calcular el gasto.' }, { status: 500 });
    }
}
