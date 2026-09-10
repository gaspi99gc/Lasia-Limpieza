import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { ROLES_LECTURA, calcularEnRotacion, traerTodo } from '@/lib/uniformes';

// Cuanto uniforme tiene cada supervisor en la calle.
//
// Es el numero de responsabilidad: el jefe pidio que el uniforme se asigne al
// supervisor porque es quien ve a los operarios seguido. Un supervisor con 60
// prendas afuera para 25 operarios es una conversacion concreta.
//
// Aclaracion honesta que va tambien en la pantalla: esto NO es un inventario
// auditado de lo que tiene su gente, es el saldo de lo que se le entrego menos
// lo que devolvio. Si se perdio algo y nadie lo dijo, sigue contando. Eso no es
// un error: el saldo alto ES la señal.

export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES_LECTURA);
    if (denied) return denied;

    try {
        const [movimientos, prendas, supervisores] = await Promise.all([
            traerTodo(() =>
                supabase
                    .from('uniformes_movimientos')
                    .select('prenda_id, tipo, cantidad, supervisor_id, anulado_at')
                    .order('id')
            ),
            traerTodo(() => supabase.from('uniformes_prendas').select('id, prenda, talle, precio').order('id')),
            traerTodo(() =>
                supabase
                    .from('supervisors')
                    .select('id, app_users:app_user_id (name, surname, username)')
                    .order('id')
            ),
        ]);

        const prendaPorId = new Map(prendas.map((p) => [p.id, p]));
        const nombrePorSupervisor = new Map(
            supervisores.map((s) => {
                const u = s.app_users;
                const nombre = u ? [u.name, u.surname].filter(Boolean).join(' ').trim() || u.username : null;
                return [s.id, nombre || `Supervisor ${s.id}`];
            })
        );

        const { porSupervisor } = calcularEnRotacion(movimientos);

        const filas = [];
        for (const [supervisorId, mapaPrendas] of porSupervisor) {
            const detalle = [];
            let totalUnidades = 0;
            let valorizado = 0;

            for (const [prendaId, cantidad] of mapaPrendas) {
                if (cantidad === 0) continue;   // entregó y devolvió todo
                const p = prendaPorId.get(prendaId);
                detalle.push({
                    prenda_id: prendaId,
                    prenda: p?.prenda || '—',
                    talle: p?.talle || '',
                    cantidad,
                });
                totalUnidades += cantidad;
                valorizado += cantidad * (Number(p?.precio) || 0);
            }

            if (!detalle.length) continue;
            detalle.sort((a, b) => b.cantidad - a.cantidad);

            filas.push({
                supervisor_id: supervisorId,
                // Los movimientos sin supervisor se muestran igual, no se
                // esconden: un balde visible de "no se de quien es" es mejor que
                // uno oculto que descuadra el total.
                nombre: supervisorId === null
                    ? 'Sin asignar'
                    : nombrePorSupervisor.get(supervisorId) || `Supervisor ${supervisorId}`,
                sin_asignar: supervisorId === null,
                total_unidades: totalUnidades,
                valorizado,
                prendas: detalle,
            });
        }

        filas.sort((a, b) => b.total_unidades - a.total_unidades);

        return Response.json({
            supervisores: filas,
            total_unidades: filas.reduce((a, f) => a + f.total_unidades, 0),
            total_valorizado: filas.reduce((a, f) => a + f.valorizado, 0),
        });
    } catch (error) {
        console.error('Error calculando uniformes en rotación:', error);
        return Response.json({ error: 'No se pudo calcular lo que está en la calle.' }, { status: 500 });
    }
}
