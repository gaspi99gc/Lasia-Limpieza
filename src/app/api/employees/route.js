import { supabase } from '@/lib/db';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('employees')
            .select('*, services:servicio_id(name)')
            .order('apellido', { ascending: true })
            .order('nombre', { ascending: true });

        if (error) throw error;

        const rows = (data || []).map(emp => ({
            ...emp,
            service_name: emp.services?.name || null,
            services: undefined,
        }));

        return Response.json(rows);
    } catch (error) {
        console.error('Error fetching employees:', error);
        return Response.json({ error: 'Failed to fetch employees' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const data = await req.json();

        if (data.legajo) {
            const { data: existing } = await supabase
                .from('employees')
                .select('id')
                .eq('legajo', data.legajo)
                .maybeSingle();

            if (existing) {
                return Response.json({ error: 'Ya existe un empleado con este Legajo' }, { status: 400 });
            }
        }

        const { nombre, apellido, dni, cuil, celular, direccion, mail, fecha_ingreso, servicio_id, legajo } = data;

        const { data: result, error } = await supabase
            .from('employees')
            .insert({
                legajo: legajo || null,
                nombre,
                apellido,
                dni: dni || null,
                cuil: cuil || null,
                celular: celular || null,
                direccion: direccion || null,
                mail: mail || null,
                fecha_ingreso: fecha_ingreso || null,
                servicio_id: servicio_id || null,
                estado_empleado: 'Activo',
            })
            .select('id')
            .single();

        if (error) throw error;

        return Response.json({ id: result.id, ...data, estado_empleado: 'Activo' }, { status: 201 });
    } catch (error) {
        console.error('Error creating employee:', error);
        return Response.json({ error: 'Failed to create employee' }, { status: 500 });
    }
}
