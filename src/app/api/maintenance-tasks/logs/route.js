import { supabase } from '@/lib/db';

// GET  /api/maintenance-tasks/logs?service_id=&catalog_id=  -> historial
// POST /api/maintenance-tasks/logs  { catalog_id, service_id, fecha_realizacion?, realizado_por_id?, realizado_por_nombre? }

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const serviceId = searchParams.get('service_id');
        const catalogId = searchParams.get('catalog_id');

        let query = supabase
            .from('maintenance_task_logs')
            .select('id, catalog_id, service_id, fecha_realizacion, realizado_por_nombre, created_at')
            .order('fecha_realizacion', { ascending: false });

        if (serviceId) query = query.eq('service_id', serviceId);
        if (catalogId) query = query.eq('catalog_id', catalogId);

        const { data, error } = await query;
        if (error) throw error;
        return Response.json(data || []);
    } catch (error) {
        console.error('Error fetching task logs:', error);
        return Response.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const body = await req.json();
        const catalog_id = Number(body.catalog_id);
        const service_id = Number(body.service_id);
        const realizado_por_id = body.realizado_por_id ? Number(body.realizado_por_id) : null;
        const realizado_por_nombre = (body.realizado_por_nombre || '').toString().trim() || null;

        // fecha_realizacion: si no viene, hoy (en hora local del server).
        let fecha = (body.fecha_realizacion || '').toString().trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
            const now = new Date();
            fecha = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        }

        if (!catalog_id || !service_id) {
            return Response.json({ error: 'catalog_id y service_id son obligatorios' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('maintenance_task_logs')
            .insert({ catalog_id, service_id, fecha_realizacion: fecha, realizado_por_id, realizado_por_nombre })
            .select()
            .single();
        if (error) throw error;

        return Response.json(data, { status: 201 });
    } catch (error) {
        console.error('Error creating task log:', error);
        return Response.json({ error: error?.message || 'Failed to create log' }, { status: 500 });
    }
}
