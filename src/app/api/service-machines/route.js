import { supabase } from '@/lib/db';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('service_machines')
            .select('service_id, machine_id');

        if (error) throw error;
        return Response.json(data || []);
    } catch (error) {
        console.error('Error fetching service_machines:', error);
        return Response.json({ error: 'Failed to fetch service machines' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { service_id, machine_id } = await req.json();

        if (!service_id || !machine_id) {
            return Response.json({ error: 'service_id y machine_id son obligatorios' }, { status: 400 });
        }

        const { error } = await supabase
            .from('service_machines')
            .insert({ service_id, machine_id });

        if (error) throw error;
        return Response.json({ success: true }, { status: 201 });
    } catch (error) {
        console.error('Error inserting service_machine:', error);
        return Response.json({ error: 'Failed to add machine to service' }, { status: 500 });
    }
}

export async function DELETE(req) {
    try {
        const { service_id, machine_id } = await req.json();

        if (!service_id) {
            return Response.json({ error: 'service_id es obligatorio' }, { status: 400 });
        }

        let query = supabase.from('service_machines').delete().eq('service_id', service_id);
        if (machine_id) query = query.eq('machine_id', machine_id);
        const { error } = await query;

        if (error) throw error;
        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting service_machine:', error);
        return Response.json({ error: 'Failed to remove machine from service' }, { status: 500 });
    }
}
