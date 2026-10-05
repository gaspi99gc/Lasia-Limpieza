import { supabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/authCookie';

// Lo que comparten las rutas de trabajos programados del lado del servidor.

export const ROLES_LECTURA = ['admin', 'operaciones', 'rrhh', 'jefe_operativo', 'supervisor'];
// Coordinan las de Operaciones (decidido el 2026-10-05): el supervisor recibe
// los avisos para estar al tanto, pero no carga ni coordina.
export const ROLES_ESCRITURA = ['admin', 'operaciones'];

// Quien hace la accion. Sale de la sesion, nunca del cliente: es un dato de
// auditoria. La cookie solo trae el id, asi que el nombre se busca en
// app_users. Antes se leia un nombre que la cookie no tiene y todo quedaba
// firmado como "operaciones", sin saber cual de las dos fue.
export async function quienEs(request) {
    const session = await getSessionFromRequest(request);
    let quien = session?.role || 'desconocido';
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

/**
 * Asienta cambios en trabajos_historial. Si falla se registra en el log y la
 * accion sigue, igual que en faltas: no se le hace perder el cambio a quien lo
 * estaba guardando porque no se pudo escribir el rastro.
 *
 * @param {Array<{trabajo_id, campo, valor_anterior?, valor_nuevo?}>} asientos
 */
export async function registrarHistorial(asientos, usuario) {
    const filas = (asientos || []).map((a) => ({
        trabajo_id: a.trabajo_id,
        campo: a.campo,
        valor_anterior: a.valor_anterior ?? null,
        valor_nuevo: a.valor_nuevo ?? null,
        usuario,
    }));
    if (!filas.length) return;
    const { error } = await supabase.from('trabajos_historial').insert(filas);
    if (error) console.error('No se pudo guardar el historial del trabajo', filas[0].trabajo_id, error.message);
}
