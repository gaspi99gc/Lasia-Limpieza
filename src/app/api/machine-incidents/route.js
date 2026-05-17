import { supabase } from '@/lib/db';

const ESTADOS = ['abierta', 'en_revision', 'reparada', 'reemplazada', 'descartada'];

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const estado = searchParams.get('estado');
        const serviceId = searchParams.get('service_id');
        const machineId = searchParams.get('machine_id');

        let query = supabase
            .from('machine_incidents')
            .select('id, service_id, machine_id, descripcion, nota_interna, estado, created_at, updated_at, services(name), machines(nombre)')
            .order('created_at', { ascending: false });

        if (estado) query = query.eq('estado', estado);
        if (serviceId) query = query.eq('service_id', serviceId);
        if (machineId) query = query.eq('machine_id', machineId);

        const { data, error } = await query;
        if (error) throw error;

        const flat = (data || []).map(r => ({
            id: r.id,
            service_id: r.service_id,
            machine_id: r.machine_id,
            descripcion: r.descripcion,
            nota_interna: r.nota_interna,
            estado: r.estado,
            created_at: r.created_at,
            updated_at: r.updated_at,
            service_name: r.services?.name || null,
            machine_nombre: r.machines?.nombre || null,
        }));

        return Response.json(flat);
    } catch (error) {
        console.error('Error fetching machine_incidents:', error);
        return Response.json({ error: 'Failed to fetch incidents' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { service_id, machine_id, descripcion, nota_interna, estado } = await req.json();

        if (!service_id || !machine_id) {
            return Response.json({ error: 'service_id y machine_id son obligatorios' }, { status: 400 });
        }
        if (!descripcion?.trim()) {
            return Response.json({ error: 'La descripción es obligatoria' }, { status: 400 });
        }
        const finalEstado = estado || 'abierta';
        if (!ESTADOS.includes(finalEstado)) {
            return Response.json({ error: 'Estado inválido' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('machine_incidents')
            .insert({
                service_id,
                machine_id,
                descripcion: descripcion.trim(),
                nota_interna: nota_interna?.trim() || null,
                estado: finalEstado,
            })
            .select()
            .single();

        if (error) throw error;
        return Response.json(data, { status: 201 });
    } catch (error) {
        console.error('Error creating machine_incident:', error);
        return Response.json({ error: 'Failed to create incident' }, { status: 500 });
    }
}
