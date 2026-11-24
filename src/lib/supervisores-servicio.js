// El supervisor de cada servicio sale del operativo: la columna de supervisor
// del Excel, que el import guarda en operativo_puestos.supervisor_nombre. Es lo
// mas actualizado que hay (decidido el 2026-11-18). supervisor_routes existe,
// pero ninguna pantalla la carga.
//
// El Excel usa apodos: ROIMAN, NOE, LUCAS, ANTO, ROMINA. Un servicio
// compartido dice "ANTONIO y ROIMAN", y son los dos. Cada apodo se busca como
// comienzo de alguna palabra del nombre y apellido del supervisor en la app
// (ANTO -> Antonio Romano, LUCAS -> Juan Lucas Torres). Se ignora si no
// coincide con nadie (NESTOR no tiene usuario) o si coincide con mas de uno:
// mejor no avisarle a nadie que avisarle al equivocado.
//
// No importa nada con '@/': recibe el cliente de la base, asi se puede probar
// desde un script suelto.

const normalizar = (s) => String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().trim();

// "ANTONIO y ROIMAN" -> ['ANTONIO', 'ROIMAN']
export function apodosDe(texto) {
    return String(texto || '')
        .split(/\s+y\s+|\s*[/,]\s*/i)
        .map(normalizar)
        .filter(Boolean);
}

// supervisores: [{ id, app_user_id, nombre }]. Devuelve uno o null.
export function resolverApodo(apodo, supervisores) {
    const a = normalizar(apodo);
    if (!a) return null;
    const coinciden = supervisores.filter((s) => normalizar(s.nombre).split(/\s+/).some((w) => w.startsWith(a)));
    return coinciden.length === 1 ? coinciden[0] : null;
}

async function traerTodo(consulta) {
    const filas = [];
    for (let desde = 0; ; desde += 1000) {
        const { data, error } = await consulta().order('id').range(desde, desde + 999);
        if (error) throw error;
        filas.push(...(data || []));
        if (!data || data.length < 1000) return filas;
    }
}

/**
 * Los supervisores de cada servicio segun el operativo vigente. Solo los que
 * tienen el usuario habilitado: uno dado de baja no tiene que recibir avisos.
 *
 * @param db         cliente de Supabase (service role)
 * @param serviceIds opcional: solo estos servicios
 * @returns Map<service_id, Array<{ id, app_user_id, nombre }>>, donde `id` es
 *          supervisors.id (el mismo que trabajos_programados.supervisor_id)
 */
export async function supervisoresPorServicio(db, serviceIds = null) {
    const ids = serviceIds ? [...new Set(serviceIds.filter(Boolean))] : null;
    if (ids && !ids.length) return new Map();

    const [puestos, sups] = await Promise.all([
        traerTodo(() => {
            let q = db
                .from('operativo_puestos')
                .select('id, service_id, supervisor_nombre')
                .eq('activo', true)
                .not('service_id', 'is', null)
                .not('supervisor_nombre', 'is', null);
            if (ids) q = q.in('service_id', ids);
            return q;
        }),
        traerTodo(() => db
            .from('supervisors')
            .select('id, app_user_id, app_users:app_user_id (name, surname, login_enabled)')),
    ]);

    const supervisores = sups
        .filter((s) => s.app_user_id && s.app_users?.login_enabled)
        .map((s) => ({
            id: s.id,
            app_user_id: s.app_user_id,
            nombre: [s.app_users.name, s.app_users.surname].filter(Boolean).join(' ').trim(),
        }));

    const porServicio = new Map();
    for (const p of puestos) {
        const lista = porServicio.get(p.service_id) || [];
        for (const apodo of apodosDe(p.supervisor_nombre)) {
            const s = resolverApodo(apodo, supervisores);
            if (s && !lista.some((x) => x.id === s.id)) lista.push(s);
        }
        if (lista.length) porServicio.set(p.service_id, lista);
    }
    for (const lista of porServicio.values()) lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return porServicio;
}
