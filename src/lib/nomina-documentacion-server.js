import { supabase } from '@/lib/db';
import { estaDeBaja, resumenNomina } from '@/lib/nomina-documentacion';

// Lo que toca la base en la nómina de Documentación mensual. Lo usan las rutas
// de /api/vencimientos. Las cuentas puras están en nomina-documentacion.js.

const POR_PAGINA = 1000;

// Supabase corta en 1000 filas: se pide de a páginas hasta que no venga más.
// `armar` arma la consulta de nuevo en cada vuelta (una consulta no se reusa).
async function todas(armar) {
    const filas = [];
    for (let desde = 0; ; desde += POR_PAGINA) {
        const { data, error } = await armar().range(desde, desde + POR_PAGINA - 1);
        if (error) throw error;
        filas.push(...(data || []));
        if (!data || data.length < POR_PAGINA) return filas;
    }
}

// Quién está haciendo la acción. Sale de la sesión, no de lo que mande el
// cliente: es un dato de auditoría y tiene que ser confiable.
export async function quienEs(session) {
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

// Quien se dio de baja en el legajo sale solo de todas las nóminas. Se hace al
// leer y no donde se da de baja, porque esos lugares son varios (la pantalla
// del legajo, los scripts de bajas) y así no se escapa ninguno. La fila queda
// quitada: si la persona reingresa, no vuelve sola.
// Devuelve cuántas filas quitó.
export async function limpiarBajas(vencimientoIds) {
    const filas = await todas(() => {
        let q = supabase
            .from('rrhh_vencimientos_nomina')
            .select('id, employees:employee_id (estado_empleado, fecha_baja)')
            .is('quitado_at', null)
            .order('id');
        if (vencimientoIds?.length) q = q.in('vencimiento_id', vencimientoIds);
        return q;
    });
    const ids = filas.filter((f) => estaDeBaja(f.employees)).map((f) => f.id);
    if (!ids.length) return 0;
    const { error } = await supabase
        .from('rrhh_vencimientos_nomina')
        .update({ quitado_at: new Date().toISOString(), quitado_por: 'Baja del legajo' })
        .in('id', ids)
        .is('quitado_at', null);
    if (error) throw error;
    return ids.length;
}

// La nómina vigente de una documentación, ordenada por apellido y nombre.
export async function nominaVigente(vencimientoId) {
    const filas = await todas(() => supabase
        .from('rrhh_vencimientos_nomina')
        .select('id, employee_id, enviado_at, agregado_por, agregado_at, employees:employee_id (apellido, nombre, dni)')
        .eq('vencimiento_id', vencimientoId)
        .is('quitado_at', null)
        .order('id'));
    return filas
        .map(({ employees: e, ...f }) => ({
            id: f.id,
            employee_id: f.employee_id,
            apellido: e?.apellido || '',
            nombre: e?.nombre || '',
            dni: e?.dni || null,
            enviado_at: f.enviado_at,
            agregado_por: f.agregado_por,
            agregado_at: f.agregado_at,
        }))
        .sort((a, b) => a.apellido.localeCompare(b.apellido, 'es') || a.nombre.localeCompare(b.nombre, 'es'));
}

// { vencimiento_id: { total, pendientes } } de todas las documentaciones.
export async function resumenVigente() {
    const filas = await todas(() => supabase
        .from('rrhh_vencimientos_nomina')
        .select('vencimiento_id, enviado_at')
        .is('quitado_at', null)
        .order('id'));
    return resumenNomina(filas);
}
