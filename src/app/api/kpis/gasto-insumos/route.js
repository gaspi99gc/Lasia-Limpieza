import { supabase } from '@/lib/db';

export const runtime = 'nodejs';

// KPI: gasto de insumos por servicio y por mes.
// Gasto = suma de (cantidad final × precio del insumo) de los items NO eliminados,
// contando solo pedidos completados (status 'cerrado').
// Se agrupa por servicio y por mes (YYYY-MM del created_at del pedido).

const PAGE = 1000;

async function fetchAll(table, selectStr, applyRange) {
    const all = [];
    for (let from = 0; ; from += PAGE) {
        let q = supabase.from(table).select(selectStr).range(from, from + PAGE - 1);
        q = applyRange(q);
        const { data, error } = await q;
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < PAGE) break;
    }
    return all;
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const monthFilter = searchParams.get('month'); // opcional: 'YYYY-MM'

        // 1) Pedidos completados
        const requests = await fetchAll(
            'supply_requests',
            'id, service_id, created_at, status',
            (q) => q.eq('status', 'cerrado').order('id', { ascending: true }),
        );
        const reqById = new Map();
        for (const r of requests) {
            if (!r.service_id) continue;
            const mes = (r.created_at || '').slice(0, 7); // YYYY-MM
            reqById.set(r.id, { service_id: r.service_id, mes });
        }

        const requestIds = [...reqById.keys()];
        if (requestIds.length === 0) return Response.json({ servicios: [], meses: [] });

        // 2) Items de esos pedidos (con precio del insumo)
        const items = [];
        for (let i = 0; i < requestIds.length; i += 200) {
            const chunk = requestIds.slice(i, i + 200);
            const part = await fetchAll(
                'supply_request_items',
                'request_id, cantidad, eliminado, supplies:supply_id(precio)',
                (q) => q.in('request_id', chunk).order('id', { ascending: true }),
            );
            items.push(...part);
        }

        // 3) Nombres y dotación de servicios
        const serviceIds = [...new Set(requests.map(r => r.service_id).filter(Boolean))];
        const servicesData = await fetchAll(
            'services',
            'id, name, dotacion_equivalente',
            (q) => q.in('id', serviceIds).order('id', { ascending: true }),
        );
        const serviceName = new Map(servicesData.map(s => [s.id, s.name]));
        const serviceDot = new Map(servicesData.map(s => [s.id, s.dotacion_equivalente != null ? Number(s.dotacion_equivalente) : null]));

        // 4) Agregar: gasto por servicio y mes
        // acc[service_id] = { total, porMes: { 'YYYY-MM': monto } }
        const acc = new Map();
        const mesesSet = new Set();

        for (const it of items) {
            if (it.eliminado) continue;
            const req = reqById.get(it.request_id);
            if (!req) continue;
            if (monthFilter && req.mes !== monthFilter) continue;
            const precio = Number(it.supplies?.precio) || 0;
            const cant = Number(it.cantidad) || 0;
            const sub = precio * cant;
            if (sub <= 0) continue;

            mesesSet.add(req.mes);
            if (!acc.has(req.service_id)) acc.set(req.service_id, { total: 0, porMes: {} });
            const entry = acc.get(req.service_id);
            entry.total += sub;
            entry.porMes[req.mes] = (entry.porMes[req.mes] || 0) + sub;
        }

        const servicios = [...acc.entries()]
            .map(([id, v]) => ({
                service_id: id,
                service_name: serviceName.get(id) || `Servicio ${id}`,
                dotacion: serviceDot.get(id) ?? null, // jornadas equivalentes/día; null si no cargada
                total: Math.round(v.total),
                porMes: Object.fromEntries(Object.entries(v.porMes).map(([m, val]) => [m, Math.round(val)])),
            }))
            .sort((a, b) => b.total - a.total);

        const meses = [...mesesSet].sort().reverse();

        return Response.json({ servicios, meses });
    } catch (error) {
        console.error('Error KPI gasto-insumos:', error);
        return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
}
