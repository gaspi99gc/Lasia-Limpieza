import { supabase } from '@/lib/db';

// Un cambio de servicio también mueve al legajo (pedido del usuario,
// 2026-10-27): antes quedaba solo como informe, y el legajo y la nómina seguían
// con el servicio viejo hasta la próxima importación del operativo.
//
// Los servicios de cada persona están en employee_servicios (puede trabajar en
// más de uno, con sus horas) y el principal en employees.servicio_id. Se cambia
// solo el de origen: si también trabaja en otro, ese queda igual.

const hoyAR = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

export async function moverServicioDelLegajo(empleadoId, origen, destino) {
    const fuente = `cambio de servicio ${hoyAR()}`;
    const ahora = new Date().toISOString();

    const { data: filas, error } = await supabase
        .from('employee_servicios')
        .select('id, service_id')
        .eq('employee_id', empleadoId);
    if (error) throw error;

    const deOrigen = filas.find((f) => f.service_id === origen);
    const yaEnDestino = filas.some((f) => f.service_id === destino);

    if (deOrigen && yaEnDestino) {
        // Ya trabajaba también en el destino: solo deja el de origen.
        const { error: e } = await supabase.from('employee_servicios').delete().eq('id', deOrigen.id);
        if (e) throw e;
    } else if (deOrigen) {
        // Mismas horas, otro lugar.
        const { error: e } = await supabase.from('employee_servicios')
            .update({ service_id: destino, fuente, actualizado_at: ahora })
            .eq('id', deOrigen.id);
        if (e) throw e;
    } else if (!yaEnDestino && filas.length <= 1) {
        // El legajo no tenía cargado el origen (estaba desactualizado) y tiene
        // uno o ningún servicio: ese es el que cambia. Con varios no se adivina
        // cuál era, y quedan como están.
        const { error: e } = filas.length
            ? await supabase.from('employee_servicios')
                .update({ service_id: destino, fuente, actualizado_at: ahora })
                .eq('id', filas[0].id)
            : await supabase.from('employee_servicios')
                .insert({ employee_id: empleadoId, service_id: destino, fuente });
        if (e) throw e;
    }

    // El principal: pasa al destino si era el de origen, si no tenía, o si ya
    // no es ninguno de los servicios donde trabaja.
    const [{ data: emp, error: eEmp }, { data: quedan, error: eQuedan }] = await Promise.all([
        supabase.from('employees').select('servicio_id').eq('id', empleadoId).single(),
        supabase.from('employee_servicios').select('service_id').eq('employee_id', empleadoId),
    ]);
    if (eEmp) throw eEmp;
    if (eQuedan) throw eQuedan;
    const ids = quedan.map((f) => f.service_id);
    if (!emp.servicio_id || emp.servicio_id === origen || !ids.includes(emp.servicio_id)) {
        const { error: e } = await supabase.from('employees').update({ servicio_id: destino }).eq('id', empleadoId);
        if (e) throw e;
    }
}
