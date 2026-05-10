import { supabase } from '@/lib/db';

function normalizeSupervisorStatus(status) {
    return status === 'trabajando' || status === 'chambeando' ? 'chambeando' : 'afuera';
}

export async function ensureSupervisorStatusTable() {
    // On Supabase, tables are managed via SQL migrations
    return;
}

export async function ensureSupervisorStatusRow(supervisorId) {
    await supabase
        .from('supervisor_status')
        .upsert(
            { supervisor_id: supervisorId, status: 'afuera', updated_at: new Date().toISOString() },
            { onConflict: 'supervisor_id', ignoreDuplicates: true }
        );
}

export async function getSupervisorStatus(supervisorId) {
    const { data, error } = await supabase
        .from('supervisor_status')
        .select('supervisor_id, status, current_service_id, entered_at, entered_lat, entered_lng, exited_at, updated_at, services:current_service_id(name, address)')
        .eq('supervisor_id', supervisorId)
        .maybeSingle();

    if (error) throw error;

    if (!data) {
        return {
            supervisor_id: supervisorId,
            status: 'afuera',
            current_service_id: null,
            current_service_name: null,
            current_service_address: null,
            entered_at: null,
            entered_lat: null,
            entered_lng: null,
            exited_at: null,
            updated_at: null,
        };
    }

    return {
        supervisor_id: data.supervisor_id,
        status: normalizeSupervisorStatus(data.status),
        current_service_id: data.current_service_id,
        current_service_name: data.services?.name || null,
        current_service_address: data.services?.address || null,
        entered_at: data.entered_at,
        entered_lat: data.entered_lat,
        entered_lng: data.entered_lng,
        exited_at: data.exited_at,
        updated_at: data.updated_at,
    };
}

export async function updateSupervisorStatus(supervisorId, status) {
    await ensureSupervisorStatusRow(supervisorId);

    const currentStatus = await getSupervisorStatus(supervisorId);
    const normalizedStatus = normalizeSupervisorStatus(status);
    const serviceId = Number(currentStatus?.current_service_id);

    if (normalizedStatus === 'afuera' && (!Number.isFinite(serviceId) || serviceId <= 0)) {
        throw new Error('No hay un servicio activo para registrar la salida.');
    }

    const now = new Date().toISOString();
    const updateData = { status: normalizedStatus, updated_at: now };

    if (normalizedStatus === 'chambeando') {
        updateData.entered_at = now;
    } else {
        updateData.current_service_id = null;
        updateData.entered_lat = null;
        updateData.entered_lng = null;
        updateData.exited_at = now;
    }

    const { error } = await supabase
        .from('supervisor_status')
        .update(updateData)
        .eq('supervisor_id', supervisorId);

    if (error) throw error;

    if (Number.isFinite(serviceId) && serviceId > 0) {
        await supabase
            .from('supervisor_presentismo_logs')
            .insert({
                supervisor_id: supervisorId,
                service_id: serviceId,
                event_type: normalizedStatus === 'chambeando' ? 'ingreso' : 'salida',
                event_lat: null,
                event_lng: null,
            });
    }

    return getSupervisorStatus(supervisorId);
}

export async function updateSupervisorStatusWithService(supervisorId, status, serviceId, coordinates) {
    await ensureSupervisorStatusRow(supervisorId);

    const normalizedStatus = normalizeSupervisorStatus(status);

    if (normalizedStatus !== 'chambeando') {
        return updateSupervisorStatus(supervisorId, normalizedStatus);
    }

    const normalizedServiceId = Number(serviceId);

    if (!Number.isFinite(normalizedServiceId) || normalizedServiceId <= 0) {
        throw new Error('Seleccioná un servicio antes de ingresar.');
    }

    const enteredLat = Number(coordinates?.lat);
    const enteredLng = Number(coordinates?.lng);

    if (!Number.isFinite(enteredLat) || !Number.isFinite(enteredLng)) {
        throw new Error('No se pudieron obtener las coordenadas exactas del ingreso.');
    }

    const now = new Date().toISOString();

    const { error } = await supabase
        .from('supervisor_status')
        .update({
            status: 'chambeando',
            current_service_id: normalizedServiceId,
            entered_at: now,
            entered_lat: enteredLat,
            entered_lng: enteredLng,
            exited_at: null,
            updated_at: now,
        })
        .eq('supervisor_id', supervisorId);

    if (error) throw error;

    await supabase
        .from('supervisor_presentismo_logs')
        .insert({
            supervisor_id: supervisorId,
            service_id: normalizedServiceId,
            event_type: 'ingreso',
            event_lat: enteredLat,
            event_lng: enteredLng,
        });

    return getSupervisorStatus(supervisorId);
}
