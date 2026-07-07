import { supabase } from '@/lib/db';
import { checkinDistance } from '@/lib/geo';

export const runtime = 'nodejs';

const toArg = (date) => new Date(date.getTime() - 3 * 60 * 60 * 1000);

const formatArgTime = (date) => {
    const a = toArg(date);
    return `${String(a.getUTCHours()).padStart(2, '0')}:${String(a.getUTCMinutes()).padStart(2, '0')}`;
};

const formatDuration = (ms) => {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const argDateStr = (date) => {
    const a = toArg(date);
    return `${a.getUTCFullYear()}-${String(a.getUTCMonth() + 1).padStart(2, '0')}-${String(a.getUTCDate()).padStart(2, '0')}`;
};

const DAY_NAMES_DOW = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];

function buildRange(searchParams) {
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    let fromStr, toStr;
    if (dateFrom && dateTo) {
        fromStr = dateFrom;
        toStr = dateTo;
    } else {
        const argNow = toArg(new Date());
        const y = argNow.getUTCFullYear();
        const mo = argNow.getUTCMonth();
        const d = argNow.getUTCDate();
        const today = new Date(Date.UTC(y, mo, d));
        const from = new Date(Date.UTC(y, mo, d - 6));
        const ymd = (dt) => `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
        fromStr = ymd(from);
        toStr = ymd(today);
    }

    const rangeStartUTC = new Date(fromStr + 'T03:00:00.000Z');
    const rangeEndUTC = new Date(toStr + 'T03:00:00.000Z');
    rangeEndUTC.setUTCDate(rangeEndUTC.getUTCDate() + 1);
    rangeEndUTC.setUTCMilliseconds(-1);

    const days = [];
    const cursor = new Date(fromStr + 'T03:00:00.000Z');
    const end = new Date(toStr + 'T03:00:00.000Z');
    while (cursor <= end) {
        const a = toArg(cursor);
        const dateStr = `${a.getUTCFullYear()}-${String(a.getUTCMonth() + 1).padStart(2, '0')}-${String(a.getUTCDate()).padStart(2, '0')}`;
        const dd = String(a.getUTCDate()).padStart(2, '0');
        const mm = String(a.getUTCMonth() + 1).padStart(2, '0');
        days.push({
            dateStr,
            label: `${DAY_NAMES_DOW[a.getUTCDay()]} ${dd}/${mm}/${a.getUTCFullYear()}`,
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return { fromStr, toStr, rangeStartUTC, rangeEndUTC, days };
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const supervisorId = searchParams.get('supervisor_id');
        if (!supervisorId) {
            return Response.json({ error: 'supervisor_id es requerido' }, { status: 400 });
        }

        const { fromStr, toStr, rangeStartUTC, rangeEndUTC, days } = buildRange(searchParams);

        const { data: supData } = await supabase
            .from('supervisors')
            .select('id, app_users(name, surname)')
            .eq('id', supervisorId)
            .single();

        const supName = supData?.app_users?.name || 'Supervisor';
        const supSurname = supData?.app_users?.surname || '';

        const { data, error } = await supabase
            .from('supervisor_presentismo_logs')
            .select('event_type, occurred_at, service_id, event_lat, event_lng, event_accuracy_m, services:service_id(name, lat, lng)')
            .eq('supervisor_id', supervisorId)
            .gte('occurred_at', rangeStartUTC.toISOString())
            .lte('occurred_at', rangeEndUTC.toISOString())
            .order('occurred_at', { ascending: true });

        if (error) throw error;

        const logs = (data || []).map(l => ({
            event_type: l.event_type,
            occurred_at: new Date(l.occurred_at),
            service_id: l.service_id,
            service_name: l.services?.name || 'Sin servicio',
            // Distancia del evento a su servicio. Se calcula para ingreso y salida
            // por igual, asi podemos avisar si el "lejos" fue en uno u otro.
            dist: checkinDistance(l.event_lat, l.event_lng, l.services?.lat, l.services?.lng),
            accuracy: Number.isFinite(Number(l.event_accuracy_m)) ? Number(l.event_accuracy_m) : null,
        }));

        // Pair ingreso + salida en visitas
        const openIngresos = {};
        const visits = [];

        for (const event of logs) {
            if (event.event_type === 'ingreso') {
                if (openIngresos[event.service_id]) {
                    const prev = openIngresos[event.service_id];
                    visits.push({
                        service_id: prev.service_id,
                        service_name: prev.service_name,
                        ingreso: prev.occurred_at,
                        egreso: null,
                        durationMs: 0,
                        ongoing: true,
                        ingresoDist: prev.dist,
                        ingresoAccuracy: prev.accuracy,
                        salidaDist: null,
                        salidaAccuracy: null,
                    });
                }
                openIngresos[event.service_id] = event;
            } else if (event.event_type === 'salida') {
                const ingreso = openIngresos[event.service_id];
                if (ingreso) {
                    visits.push({
                        service_id: event.service_id,
                        service_name: event.service_name,
                        ingreso: ingreso.occurred_at,
                        egreso: event.occurred_at,
                        durationMs: event.occurred_at - ingreso.occurred_at,
                        ongoing: false,
                        ingresoDist: ingreso.dist,
                        ingresoAccuracy: ingreso.accuracy,
                        salidaDist: event.dist,
                        salidaAccuracy: event.accuracy,
                    });
                    delete openIngresos[event.service_id];
                }
            }
        }
        for (const sid in openIngresos) {
            const ing = openIngresos[sid];
            visits.push({
                service_id: ing.service_id,
                service_name: ing.service_name,
                ingreso: ing.occurred_at,
                egreso: null,
                durationMs: 0,
                ongoing: true,
                ingresoDist: ing.dist,
                ingresoAccuracy: ing.accuracy,
                salidaDist: null,
                salidaAccuracy: null,
            });
        }

        // Agrupar visitas por dia
        const byDay = new Map();
        for (const v of visits) {
            const ds = argDateStr(v.ingreso);
            if (!byDay.has(ds)) byDay.set(ds, []);
            byDay.get(ds).push(v);
        }

        // Armar respuesta dia por dia (incluye dias sin fichadas)
        let totalMs = 0;
        const serviciosVisitados = new Set();
        let diasConFichada = 0;

        const daysOut = days.map(d => {
            const list = byDay.get(d.dateStr) || [];
            if (list.length > 0) diasConFichada += 1;
            const items = list
                .sort((a, b) => a.ingreso - b.ingreso)
                .map(v => {
                    totalMs += v.durationMs;
                    serviciosVisitados.add(v.service_id);
                    const ingresoLejos = !!(v.ingresoDist && v.ingresoDist.far);
                    const salidaLejos = !!(v.salidaDist && v.salidaDist.far);
                    return {
                        service_id: v.service_id,
                        service_name: v.service_name,
                        ingresoHora: formatArgTime(v.ingreso),
                        egresoHora: v.egreso ? formatArgTime(v.egreso) : null,
                        duracion: v.egreso ? formatDuration(v.durationMs) : null,
                        ongoing: v.ongoing,
                        // "lejos" general (para compatibilidad) + detalle por evento.
                        lejos: ingresoLejos || salidaLejos,
                        ingresoLejos,
                        salidaLejos,
                        ingresoDistanciaMetros: ingresoLejos ? Math.round(v.ingresoDist.meters) : null,
                        salidaDistanciaMetros: salidaLejos ? Math.round(v.salidaDist.meters) : null,
                        gpsAccuracy: Number.isFinite(v.ingresoAccuracy) ? Math.round(v.ingresoAccuracy) : null,
                        salidaGpsAccuracy: Number.isFinite(v.salidaAccuracy) ? Math.round(v.salidaAccuracy) : null,
                    };
                });
            return {
                date: d.dateStr,
                label: d.label,
                visitas: items,
            };
        });

        return Response.json({
            supervisor: {
                id: Number(supervisorId),
                name: supName,
                surname: supSurname,
            },
            dateFrom: fromStr,
            dateTo: toStr,
            totales: {
                hsTotal: formatDuration(totalMs),
                diasConFichada,
                serviciosVisitados: serviciosVisitados.size,
            },
            days: daysOut,
        });
    } catch (error) {
        console.error('Error generando weekly-json:', error);
        return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
}
