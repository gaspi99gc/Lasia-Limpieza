import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { ROLES_LECTURA } from '@/lib/trabajos-server';
import { supervisoresPorServicio } from '@/lib/supervisores-servicio';

// El supervisor de cada servicio segun el operativo: a quien le llegan los
// avisos de los trabajos programados, ademas de Operaciones. La pantalla lo
// muestra en cada trabajo y al cargarlo.
//
// Devuelve { [service_id]: [{ id, nombre }] }, con `id` = supervisors.id.
export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES_LECTURA);
    if (denied) return denied;

    try {
        const mapa = await supervisoresPorServicio(supabase);
        return Response.json(Object.fromEntries(
            [...mapa].map(([serviceId, sups]) => [serviceId, sups.map((s) => ({ id: s.id, nombre: s.nombre }))])
        ));
    } catch (error) {
        console.error('Error leyendo el supervisor de cada servicio:', error);
        return Response.json({ error: 'No se pudo leer el supervisor de cada servicio.' }, { status: 500 });
    }
}
