import { supabase } from '@/lib/db';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('service_machines')
            .select('service_id, machine_id, quantity');

        if (error) throw error;
        return Response.json(data || []);
    } catch (error) {
        console.error('Error fetching service_machines:', error);
        return Response.json({ error: 'Failed to fetch service machines' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const body = await req.json();
        const service_id = body.service_id;
        const machine_id = body.machine_id;
        const quantity = body.quantity === undefined ? 1 : Number(body.quantity);

        if (!service_id || !machine_id) {
            return Response.json({ error: 'service_id y machine_id son obligatorios' }, { status: 400 });
        }
        if (!Number.isFinite(quantity) || quantity < 0) {
            return Response.json({ error: 'quantity debe ser un entero >= 0' }, { status: 400 });
        }

        if (quantity === 0) {
            const { error } = await supabase
                .from('service_machines')
                .delete()
                .eq('service_id', service_id)
                .eq('machine_id', machine_id);
            if (error) throw error;
            return Response.json({ success: true, quantity: 0 });
        }

        const { error } = await supabase
            .from('service_machines')
            .upsert(
                { service_id, machine_id, quantity },
                { onConflict: 'service_id,machine_id' }
            );

        if (error) throw error;
        return Response.json({ success: true, quantity }, { status: 201 });
    } catch (error) {
        console.error('Error upserting service_machine:', error);
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
