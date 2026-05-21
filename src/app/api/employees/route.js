import { supabase } from '@/lib/db';
import { dniFromCuil } from '@/lib/cuil';

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

        // Reject duplicate CUIT (normalized: digits only, ignores dashes/spaces).
        // Uses a full scan + JS compare so it works even if the DB already
        // holds pre-existing duplicates or mixed formats.
        const normCuil = (data.cuil || '').toString().replace(/\D/g, '');
        if (normCuil) {
            const { data: allEmp, error: dupErr } = await supabase
                .from('employees')
                .select('id, nombre, apellido, legajo, cuil');

            if (!dupErr && Array.isArray(allEmp)) {
                const hit = allEmp.find(e => (e.cuil || '').toString().replace(/\D/g, '') === normCuil);
                if (hit) {
                    return Response.json({
                        error: `Ya existe un empleado con este CUIT: ${hit.apellido}, ${hit.nombre}${hit.legajo ? ` (legajo ${hit.legajo})` : ''}`,
                        code: 'DUPLICATE_CUIT',
                    }, { status: 409 });
                }
            }
        }

        const { nombre, apellido, dni, cuil, celular, direccion, mail, fecha_ingreso, servicio_id, legajo } = data;

        const finalDni = dni || dniFromCuil(cuil);

        const { data: result, error } = await supabase
            .from('employees')
            .insert({
                legajo: legajo || null,
                nombre,
                apellido,
                dni: finalDni || null,
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
