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

function diffDias(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
}

export async function GET() {
    try {
        const all = await fetchAll();

        // Bajas "reales" (efectivamente trabajaron): con último día y no sin-inicio.
        const reales = all.filter(b => b.ultimo_dia && !b.sin_inicio_efectivo);
        const sinInicio = all.filter(b => b.sin_inicio_efectivo).length;

        // Duración de cada baja (último día - ingreso).
        const conDuracion = reales
            .filter(b => b.fecha_ingreso)
            .map(b => ({ ...b, duracion: diffDias(b.fecha_ingreso, b.ultimo_dia) }))
            .filter(b => b.duracion >= 0);

        const nDur = conDuracion.length;
        const pct = (cond) => nDur ? Math.round((conDuracion.filter(cond).length / nDur) * 1000) / 10 : 0;

        // Rotación temprana por TRAMOS mutuamente excluyentes (suman 100%).
        // Cada baja cae en un solo tramo según cuántos días duró.
        const enRango = (min, max) => conDuracion.filter(b => b.duracion >= min && (max == null || b.duracion < max)).length;
        const pctN = (n) => nDur ? Math.round((n / nDur) * 1000) / 10 : 0;
        const tramos = [
            { label: '0 a 15 días', cant: enRango(0, 15) },
            { label: '15 a 30 días', cant: enRango(15, 30) },
            { label: '30 a 60 días', cant: enRango(30, 60) },
            { label: '60 a 90 días', cant: enRango(60, 90) },
            { label: 'Más de 90 días', cant: enRango(90, null) },
        ].map(t => ({ ...t, pct: pctN(t.cant) }));

        const curva = { base: nDur, tramos };

        // Bajas por servicio (top).
        const porServicio = new Map();
        reales.forEach(b => {
            const s = b.servicio_baja || 'Sin servicio';
            porServicio.set(s, (porServicio.get(s) || 0) + 1);
        });
        const servicios = [...porServicio.entries()]
            .map(([servicio, cantidad]) => ({ servicio, cantidad }))
            .sort((a, b) => b.cantidad - a.cantidad);

        // Bajas por mes (del último día real).
        const porMes = new Map();
        reales.forEach(b => {
            const mes = (b.ultimo_dia || '').slice(0, 7);
            if (mes) porMes.set(mes, (porMes.get(mes) || 0) + 1);
        });
        const meses = [...porMes.entries()]
            .map(([mes, cantidad]) => ({ mes, cantidad }))
            .sort((a, b) => a.mes.localeCompare(b.mes));

        // Motivos de baja (de los que tienen motivo cargado).
        const porMotivo = new Map();
        reales.forEach(b => {
            const m = (b.motivo_baja || '').trim().toLowerCase();
            if (m) porMotivo.set(m, (porMotivo.get(m) || 0) + 1);
        });
        const motivos = [...porMotivo.entries()]
            .map(([motivo, cantidad]) => ({ motivo, cantidad }))
            .sort((a, b) => b.cantidad - a.cantidad);

        return Response.json({
            totalBajas: reales.length,
            sinInicioEfectivo: sinInicio,
            curva,
            servicios,
            meses,
            motivos,
        });
    } catch (error) {
        console.error('Error KPI rotacion:', error);
        return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
}
