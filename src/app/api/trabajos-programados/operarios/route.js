import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { ROLES_ESCRITURA } from '@/lib/trabajos-server';

// Los operarios que se pueden elegir al coordinar un trabajo: los del legajo
// que no tienen fecha de baja. Solo lo necesario para elegir (nombre, legajo,
// servicio), nada de CUIL ni datos personales.
//
// Solo para quien coordina: Operaciones y admin.

// Supabase corta en 1000 filas por pedido; el legajo puede tener mas.
async function traerTodo(buildQuery, pageSize = 1000) {
    const filas = [];
    for (let desde = 0; ; desde += pageSize) {
        const { data, error } = await buildQuery().range(desde, desde + pageSize - 1);
        if (error) throw error;
        filas.push(...(data || []));
        if (!data || data.length < pageSize) return filas;
    }
}

export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const filas = await traerTodo(() => supabase
            .from('employees')
            .select('id, nombre, apellido, legajo, servicio_id, services:servicio_id (name)')
            .is('fecha_baja', null)
            .order('apellido', { ascending: true })
            .order('nombre', { ascending: true })
            .order('id', { ascending: true }));

        return Response.json(filas.map((e) => ({
            id: e.id,
            nombre: e.nombre,
            apellido: e.apellido,
            legajo: e.legajo,
            servicio_id: e.servicio_id,
            servicio_nombre: e.services?.name || null,
        })));
    } catch (error) {
        console.error('Error listando operarios para trabajos:', error);
        return Response.json({ error: 'No se pudieron cargar los operarios.' }, { status: 500 });
    }
}
