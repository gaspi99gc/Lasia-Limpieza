import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { getSessionFromRequest } from '@/lib/authCookie';
import { ROLES_NOMINA } from '@/lib/vencimientos';
import { estaDeBaja } from '@/lib/nomina-documentacion';
import { quienEs } from '@/lib/nomina-documentacion-server';

// La nómina de cada documentación: quién va documentado. La arman Operaciones
// y la jefa operativa (y admin y RRHH), eligiendo a mano.
//
// POST   { vencimiento_id, employee_id }   agrega (queda pendiente de envío)
// DELETE ?id=N                             saca (anula la fila)
//
// La misma persona puede estar en varias nóminas, pero una sola vez en cada
// una: lo frena el índice único de la base, también con dos pedidos a la vez.

export async function POST(request) {
    const denied = await denyUnlessRole(request, ROLES_NOMINA);
    if (denied) return denied;

    try {
        const body = await request.json();
        const vencimientoId = Number(body?.vencimiento_id);
        const employeeId = Number(body?.employee_id);
        if (!vencimientoId || !employeeId) return Response.json({ error: 'Falta a quién agregar.' }, { status: 400 });

        const [{ data: venc, error: eVenc }, { data: emp, error: eEmp }] = await Promise.all([
            supabase.from('rrhh_vencimientos').select('id, anulado_at').eq('id', vencimientoId).maybeSingle(),
            supabase.from('employees').select('id, estado_empleado, fecha_baja').eq('id', employeeId).maybeSingle(),
        ]);
        if (eVenc) throw eVenc;
        if (eEmp) throw eEmp;
        if (!venc || venc.anulado_at) return Response.json({ error: 'Esa documentación no existe.' }, { status: 404 });
        if (!emp) return Response.json({ error: 'Esa persona no está en el legajo.' }, { status: 404 });
        if (estaDeBaja(emp)) return Response.json({ error: 'Esa persona está dada de baja.' }, { status: 400 });

        const { data, error } = await supabase
            .from('rrhh_vencimientos_nomina')
            .insert({
                vencimiento_id: vencimientoId,
                employee_id: employeeId,
                agregado_por: await quienEs(await getSessionFromRequest(request)),
            })
            .select()
            .single();
        if (error) {
            if (error.code === '23505') return Response.json({ error: 'Ya está en la nómina.' }, { status: 409 });
            throw error;
        }
        return Response.json(data, { status: 201 });
    } catch (error) {
        console.error('Error agregando a la nómina:', error);
        return Response.json({ error: 'No se pudo agregar.' }, { status: 500 });
    }
}

export async function DELETE(request) {
    const denied = await denyUnlessRole(request, ROLES_NOMINA);
    if (denied) return denied;

    try {
        const id = Number(new URL(request.url).searchParams.get('id'));
        if (!id) return Response.json({ error: 'Falta el id.' }, { status: 400 });

        const { data, error } = await supabase
            .from('rrhh_vencimientos_nomina')
            .update({ quitado_at: new Date().toISOString(), quitado_por: await quienEs(await getSessionFromRequest(request)) })
            .eq('id', id)
            .is('quitado_at', null)
            .select('id');
        if (error) throw error;
        if (!data?.length) return Response.json({ error: 'Esa persona ya no estaba en la nómina.' }, { status: 404 });
        return Response.json({ ok: true });
    } catch (error) {
        console.error('Error sacando de la nómina:', error);
        return Response.json({ error: 'No se pudo sacar.' }, { status: 500 });
    }
}
