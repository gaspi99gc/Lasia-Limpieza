import { supabase } from '@/lib/db';

export const runtime = 'nodejs';

// Argentina is UTC-3. Build the UTC [start, end) covering full AR days from
// dateFrom to dateTo inclusive (both YYYY-MM-DD).
function argentinaRangeToUTC(dateFrom, dateTo) {
    const [fy, fm, fd] = dateFrom.split('-').map(Number);
    const [ty, tm, td] = dateTo.split('-').map(Number);
    const start = new Date(Date.UTC(fy, fm - 1, fd, 3, 0, 0)); // midnight AR = 03:00 UTC
    const end = new Date(Date.UTC(ty, tm - 1, td + 1, 3, 0, 0)); // exclusive: midnight AR after dateTo
    return { start: start.toISOString(), end: end.toISOString() };
}

// Aggregated "remito" for a given load date: sums quantities per supply across
// every supply_request created that day. Single source of truth for both the
// general remito and the per-provider remitos (frontend filters by provider).
export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const dateFrom = searchParams.get('date_from');
        const dateTo = searchParams.get('date_to');
        const group = searchParams.get('group'); // 'service' for per-service remitos

        const dateRe = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateFrom || !dateTo || !dateRe.test(dateFrom) || !dateRe.test(dateTo)) {
            return Response.json({ error: 'Parámetros date_from y date_to (YYYY-MM-DD) son requeridos.' }, { status: 400 });
        }
        if (dateFrom > dateTo) {
            return Response.json({ error: 'La fecha de inicio no puede ser posterior a la de fin.' }, { status: 400 });
        }

        const { start, end } = argentinaRangeToUTC(dateFrom, dateTo);

        // 1) All requests created in the range.
        const { data: requests, error: reqErr } = await supabase
            .from('supply_requests')
            .select('id, service_id, supervisor_id')
            .gte('created_at', start)
            .lt('created_at', end);

        if (reqErr) throw reqErr;

        const rows = requests || [];
        if (rows.length === 0) {
            if (group === 'service') {
                return Response.json({ dateFrom, dateTo, totalPedidos: 0, totalServicios: 0, servicios: [] });
            }
            return Response.json({ dateFrom, dateTo, totalPedidos: 0, totalServicios: 0, lineas: [], providers: [] });
        }

        const requestIds = rows.map(r => r.id);
        const totalServicios = new Set(rows.map(r => r.service_id).filter(Boolean)).size;

        // 2) All items for those requests, joined with supply + provider.
        //    Supabase caps rows per request, so page through to be safe with ~130 pedidos.
        const pageSize = 1000;
        const items = [];
        for (let from = 0; ; from += pageSize) {
            const { data: chunk, error: itemErr } = await supabase
                .from('supply_request_items')
                .select('request_id, supply_id, cantidad, supplies:supply_id(nombre, unidad, provider_id, providers(name))')
                .in('request_id', requestIds)
                .eq('eliminado', false)
                .range(from, from + pageSize - 1);
            if (itemErr) throw itemErr;
            if (!chunk || chunk.length === 0) break;
            items.push(...chunk);
            if (chunk.length < pageSize) break;
        }

        if (group === 'service') {
            return await buildPerService({ rows, items, dateFrom, dateTo, totalServicios });
        }

        // 3) Aggregate per supply_id.
        const bySupply = new Map();
        for (const it of items) {
            const cantidad = Number(it.cantidad) || 0;
            if (!it.supply_id || cantidad <= 0) continue;
            const existing = bySupply.get(it.supply_id);
            if (existing) {
                existing.cantidad_total += cantidad;
            } else {
                bySupply.set(it.supply_id, {
                    supply_id: it.supply_id,
                    nombre: it.supplies?.nombre || 'Insumo sin nombre',
                    unidad: it.supplies?.unidad || 'unidades',
                    provider_id: it.supplies?.provider_id ?? null,
                    provider_name: it.supplies?.providers?.name || 'Sin proveedor',
                    cantidad_total: cantidad,
                });
            }
        }

        const lineas = Array.from(bySupply.values()).sort((a, b) =>
            a.provider_name.localeCompare(b.provider_name) ||
            a.nombre.localeCompare(b.nombre));

        // Distinct providers present (for building per-provider remitos in the UI).
        const providerMap = new Map();
        for (const l of lineas) {
            if (!providerMap.has(l.provider_id)) {
                providerMap.set(l.provider_id, {
                    provider_id: l.provider_id,
                    provider_name: l.provider_name,
                    lineCount: 0,
                });
            }
            providerMap.get(l.provider_id).lineCount += 1;
        }

        const providers = Array.from(providerMap.values())
            .sort((a, b) => a.provider_name.localeCompare(b.provider_name));

        return Response.json({
            dateFrom,
            dateTo,
            totalPedidos: rows.length,
            totalServicios,
            lineas,
            providers,
        });
    } catch (error) {
        console.error('Error generando remito:', error);
        return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
}

// Per-service remitos: one entry per service with its items aggregated (alphabetical).
async function buildPerService({ rows, items, dateFrom, dateTo, totalServicios }) {
    // request_id -> service_id / supervisor_id
    const reqMap = new Map();
    for (const r of rows) reqMap.set(r.id, r);

    const serviceIds = [...new Set(rows.map(r => r.service_id).filter(Boolean))];
    const supervisorIds = [...new Set(rows.map(r => r.supervisor_id).filter(Boolean))];

    const [servicesRes, supervisorsRes] = await Promise.all([
        serviceIds.length
            ? supabase.from('services').select('id, name, address').in('id', serviceIds)
            : Promise.resolve({ data: [] }),
        supervisorIds.length
            ? supabase.from('supervisors').select('id, app_users:app_user_id(name, surname)').in('id', supervisorIds)
            : Promise.resolve({ data: [] }),
    ]);

    const serviceMap = new Map((servicesRes.data || []).map(s => [s.id, s]));
    const supervisorMap = new Map((supervisorsRes.data || []).map(s => [s.id, s.app_users]));

    // service_id -> { info, supplyId -> aggregated line }
    const byService = new Map();
    for (const it of items) {
        const cantidad = Number(it.cantidad) || 0;
        if (!it.supply_id || cantidad <= 0) continue;
        const reqInfo = reqMap.get(it.request_id);
        if (!reqInfo) continue;
        const serviceId = reqInfo.service_id;

        if (!byService.has(serviceId)) {
            const svc = serviceMap.get(serviceId);
            const sup = supervisorMap.get(reqInfo.supervisor_id);
            byService.set(serviceId, {
                service_id: serviceId,
                service_name: svc?.name || 'Servicio sin nombre',
                service_address: svc?.address || '',
                supervisor_name: sup?.name || '',
                supervisor_surname: sup?.surname || '',
                _bySupply: new Map(),
            });
        }
        const svcEntry = byService.get(serviceId);
        const existing = svcEntry._bySupply.get(it.supply_id);
        if (existing) {
            existing.cantidad_total += cantidad;
        } else {
            svcEntry._bySupply.set(it.supply_id, {
                supply_id: it.supply_id,
                nombre: it.supplies?.nombre || 'Insumo sin nombre',
                unidad: it.supplies?.unidad || 'unidades',
                provider_id: it.supplies?.provider_id ?? null,
                provider_name: it.supplies?.providers?.name || 'Sin proveedor',
                cantidad_total: cantidad,
            });
        }
    }

    const servicios = Array.from(byService.values())
        .map(s => ({
            service_id: s.service_id,
            service_name: s.service_name,
            service_address: s.service_address,
            supervisor_name: s.supervisor_name,
            supervisor_surname: s.supervisor_surname,
            lineas: Array.from(s._bySupply.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)),
        }))
        .sort((a, b) => a.service_name.localeCompare(b.service_name));

    return Response.json({
        dateFrom,
        dateTo,
        totalPedidos: rows.length,
        totalServicios,
        servicios,
    });
}
