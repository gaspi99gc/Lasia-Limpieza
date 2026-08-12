// Autorizacion a nivel de datos. El middleware ya garantiza que hay sesion
// valida; lo que falta es decidir QUE puede ver cada uno.
//
// El patron problematico era que las rutas tomaban el supervisor_id del query
// string y consultaban con ese valor, sin mirar quien preguntaba: un supervisor
// logueado podia pedir las fichadas (con GPS), rutas y pedidos de cualquier otro.

import { getSessionFromRequest } from '@/lib/authCookie';

// Roles que por su funcion ven la operacion completa.
const MANAGEMENT_ROLES = ['admin', 'jefe_operativo', 'operaciones', 'direccion', 'rrhh', 'purchases'];

// Roles que ven TODOS los pedidos de insumos (no los de un supervisor puntual),
// pero SIN el resto de permisos de management (no ven fichadas/GPS/rutas).
// El supervisor_tecnico entrega los insumos de todos los pedidos enviados al
// proveedor, así que necesita verlos todos.
const SUPPLY_VIEWER_ROLES = ['supervisor_tecnico'];

export function canViewAllSupplyRequests(role) {
    return MANAGEMENT_ROLES.includes(role) || SUPPLY_VIEWER_ROLES.includes(role);
}

// Roles cuya sesion representa a un supervisor concreto. Para estos, el
// supervisor_id no se acepta del cliente: se impone el propio.
const OWN_DATA_ROLES = ['supervisor'];

export function isManagement(role) {
    return MANAGEMENT_ROLES.includes(role);
}

/**
 * Decide con que supervisor_id consultar.
 *  - Management: el que pidio (o null = todos), como hasta ahora.
 *  - Supervisor: siempre el suyo, ignorando lo que haya mandado.
 *  - Otros roles: null, que las rutas interpretan como "sin datos propios".
 *
 * Devuelve { supervisorId, forced } — `forced` sirve para distinguir
 * "no filtra porque es management" de "lo acotamos a lo suyo".
 */
export function resolveSupervisorScope(session, requestedId) {
    if (isManagement(session?.role)) {
        return { supervisorId: requestedId || null, forced: false };
    }
    if (OWN_DATA_ROLES.includes(session?.role)) {
        return { supervisorId: session.id ?? null, forced: true };
    }
    return { supervisorId: null, forced: true };
}

/** Lee la sesion y resuelve el alcance en un solo paso, desde el Request. */
export async function getSupervisorScope(req, requestedId) {
    const session = await getSessionFromRequest(req);
    return { session, ...resolveSupervisorScope(session, requestedId) };
}

/**
 * Corta con 403 si el rol no esta en la lista. Devuelve null si puede seguir,
 * de modo que las rutas hagan: `const denied = await denyUnlessRole(...); if (denied) return denied;`
 */
export async function denyUnlessRole(req, allowedRoles) {
    const session = await getSessionFromRequest(req);
    if (!session || !allowedRoles.includes(session.role)) {
        return Response.json(
            { error: 'No tenés permiso para acceder a estos datos.' },
            { status: 403 }
        );
    }
    return null;
}

export { MANAGEMENT_ROLES, OWN_DATA_ROLES, SUPPLY_VIEWER_ROLES };
