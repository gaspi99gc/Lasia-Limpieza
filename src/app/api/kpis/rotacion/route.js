import { supabase } from '@/lib/db';

export const runtime = 'nodejs';

// KPI de rotación de personal. Lee de bajas_historicas (bajas del análisis de RRHH,
// cruzadas con presentismo -> tienen el último día trabajado real).

const PAGE = 1000;

async function fetchAll() {
    const all = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from('bajas_historicas')
            .select('id, fecha_ingreso, ultimo_dia, servicio_baja, motivo_baja, sin_inicio_efectivo, dias_trabajados')
            .range(from, from + PAGE - 1);
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < PAGE) break;
    }
    return all;
}

// Empleados activos con fecha de ingreso — para reconstruir la nómina de cada mes.
async function fetchActivos() {
    const { data } = await supabase
        .from('employees')
        .select('fecha_ingreso')
        .eq('estado_empleado', 'Activo')
        .not('fecha_ingreso', 'is', null);
    return data || [];
}

function diffDias(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// Semestre a partir del último día trabajado. Ej: '2026-06-15' -> '1S 2026'.
function periodoDe(fechaStr) {
    if (!fechaStr) return null;
    const [y, m] = fechaStr.split('-').map(Number);
    if (!y || !m) return null;
    return `${m <= 6 ? '1S' : '2S'} ${y}`;
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const periodoFiltro = searchParams.get('periodo'); // ej '1S 2026', o null = todos

        const all = await fetchAll();

        // Lista de períodos disponibles (según el último día de las bajas reales).
        const periodosSet = new Set();
        all.forEach(b => { if (b.ultimo_dia && !b.sin_inicio_efectivo) { const p = periodoDe(b.ultimo_dia); if (p) periodosSet.add(p); } });
        const periodos = [...periodosSet].sort((a, b) => {
            const [sa, ya] = [a.slice(0, 2), Number(a.slice(3))];
            const [sb2, yb] = [b.slice(0, 2), Number(b.slice(3))];
            return yb - ya || (sb2 > sa ? 1 : -1); // más reciente primero
        });

        const enPeriodo = (b) => !periodoFiltro || periodoDe(b.ultimo_dia) === periodoFiltro;

        // Bajas "reales" (efectivamente trabajaron): con último día y no sin-inicio, del período elegido.
        const reales = all.filter(b => b.ultimo_dia && !b.sin_inicio_efectivo && enPeriodo(b));
        const sinInicio = all.filter(b => b.sin_inicio_efectivo).length;

        // Duración de cada baja (último día - ingreso).
        const conDuracion = reales
            .filter(b => b.fecha_ingreso)
            .map(b => ({ ...b, duracion: diffDias(b.fecha_ingreso, b.ultimo_dia) }))
            .filter(b => b.duracion >= 0);

        // Altas anuladas del período (nunca ficharon). Su período se toma por fecha_ingreso.
        const anuladasPeriodo = all.filter(b => b.sin_inicio_efectivo && (!periodoFiltro || periodoDe(b.fecha_ingreso) === periodoFiltro)).length;

        // Embudo completo del ingreso: incluye "Nunca inició" + tramos de duración.
        // El % es sobre TODAS las contrataciones del período (anuladas + las que trabajaron),
        // así el gráfico muestra el destino real de cada persona que se contrató.
        const enRango = (min, max) => conDuracion.filter(b => b.duracion >= min && (max == null || b.duracion < max)).length;
        const totalContrataciones = anuladasPeriodo + conDuracion.length;
        const pctT = (n) => totalContrataciones ? Math.round((n / totalContrataciones) * 1000) / 10 : 0;
        const tramos = [
            { label: 'Nunca inició', cant: anuladasPeriodo, nuncaInicio: true },
            { label: '1 a 15 días', cant: enRango(0, 15) },
            { label: '15 a 30 días', cant: enRango(15, 30) },
            { label: '30 a 60 días', cant: enRango(30, 60) },
            { label: '60 a 90 días', cant: enRango(60, 90) },
            { label: 'Más de 90 días', cant: enRango(90, null) },
        ].map(t => ({ ...t, pct: pctT(t.cant) }));

        const curva = { base: totalContrataciones, tramos };

        // Bajas por servicio (top).
        const porServicio = new Map();
        reales.forEach(b => {
            const s = b.servicio_baja || 'Sin servicio';
            porServicio.set(s, (porServicio.get(s) || 0) + 1);
        });
        const servicios = [...porServicio.entries()]
            .map(([servicio, cantidad]) => ({ servicio, cantidad }))
            .sort((a, b) => b.cantidad - a.cantidad);

        // Rotación mensual: bajas del mes ÷ nómina reconstruida de ese mes.
        // La nómina se estima con: activos de hoy + bajas que estaban vigentes ese mes.
        // Es una aproximación (nómina histórica no exacta), sirve para tendencia.
        const activos = await fetchActivos();
        const todasBajas = all.filter(b => b.ultimo_dia && !b.sin_inicio_efectivo && b.fecha_ingreso);

        const porMes = new Map();
        reales.forEach(b => {
            const mes = (b.ultimo_dia || '').slice(0, 7);
            if (mes) porMes.set(mes, (porMes.get(mes) || 0) + 1);
        });
        const meses = [...porMes.keys()].sort().map(mes => {
            const iniMes = `${mes}-01`;
            const finMes = `${mes}-31`;
            // Nómina del mes: activos ya ingresados + bajas que aún trabajaban ese mes.
            let nomina = activos.filter(e => e.fecha_ingreso <= finMes).length;
            nomina += todasBajas.filter(b => b.fecha_ingreso <= finMes && b.ultimo_dia >= iniMes).length;
            const cantidad = porMes.get(mes);
            const rotacion = nomina > 0 ? Math.round((cantidad / nomina) * 1000) / 10 : 0;
            return { mes, cantidad, nomina, rotacion };
        });

        // Motivos de baja (de los que tienen motivo cargado).
        const porMotivo = new Map();
        reales.forEach(b => {
            const m = (b.motivo_baja || '').trim().toLowerCase();
            if (m) porMotivo.set(m, (porMotivo.get(m) || 0) + 1);
        });
        const motivos = [...porMotivo.entries()]
            .map(([motivo, cantidad]) => ({ motivo, cantidad }))
            .sort((a, b) => b.cantidad - a.cantidad);

        // Total REAL de bajas del período: las que trabajaron + las altas anuladas.
        // Las anuladas cuentan como bajas (son las más costosas: se pagó el proceso y no hubo retorno).
        const totalReal = reales.length + anuladasPeriodo;
        // Acumulados "duró menos de X días" sobre el TOTAL real. Las anuladas duraron 0 días,
        // así que entran en todos los cortes.
        const dur30 = anuladasPeriodo + enRango(0, 30);
        const dur90 = anuladasPeriodo + enRango(0, 90);
        const pctReal = (n) => totalReal ? Math.round((n / totalReal) * 1000) / 10 : 0;

        return Response.json({
            totalReal,                       // 265: todas las bajas (con y sin actividad)
            conActividad: reales.length,     // 218: las que trabajaron al menos un día
            sinInicioEfectivo: anuladasPeriodo,
            pctMenos30: pctReal(dur30),
            pctMenos90: pctReal(dur90),
            curva,
            servicios,
            meses,
            motivos,
            periodos,        // lista de períodos disponibles para el filtro
            periodoActual: periodoFiltro || 'todos',
        });
    } catch (error) {
        console.error('Error KPI rotacion:', error);
        return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
}
