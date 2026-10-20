import { supabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/authCookie';
import { periodoVigente, sumarDias } from '@/lib/quincenas-vacaciones';

// Las licencias de tipo "vacaciones" descuentan del saldo de vacaciones.
//
// Las vacaciones se cargan en /vacaciones; en Licencias se cargan los días que
// quedaron pendientes y se toman sueltos. Cada licencia de vacaciones nueva
// crea su movimiento 'tomado', unido por licencia_id: editar la licencia lo
// actualiza y borrarla lo anula. Las licencias anteriores a esto no se tocan.
//
// Nace aprobado: no es un pedido de quincena para la jefa operativa, es RRHH
// registrando días que la persona ya se toma.
//
// Nada de esto puede impedir que la licencia se guarde: si falla, se registra
// en el log y la licencia queda igual.

const NOTA = 'Cargada desde Licencias';

const diasCorridos = (desde, hasta) =>
    Math.round((new Date(`${hasta}T12:00:00Z`) - new Date(`${desde}T12:00:00Z`)) / 86400000) + 1;

async function quienEs(request) {
    const session = await getSessionFromRequest(request);
    let quien = session?.role || null;
    if (session?.appUserId) {
        const { data: u } = await supabase
            .from('app_users').select('name, surname, username').eq('id', session.appUserId).maybeSingle();
        if (u) quien = [u.name, u.surname].filter(Boolean).join(' ').trim() || u.username || quien;
    }
    return quien;
}

const esVacaciones = (lic) => String(lic?.type || '').toLowerCase() === 'vacaciones' && lic?.status !== 'cancelada';

/** ¿Ya tiene vacaciones cargadas que se pisan con esas fechas? */
async function yaCargadas(employeeId, desde, hasta, salvoId = null) {
    let q = supabase
        .from('vacaciones_movimientos')
        .select('id, fecha_desde, fecha_hasta')
        .eq('employee_id', employeeId)
        .eq('tipo', 'tomado')
        .is('anulado_at', null)
        .neq('estado', 'rechazado')
        .lte('fecha_desde', hasta)
        .gte('fecha_hasta', desde);
    if (salvoId) q = q.neq('id', salvoId);
    const { data, error } = await q;
    if (error) throw error;
    return data?.[0] || null;
}

/**
 * Después de crear una licencia. Devuelve un aviso para mostrar, o null.
 */
export async function descontarPorLicencia(request, licencia) {
    if (!esVacaciones(licencia)) return null;
    try {
        const choque = await yaCargadas(licencia.employee_id, licencia.start_date, licencia.end_date);
        if (choque) {
            return `No se descontó del saldo: ya tiene vacaciones cargadas del ${choque.fecha_desde} al ${choque.fecha_hasta}.`;
        }
        const cantidad = diasCorridos(licencia.start_date, licencia.end_date);
        const { error } = await supabase.from('vacaciones_movimientos').insert({
            employee_id: licencia.employee_id,
            periodo: periodoVigente(licencia.start_date),
            tipo: 'tomado',
            estado: 'aprobado',
            cantidad,
            fecha_desde: licencia.start_date,
            fecha_hasta: sumarDias(licencia.start_date, cantidad),
            nota: licencia.notes ? `${NOTA}: ${licencia.notes}` : NOTA,
            registrado_por: await quienEs(request),
            licencia_id: licencia.id,
        });
        // 23505 = ya existe el movimiento de esta licencia (doble envío).
        if (error && error.code !== '23505') throw error;
        return `Se descontaron ${cantidad} días del saldo de vacaciones.`;
    } catch (e) {
        console.error('No se pudo descontar la licencia de vacaciones', licencia?.id, e);
        return 'La licencia se guardó, pero no se pudo descontar del saldo de vacaciones.';
    }
}

/**
 * Después de editar una licencia. Solo toca las que ya descontaban (las
 * nuevas): una licencia vieja que se edita sigue sin descontar.
 */
export async function sincronizarConLicencia(request, licencia) {
    try {
        const { data: mov, error } = await supabase
            .from('vacaciones_movimientos')
            .select('id, fecha_desde, cantidad')
            .eq('licencia_id', licencia.id)
            .is('anulado_at', null)
            .maybeSingle();
        if (error) throw error;
        if (!mov) return null;

        // Dejó de ser vacaciones o se canceló: los días vuelven al saldo.
        if (!esVacaciones(licencia)) {
            await anularPorLicencia(request, licencia.id, 'La licencia dejó de ser de vacaciones');
            return 'Los días volvieron al saldo de vacaciones.';
        }

        const cantidad = diasCorridos(licencia.start_date, licencia.end_date);
        if (mov.fecha_desde === licencia.start_date && mov.cantidad === cantidad) return null;

        const choque = await yaCargadas(licencia.employee_id, licencia.start_date, licencia.end_date, mov.id);
        if (choque) {
            return `No se actualizó el saldo: las fechas nuevas se pisan con vacaciones cargadas del ${choque.fecha_desde} al ${choque.fecha_hasta}.`;
        }
        const { error: eUpd } = await supabase.from('vacaciones_movimientos').update({
            periodo: periodoVigente(licencia.start_date),
            cantidad,
            fecha_desde: licencia.start_date,
            fecha_hasta: sumarDias(licencia.start_date, cantidad),
        }).eq('id', mov.id);
        if (eUpd) throw eUpd;
        return `Saldo de vacaciones actualizado: ${cantidad} días.`;
    } catch (e) {
        console.error('No se pudo actualizar el descuento de la licencia', licencia?.id, e);
        return 'La licencia se guardó, pero no se pudo actualizar el saldo de vacaciones.';
    }
}

/** Antes de borrar una licencia: si descontaba, los días vuelven al saldo. */
export async function anularPorLicencia(request, licenciaId, motivo = 'Se borró la licencia') {
    try {
        const { error } = await supabase.from('vacaciones_movimientos').update({
            anulado_at: new Date().toISOString(),
            anulado_por: await quienEs(request),
            anulado_motivo: motivo,
        }).eq('licencia_id', licenciaId).is('anulado_at', null);
        if (error) throw error;
    } catch (e) {
        console.error('No se pudo anular el descuento de la licencia', licenciaId, e);
    }
}
