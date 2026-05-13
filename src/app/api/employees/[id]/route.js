import { supabase } from '@/lib/db';

function getTrialEndDate(fechaIngreso) {
    if (!fechaIngreso) return null;
    const endDate = new Date(`${fechaIngreso}T12:00:00Z`);
    endDate.setUTCMonth(endDate.getUTCMonth() + 6);
    return endDate.toISOString().split('T')[0];
}

async function fetchEmployeeWithJoins(id) {
    const { data, error } = await supabase
        .from('employees')
        .select('*, services:servicio_id(name)')
        .eq('id', id)
        .single();

    if (error) throw error;

    return {
        ...data,
        service_name: data.services?.name || null,
        services: undefined,
    };
}

export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const data = await req.json();

        if (data.legajo) {
            const { data: existing } = await supabase
                .from('employees')
                .select('id')
                .eq('legajo', data.legajo)
                .neq('id', id)
                .maybeSingle();

            if (existing) {
                return Response.json({ error: 'Ya existe un empleado con este Legajo' }, { status: 400 });
            }
        }

        const updateData = {};

        if ('legajo' in data) updateData.legajo = data.legajo || null;
        if ('nombre' in data) updateData.nombre = data.nombre;
        if ('apellido' in data) updateData.apellido = data.apellido;
        if ('dni' in data) updateData.dni = data.dni || null;
        if ('cuil' in data) updateData.cuil = data.cuil || null;
        if ('fecha_ingreso' in data) {
            updateData.fecha_ingreso = data.fecha_ingreso || null;
        }
        if ('celular' in data) updateData.celular = data.celular || null;
        if ('direccion' in data) updateData.direccion = data.direccion || null;
        if ('mail' in data) updateData.mail = data.mail || null;
        if ('servicio_id' in data) updateData.servicio_id = data.servicio_id || null;
        if ('estado_empleado' in data) updateData.estado_empleado = data.estado_empleado;
        if ('fecha_baja' in data) updateData.fecha_baja = data.fecha_baja || null;
        if ('motivo_baja' in data) updateData.motivo_baja = data.motivo_baja || null;

        if (Object.keys(updateData).length === 0) {
            return Response.json({ error: 'No fields to update' }, { status: 400 });
        }

        const { error } = await supabase
            .from('employees')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        const employee = await fetchEmployeeWithJoins(id);
        return Response.json(employee, { status: 200 });
    } catch (error) {
        console.error('Error updating employee:', error);
        return Response.json({ error: error?.message || 'Failed to update employee' }, { status: 500 });
    }
}
