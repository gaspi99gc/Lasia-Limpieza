import { supabase } from '@/lib/db';

// Devuelve el catalogo de tareas y, si viene service_id, el estado de cada una
// para ese servicio (calculado a partir de la ultima realizacion + frecuencia).
//
// GET /api/maintenance-tasks                -> solo catalogo
// GET /api/maintenance-tasks?service_id=12  -> catalogo + estado por servicio
//
// Estado de preventivas (con frecuencia_dias):
//   - sin registros               -> 'pendiente'
//   - dias desde ultima < 80%     -> 'al_dia'
//   - 80% <= dias < 100%          -> 'por_vencer'
//   - dias >= 100% de frecuencia  -> 'vencida'
// Correctivas (a demanda): no tienen vencimiento, estado 'a_demanda'.

const MS_DAY = 24 * 60 * 60 * 1000;

function daysBetween(fromDateStr, to = new Date()) {
    // fromDateStr es DATE (YYYY-MM-DD). Comparamos por dia calendario.
    const from = new Date(`${fromDateStr}T00:00:00`);
    const toMid = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.floor((toMid.getTime() - from.getTime()) / MS_DAY);
}

function computeEstado(tarea, lastDate) {
    if (tarea.tipo === 'correctiva' || !tarea.frecuencia_dias) {
        return 'a_demanda';
    }
    if (!lastDate) return 'pendiente';
    const elapsed = daysBetween(lastDate);
    const ratio = elapsed / tarea.frecuencia_dias;
    if (ratio >= 1) return 'vencida';
    if (ratio >= 0.8) return 'por_vencer';
    return 'al_dia';
}

function nextDueDate(lastDate, frecuenciaDias) {
    if (!lastDate || !frecuenciaDias) return null;
    const d = new Date(`${lastDate}T00:00:00`);
    d.setDate(d.getDate() + frecuenciaDias);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const serviceId = searchParams.get('service_id');

        const { data: catalog, error: catErr } = await supabase
            .from('maintenance_task_catalog')
            .select('id, area, tarea, descripcion, tipo, frecuencia_dias, frecuencia_label, orden')
            .eq('activo', true)
            .order('orden', { ascending: true });
        if (catErr) throw catErr;

        if (!serviceId) {
            return Response.json(catalog || []);
        }

        // Traemos los logs de ese servicio para calcular ultima realizacion por tarea.
        const { data: logs, error: logErr } = await supabase
            .from('maintenance_task_logs')
            .select('catalog_id, fecha_realizacion, realizado_por_nombre')
            .eq('service_id', serviceId)
            .order('fecha_realizacion', { ascending: false });
        if (logErr) throw logErr;

        const lastByCatalog = new Map();
        const countByCatalog = new Map();
        for (const l of (logs || [])) {
            countByCatalog.set(l.catalog_id, (countByCatalog.get(l.catalog_id) || 0) + 1);
            if (!lastByCatalog.has(l.catalog_id)) {
                lastByCatalog.set(l.catalog_id, l); // el primero es el mas reciente (orden desc)
            }
        }

        const result = (catalog || []).map(t => {
            const last = lastByCatalog.get(t.id) || null;
            const lastDate = last?.fecha_realizacion || null;
            return {
                ...t,
                ultima_fecha: lastDate,
                ultima_por: last?.realizado_por_nombre || null,
                proxima_fecha: nextDueDate(lastDate, t.frecuencia_dias),
                veces_realizada: countByCatalog.get(t.id) || 0,
                estado: computeEstado(t, lastDate),
            };
        });

        return Response.json(result);
    } catch (error) {
        console.error('Error fetching maintenance-tasks:', error);
        return Response.json({ error: 'Failed to fetch tasks' }, { status: 500 });
    }
}
