import { supabase } from '@/lib/db';

function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function getZone(distanceMeters) {
    if (distanceMeters <= 200) return 'green';
    if (distanceMeters <= 500) return 'yellow';
    return 'red';
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const supervisorId = searchParams.get('supervisor_id');
        const serviceId = searchParams.get('service_id');
        const active = searchParams.get('active');
        const today = searchParams.get('today');

        let query = supabase
            .from('attendance')
            .select('id, supervisor_id, service_id, type, timestamp, lat, lng, verified, distance_meters, zone, services:service_id(name)')
            .order('timestamp', { ascending: false });

        if (supervisorId) query = query.eq('supervisor_id', supervisorId);
        if (serviceId) query = query.eq('service_id', serviceId);

        if (today === 'true') {
            // Argentina is UTC-3: today starts at 03:00 UTC
            const now = new Date();
            const argOffset = 3 * 60 * 60 * 1000;
            const argNow = new Date(now.getTime() - argOffset);
            const todayStr = argNow.toISOString().split('T')[0];
            const startUTC = `${todayStr}T03:00:00.000Z`;
            query = query.gte('timestamp', startUTC);
        }

        // When filtering for active check-ins, restrict to check-in rows at DB level
        // to avoid fetching the full table and filtering in JS.
        if (active === 'true') query = query.eq('type', 'check-in');

        const { data, error } = await query;
        if (error) throw error;

        let rows = (data || []).map(a => ({
            ...a,
            service_name: a.services?.name || null,
            services: undefined,
        }));

        if (active === 'true') {
            // A correlated NOT EXISTS ("no check-out after this check-in") can't be expressed
            // in the PostgREST query builder — it needs a raw SQL subquery or an RPC.
            // Instead: fetch only the check-out rows for the relevant supervisors (3 fields,
            // no joins) and match in JS. Both sets are small, so the cross-check is cheap.
            const supervisorIds = [...new Set(rows.map(r => r.supervisor_id))];

            let checkouts = [];
            if (supervisorIds.length > 0) {
                const { data: coData } = await supabase
                    .from('attendance')
                    .select('supervisor_id, service_id, timestamp')
                    .eq('type', 'check-out')
                    .in('supervisor_id', supervisorIds);
                checkouts = coData || [];
            }

            rows = rows.filter(a =>
                !checkouts.some(co =>
                    co.supervisor_id === a.supervisor_id &&
                    co.service_id === a.service_id &&
                    co.timestamp > a.timestamp
                )
            );
        }

        return Response.json(rows);
    } catch (error) {
        console.error('Error fetching attendance:', error);
        return Response.json({ error: 'Failed to fetch attendance' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { supervisor_id, service_id, type, lat, lng } = await req.json();

        const [{ data: checkIns }, { data: checkOuts }] = await Promise.all([
            supabase
                .from('attendance')
                .select('*, services:service_id(name)')
                .eq('supervisor_id', supervisor_id)
                .eq('type', 'check-in')
                .order('timestamp', { ascending: false }),
            supabase
                .from('attendance')
                .select('service_id, timestamp')
                .eq('supervisor_id', supervisor_id)
                .eq('type', 'check-out'),
        ]);

        // Build a Map of service_id → latest check-out timestamp for O(1) lookup
        const latestCheckOut = new Map();
        for (const co of checkOuts || []) {
            const prev = latestCheckOut.get(co.service_id);
            if (!prev || co.timestamp > prev) latestCheckOut.set(co.service_id, co.timestamp);
        }

        // Find the active check-in: no check-out happened after it for the same service
        const activeCheckin = (checkIns || []).find(ci => {
            const latestOut = latestCheckOut.get(ci.service_id);
            return !latestOut || ci.timestamp > latestOut;
        });

        const hasActiveCheckin = Boolean(activeCheckin);

        if (type === 'check-in' && hasActiveCheckin) {
            return Response.json({
                error: `Ya tenés una entrada activa en "${activeCheckin.services?.name}". Fichá la salida primero.`,
                active_checkin: { ...activeCheckin, service_name: activeCheckin.services?.name }
            }, { status: 400 });
        }

        if (type === 'check-out' && (!hasActiveCheckin || activeCheckin.service_id !== service_id)) {
            return Response.json({ error: 'No hay una entrada activa para este servicio.' }, { status: 400 });
        }

        const { data: service } = await supabase
            .from('services')
            .select('lat, lng')
            .eq('id', service_id)
            .single();

        let verified = false;
        let distance_meters = null;
        let zone = 'red';

        if (service?.lat && service?.lng) {
            distance_meters = haversineDistance(lat, lng, service.lat, service.lng);
            zone = getZone(distance_meters);
            verified = zone === 'green';
        }

        const { data: result, error } = await supabase
            .from('attendance')
            .insert({ supervisor_id, service_id, type, lat, lng, verified, distance_meters, zone })
            .select()
            .single();

        if (error) throw error;

        return Response.json(result, { status: 201 });
    } catch (error) {
        console.error('Error recording attendance:', error);
        return Response.json({ error: 'Failed to record attendance' }, { status: 500 });
    }
}
