import { supabase } from '@/lib/db';

const ACTIVE_REQUEST_STATUSES = ['pendiente', 'revisado'];
const ALLOWED_REQUEST_STATUSES = ['pendiente', 'revisado', 'cerrado'];

function normalizeStatusFilter(status) {
    if (!status) return '';
    if (status === 'ok') return 'cerrado';
    if (status === 'en_gestion' || status === 'pedido_proveedor' || status === 'recibido') return 'revisado';
    return status;
}

// Argentina is UTC-3. Convert an Argentina YYYY-MM-DD to UTC range [start, end).
function argentinaDateToUTCRange(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, d, 3, 0, 0)); // midnight AR = 03:00 UTC
    const end = new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0));
    return { start: start.toISOString(), end: end.toISOString() };
}

function applyFilters(query, searchParams) {
    const requestId = searchParams.get('request_id');
    const supervisorId = searchParams.get('supervisor_id');
    const serviceId = searchParams.get('service_id');
    const date = searchParams.get('date');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const status = searchParams.get('status');
    const providerId = searchParams.get('provider_id');
    const urgency = searchParams.get('urgency');

    const normalizedStatus = normalizeStatusFilter(status);
    if (normalizedStatus === 'activos') {
        query = query.in('status', ACTIVE_REQUEST_STATUSES);
    } else if (normalizedStatus && normalizedStatus !== 'todos') {
        query = query.eq('status', normalizedStatus);
    }

    if (requestId) query = query.eq('id', requestId);
    if (supervisorId) query = query.eq('supervisor_id', supervisorId);
    if (serviceId) query = query.eq('service_id', serviceId);
    if (providerId) query = query.eq('provider_id', providerId);
    if (urgency === 'solo_urgentes') query = query.eq('urgent', true);

    if (date) {
        const { start, end } = argentinaDateToUTCRange(date);
        query = query.gte('created_at', start).lt('created_at', end);
    }
    if (startDate) {
        const { start } = argentinaDateToUTCRange(startDate);
        query = query.gte('created_at', start);
    }
    if (endDate) {
        const { end } = argentinaDateToUTCRange(endDate);
        query = query.lt('created_at', end);
    }

    return query;
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const includeMeta = searchParams.get('include_meta') === 'true';

        const page = Math.max(1, Number(searchParams.get('page')) || 1);
        const limit = Math.max(1, Math.min(1000, Number(searchParams.get('limit')) || 20));
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        // Step 1: fetch supply_requests with simple select + count
        let baseQuery = supabase
            .from('supply_requests')
            .select('*', includeMeta ? { count: 'exact' } : undefined)
            .order('created_at', { ascending: false });

        baseQuery = applyFilters(baseQuery, searchParams);

        const { data: requestsRaw, error, count } = await baseQuery.range(from, to);
        if (error) throw error;

        const rows = requestsRaw || [];

        if (rows.length === 0) {
            if (!includeMeta) return Response.json([]);
            return Response.json({ requests: [], totalCount: count || 0, page, limit, totalPages: Math.ceil((count || 0) / limit) || 1 });
        }

        const requestIds = rows.map(r => r.id);
        const supervisorIds = [...new Set(rows.map(r => r.supervisor_id).filter(Boolean))];
        const serviceIds = [...new Set(rows.map(r => r.service_id).filter(Boolean))];

        // Step 2: fetch related data in parallel (each query is simple, no nested joins).
        // Items: PostgREST tope ~1000 filas por respuesta; paginamos hasta agotar
        // (necesario cuando varios pedidos en la página suman muchos items).
        const fetchAllItems = async () => {
            const PAGE = 1000;
            const all = [];
            for (let from = 0; ; from += PAGE) {
                const { data, error } = await supabase
                    .from('supply_request_items')
                    .select('id, request_id, cantidad, supply_id, faltante, agregado, marcado_at, marcado_por, supplies:supply_id(nombre, unidad)')
                    .in('request_id', requestIds)
                    .order('id', { ascending: true })
                    .range(from, from + PAGE - 1);
                if (error) return { data: null, error };
                all.push(...(data || []));
                if (!data || data.length < PAGE) break;
            }
            return { data: all, error: null };
        };

        const [itemsRes, supervisorsRes, servicesRes] = await Promise.all([
            fetchAllItems(),
            supabase
                .from('supervisors')
                .select('id, app_users:app_user_id(name, surname, username)')
                .in('id', supervisorIds),
            supabase
                .from('services')
                .select('id, name, address, encargado_nombre, encargado_telefono')
                .in('id', serviceIds),
        ]);

        // Build lookup maps
        const itemsByRequest = {};
        for (const item of (itemsRes.data || [])) {
            if (!itemsByRequest[item.request_id]) itemsByRequest[item.request_id] = [];
            itemsByRequest[item.request_id].push({
                id: item.id,
                supply_id: item.supply_id,
                cantidad: item.cantidad,
                nombre: item.supplies?.nombre || null,
                unidad: item.supplies?.unidad || null,
                faltante: Boolean(item.faltante),
                agregado: Boolean(item.agregado),
                marcado_at: item.marcado_at || null,
                marcado_por: item.marcado_por || null,
            });
        }

        const supervisorMap = {};
        for (const s of (supervisorsRes.data || [])) {
            supervisorMap[s.id] = s.app_users;
        }

        const serviceMap = {};
        for (const s of (servicesRes.data || [])) {
            serviceMap[s.id] = s;
        }

        const requests = rows.map(row => ({
            ...row,
            service_name: serviceMap[row.service_id]?.name || null,
            service_address: serviceMap[row.service_id]?.address || null,
            service_encargado_nombre: serviceMap[row.service_id]?.encargado_nombre || null,
            service_encargado_telefono: serviceMap[row.service_id]?.encargado_telefono || null,
            supervisor_name: supervisorMap[row.supervisor_id]?.name || null,
            supervisor_surname: supervisorMap[row.supervisor_id]?.surname || null,
            supervisor_dni: supervisorMap[row.supervisor_id]?.username || null,
            provider_name: null,
            urgent: Boolean(row.urgent),
            status: normalizeStatusFilter(row.status) || 'pendiente',
            items: itemsByRequest[row.id] || [],
        }));

        if (!includeMeta) return Response.json(requests);

        const totalCount = count || 0;
        const totalPages = Math.ceil(totalCount / limit) || 1;
        return Response.json({ requests, totalCount, page, limit, totalPages });
    } catch (error) {
        console.error('Error fetching supply requests:', error);
        return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { supervisor_id, service_id, notas, items, urgent } = await req.json();

        if (!supervisor_id || !service_id) {
            return Response.json({ error: 'Supervisor y servicio son obligatorios.' }, { status: 400 });
        }

        const preparedItems = Array.isArray(items)
            ? items.filter((item) => item?.supply_id && Number(item.cantidad) > 0)
            : [];

        if (preparedItems.length === 0) {
            return Response.json({ error: 'El pedido debe incluir al menos un insumo con cantidad.' }, { status: 400 });
        }

        const { data: requestId, error } = await supabase.rpc('create_supply_request_with_items', {
            p_supervisor_id: supervisor_id,
            p_service_id: service_id,
            p_notas: notas || '',
            p_urgent: Boolean(urgent),
            p_items: preparedItems.map(item => ({
                supply_id: item.supply_id,
                cantidad: item.cantidad,
            })),
        });

        if (error) throw error;

        return Response.json({ success: true, request_id: requestId }, { status: 201 });
    } catch (error) {
        console.error('Error creating supply request:', error);
        return Response.json({ error: 'Failed to create request' }, { status: 500 });
    }
}

export async function PATCH(req) {
    try {
        const { request_id, status, completed_by, provider_id } = await req.json();

        if (!request_id) {
            return Response.json({ error: 'request_id es requerido.' }, { status: 400 });
        }

        const normalizedStatus = normalizeStatusFilter(status) || 'pendiente';

        if (!ALLOWED_REQUEST_STATUSES.includes(normalizedStatus)) {
            return Response.json({ error: 'Estado inválido.' }, { status: 400 });
        }

        const normalizedProviderId = provider_id ? Number(provider_id) : null;
        if (provider_id && !Number.isFinite(normalizedProviderId)) {
            return Response.json({ error: 'Proveedor inválido.' }, { status: 400 });
        }

        const updateData = {
            status: normalizedStatus,
            provider_id: normalizedProviderId,
            completed_by: normalizedStatus === 'cerrado' ? completed_by || null : null,
            completed_at: normalizedStatus === 'cerrado' ? new Date().toISOString() : null,
        };

        const { error: updateError } = await supabase
            .from('supply_requests')
            .update(updateData)
            .eq('id', request_id);

        if (updateError) throw updateError;

        const { data, error } = await supabase
            .from('supply_requests')
            .select('id, status, provider_id, completed_by, completed_at')
            .eq('id', request_id)
            .single();

        if (error) throw error;

        const row = {
            ...data,
            provider_name: null,
            status: normalizeStatusFilter(data.status) || 'pendiente',
        };

        return Response.json(row);
    } catch (error) {
        console.error('Error updating supply request status:', error);
        return Response.json({ error: 'Failed to update request status' }, { status: 500 });
    }
}
