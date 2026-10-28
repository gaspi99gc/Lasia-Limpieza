import { supabase } from '@/lib/db';
import { describirLicencia, TIPO_LICENCIA } from '@/lib/licencias-tipos';

export { describirLicencia, TIPO_LICENCIA };

// Faltas y licencias: que un mismo día no cuente dos veces.
//
// Operaciones registra la falta en el momento (avisa el operario) y la
// licencia la carga RRHH después, cuando llega el certificado o el alta de la
// ART. Entonces una falta en un día con licencia cargada NO es ausentismo: es
// la licencia. No se borra (la falta queda registrada, que es lo que pasó ese
// día); se descuenta al calcular. Si la licencia se corrige, el número se
// acomoda solo.
//
// Al 2026-10-28, 664 de 1873 faltas caían dentro de una licencia: 662 de la
// planilla histórica de presentismo (anotaba "ausente" cada día de licencia)
// y 2 cargadas en la app. Importa para la liquidación de sueldos: un día de
// licencia y una falta se liquidan distinto.

/** Las licencias que tocan el rango, por empleado: Map(employee_id -> [{ tipo, desde, hasta }]). */
export async function licenciasPorEmpleado(desde, hasta) {
    const mapa = new Map();
    for (let d = 0; ; d += 1000) {
        const { data, error } = await supabase
            .from('licenses')
            .select('employee_id, type, start_date, end_date')
            .lte('start_date', hasta)
            .gte('end_date', desde)
            .range(d, d + 999);
        if (error) throw error;
        for (const l of data || []) {
            if (!l.employee_id || !l.start_date || !l.end_date) continue;
            const lista = mapa.get(l.employee_id) || [];
            lista.push({ tipo: l.type, desde: l.start_date.slice(0, 10), hasta: l.end_date.slice(0, 10) });
            mapa.set(l.employee_id, lista);
        }
        if (!data || data.length < 1000) break;
    }
    return mapa;
}

/** La licencia que cubre ese día para esa persona, o null. */
export function licenciaDelDia(mapa, employeeId, fecha) {
    if (!employeeId || !fecha) return null;
    const dia = String(fecha).slice(0, 10);
    return (mapa.get(employeeId) || []).find((l) => l.desde <= dia && l.hasta >= dia) || null;
}
