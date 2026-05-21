import { supabase } from '@/lib/db';

export async function GET() {
    try {
        const { data: rels, error: relErr } = await supabase
            .from('service_machines')
            .select('service_id, machine_id, quantity')
            .gt('quantity', 0);
        if (relErr) throw relErr;

        const byService = new Map();
        for (const r of rels || []) {
            const entry = byService.get(r.service_id) || { service_id: r.service_id, machine_count: 0 };
            entry.machine_count += 1;
            byService.set(r.service_id, entry);
        }

        const ids = [...byService.keys()];
        if (ids.length === 0) return Response.json([]);

        const { data: services, error: svcErr } = await supabase
            .from('services')
            .select('id, name, address')
            .in('id', ids)
            .order('name', { ascending: true });
        if (svcErr) throw svcErr;

        const result = (services || []).map(s => ({
            id: s.id,
            name: s.name,
            address: s.address,
            machine_count: byService.get(s.id)?.machine_count || 0,
        }));

        return Response.json(result);
    } catch (error) {
        console.error('Error fetching services-with-machines:', error);
        return Response.json({ error: 'Failed to fetch services' }, { status: 500 });
    }
}
