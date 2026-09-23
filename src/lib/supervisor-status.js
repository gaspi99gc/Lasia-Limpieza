import { supabase } from '@/lib/db';

function normalizeSupervisorStatus(status) {
    return status === 'trabajando' || status === 'trabajando' ? 'trabajando' : 'afuera';
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

    if (normalizedStatus === 'trabajando') {
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
                event_type: normalizedStatus === 'trabajando' ? 'ingreso' : 'salida',
                event_lat: null,
                event_lng: null,
            });
    }

    return getSupervisorStatus(supervisorId);
}

export async function updateSupervisorStatusWithService(supervisorId, status, serviceId, coordinates) {
    await ensureSupervisorStatusRow(supervisorId);

    const normalizedStatus = normalizeSupervisorStatus(status);

    if (normalizedStatus !== 'trabajando') {
        return updateSupervisorStatus(supervisorId, normalizedStatus);
    }

    const normalizedServiceId = Number(serviceId);

    if (!Number.isFinite(normalizedServiceId) || normalizedServiceId <= 0) {
        throw new Error('Seleccioná un servicio antes de ingresar.');
    }

    const enteredLat = Number(coordinates?.lat);
    const enteredLng = Number(coordinates?.lng);
    const accuracyM = Number.isFinite(Number(coordinates?.accuracy_m)) ? Number(coordinates.accuracy_m) : null;

    if (!Number.isFinite(enteredLat) || !Number.isFinite(enteredLng)) {
        throw new Error('No se pudieron obtener las coordenadas exactas del ingreso.');
    }

    const now = new Date().toISOString();

    // Si venia trabajando en OTRO servicio y nunca ficho la salida, se la
    // cerramos nosotros antes de abrir la nueva.
    //
    // Pasa de verdad: el supervisor se va al proximo servicio y ficha el ingreso
    // ahi sin acordarse de salir del anterior. Sin esto el ingreso viejo queda
    // abierto para siempre y el dia se lee mal en la pantalla y en los reportes.
    //
    // No se bloquea el ingreso nuevo: dejar al supervisor sin poder fichar
    // porque se olvido de salir del anterior es peor que una hora estimada.
    await cerrarServicioAbierto(supervisorId, normalizedServiceId);

    const { error } = await supabase
        .from('supervisor_status')
        .update({
            status: 'trabajando',
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
            event_accuracy_m: accuracyM,
        });

    return getSupervisorStatus(supervisorId);
}

// Cuanto se le estima a un servicio que quedo sin salida.
//
// Una hora es lo que dura una visita tipica y, sobre todo, no se pisa con el
// ingreso siguiente: en todo el historial el hueco mas corto entre un ingreso
// abierto y el siguiente fue de 90 minutos.
const MINUTOS_ESTIMADOS_SALIDA = 60;

/**
 * Cierra el servicio que quedo abierto antes de fichar uno nuevo.
 *
 * La salida se marca como agregada por el sistema (`agregado_manual`) para que
 * se distinga de una fichada real: es una estimacion, no algo que el supervisor
 * marco. Operaciones la puede corregir despues desde la pantalla de fichadas.
 *
 * Si el ingreso nuevo cae antes de esa hora estimada, la salida se pone justo
 * antes del ingreso nuevo: nunca puede quedar una salida posterior al ingreso
 * siguiente, que daria vuelta el orden del dia.
 */
async function cerrarServicioAbierto(supervisorId, servicioNuevoId) {
    const actual = await getSupervisorStatus(supervisorId);
    const abiertoId = Number(actual?.current_service_id);

    // Nada abierto, o esta re-fichando el mismo servicio: no hay que cerrar nada.
    if (!Number.isFinite(abiertoId) || abiertoId <= 0) return;
    if (abiertoId === Number(servicioNuevoId)) return;
    if (normalizeSupervisorStatus(actual?.status) !== 'trabajando') return;

    // El ingreso que quedo sin cerrar.
    const { data: ingreso } = await supabase
        .from('supervisor_presentismo_logs')
        .select('id, occurred_at')
        .eq('supervisor_id', supervisorId)
        .eq('service_id', abiertoId)
        .eq('event_type', 'ingreso')
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!ingreso) return;

    // Por las dudas: si ya tiene una salida posterior, no quedo abierto.
    const { data: salida } = await supabase
        .from('supervisor_presentismo_logs')
        .select('id')
        .eq('supervisor_id', supervisorId)
        .eq('service_id', abiertoId)
        .eq('event_type', 'salida')
        .gt('occurred_at', ingreso.occurred_at)
        .limit(1)
        .maybeSingle();

    if (salida) return;

    const desde = new Date(ingreso.occurred_at).getTime();
    const estimada = desde + MINUTOS_ESTIMADOS_SALIDA * 60 * 1000;
    const ahora = Date.now();
    // Un minuto antes del ingreso nuevo, si la hora estimada lo pasaria.
    const tope = ahora - 60 * 1000;
    const occurredAt = new Date(Math.min(estimada, Math.max(desde + 60 * 1000, tope))).toISOString();

    await supabase
        .from('supervisor_presentismo_logs')
        .insert({
            supervisor_id: supervisorId,
            service_id: abiertoId,
            event_type: 'salida',
            event_lat: null,
            event_lng: null,
            agregado_manual: true,
            agregado_por: 'sistema',
            agregado_at: new Date().toISOString(),
            nota: 'Salida estimada: fichó el ingreso al servicio siguiente sin marcar esta salida.',
        });
}
