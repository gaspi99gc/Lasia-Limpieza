import { supabase } from '@/lib/db';
import { checkinDistance } from '@/lib/geo';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';

// Argentina is fixed at UTC-3 (no DST)
const toArg = (date) => new Date(date.getTime() - 3 * 60 * 60 * 1000);

const formatArgTime = (date) => {
    const a = toArg(date);
    return `${String(a.getUTCHours()).padStart(2, '0')}:${String(a.getUTCMinutes()).padStart(2, '0')}:${String(a.getUTCSeconds()).padStart(2, '0')}`;
};

const formatDuration = (ms) => {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

// Argentina date string YYYY-MM-DD for a UTC Date
const argDateStr = (date) => {
    const a = toArg(date);
    return `${a.getUTCFullYear()}-${String(a.getUTCMonth() + 1).padStart(2, '0')}-${String(a.getUTCDate()).padStart(2, '0')}`;
};

const fmtYMD = (ymd) => { const [y, m, d] = ymd.split('-'); return `${d}/${m}/${y}`; };

const DAY_NAMES_DOW = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
const BLUE = 'FF2E75B6';
const WHITE = 'FFFFFFFF';
const DARK_HEADER = 'FF1F3A4A';
const GREY_TEXT = 'FF9CA3AF';
const TOTAL_BG = 'FFEBF2FA';
const AMBER_BG = 'FFFCD34D';
const AMBER_TEXT = 'FF78350F';

// Build the date range + per-day buckets.
// Uses date_from/date_to (YYYY-MM-DD, Argentina) if both provided,
// otherwise defaults to the rolling last 7 days ending today.
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

    // 00:00 ART of fromStr == 03:00 UTC
    const rangeStartUTC = new Date(fromStr + 'T03:00:00.000Z');
    const rangeEndUTC = new Date(toStr + 'T03:00:00.000Z');
    rangeEndUTC.setUTCDate(rangeEndUTC.getUTCDate() + 1);
    rangeEndUTC.setUTCMilliseconds(-1); // 23:59:59.999 ART of toStr

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
            label: `${DAY_NAMES_DOW[a.getUTCDay()]}  ${dd}/${mm}/${a.getUTCFullYear()}`,
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

        // --- Fetch supervisor name ---
        const { data: supData } = await supabase
            .from('supervisors')
            .select('app_users(name, surname)')
            .eq('id', supervisorId)
            .single();

        const supName = supData?.app_users?.name || 'Supervisor';
        const supSurname = supData?.app_users?.surname || '';
        const supervisorFullName = supSurname ? `${supSurname}, ${supName}` : supName;

        // --- Fetch logs ---
        const { data, error } = await supabase
            .from('supervisor_presentismo_logs')
            .select('event_type, occurred_at, service_id, event_lat, event_lng, services:service_id(name, lat, lng)')
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
            // Distancia de cada evento (ingreso y salida) a su servicio.
            dist: checkinDistance(l.event_lat, l.event_lng, l.services?.lat, l.services?.lng),
        }));

        // --- Pair ingreso + salida into visits (track unclosed) ---
        const openIngresos = {};
        const visits = [];

        for (const event of logs) {
            if (event.event_type === 'ingreso') {
                if (openIngresos[event.service_id]) {
                    const prev = openIngresos[event.service_id];
                    visits.push({ service_id: prev.service_id, service_name: prev.service_name, ingreso: prev.occurred_at, egreso: null, durationMs: 0, ongoing: true, ingresoDist: prev.dist, salidaDist: null });
                }
                openIngresos[event.service_id] = event;
            } else if (event.event_type === 'salida') {
                const ingreso = openIngresos[event.service_id];
                if (ingreso) {
                    visits.push({ service_id: event.service_id, service_name: event.service_name, ingreso: ingreso.occurred_at, egreso: event.occurred_at, durationMs: event.occurred_at - ingreso.occurred_at, ongoing: false, ingresoDist: ingreso.dist, salidaDist: event.dist });
                    delete openIngresos[event.service_id];
                }
            }
        }
        for (const sid in openIngresos) {
            const ing = openIngresos[sid];
            visits.push({ service_id: ing.service_id, service_name: ing.service_name, ingreso: ing.occurred_at, egreso: null, durationMs: 0, ongoing: true, ingresoDist: ing.dist, salidaDist: null });
        }

        // --- Aggregate per day per service ---
        const byDay = new Map();
        for (const v of visits) {
            const ds = argDateStr(v.ingreso);
            if (!byDay.has(ds)) byDay.set(ds, new Map());
            const svcMap = byDay.get(ds);
            if (!svcMap.has(v.service_id)) {
                svcMap.set(v.service_id, { service_name: v.service_name, totalMs: 0, firstIngreso: v.ingreso, lastEgreso: v.egreso, ongoing: false, anyMeasured: false, anyFar: false, maxFarMeters: 0 });
            }
            const agg = svcMap.get(v.service_id);
            agg.totalMs += v.durationMs;
            if (v.ingreso < agg.firstIngreso) agg.firstIngreso = v.ingreso;
            if (v.egreso && (!agg.lastEgreso || v.egreso > agg.lastEgreso)) agg.lastEgreso = v.egreso;
            if (v.ongoing) agg.ongoing = true;
            for (const d of [v.ingresoDist, v.salidaDist]) {
                if (d) {
                    agg.anyMeasured = true;
                    if (d.far) {
                        agg.anyFar = true;
                        agg.maxFarMeters = Math.max(agg.maxFarMeters, d.meters);
                    }
                }
            }
        }

        // --- Build Excel ---
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Informe de Fichada');

        sheet.columns = [
            { width: 52 },
            { width: 16 },
            { width: 16 },
            { width: 14 },
        ];

        const styleCell = (cell, opts = {}) => {
            if (opts.bold || opts.size || opts.color || opts.italic) {
                cell.font = { bold: opts.bold, italic: opts.italic, size: opts.size, color: opts.color ? { argb: opts.color } : undefined };
            }
            if (opts.bg) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } };
            }
            if (opts.align) {
                cell.alignment = { horizontal: opts.align, vertical: 'middle', wrapText: false };
            }
        };

        // Row 1: Title
        sheet.addRow([`INFORME DE FICHADA  —  ${supervisorFullName.toUpperCase()}  |  ${fmtYMD(fromStr)} al ${fmtYMD(toStr)}`]);
        sheet.mergeCells('A1:D1');
        styleCell(sheet.getCell('A1'), { bold: true, size: 12, align: 'center' });
        sheet.getRow(1).height = 24;

        // Row 2: Column headers
        const headers = ['SERVICIO', 'HORA INGRESO', 'HORA EGRESO', 'DURACIÓN'];
        sheet.addRow(headers);
        headers.forEach((_, i) => styleCell(sheet.getCell(2, i + 1), { bold: true, color: WHITE, bg: DARK_HEADER, align: 'center' }));
        sheet.getRow(2).height = 18;

        let totalRangeMs = 0;

        for (const day of days) {
            // Day header (blue, merged)
            sheet.addRow([day.label]);
            const dayRowNum = sheet.rowCount;
            sheet.mergeCells(`A${dayRowNum}:D${dayRowNum}`);
            styleCell(sheet.getCell(`A${dayRowNum}`), { bold: true, size: 11, color: WHITE, bg: BLUE, align: 'center' });
            sheet.getRow(dayRowNum).height = 20;

            const svcMap = byDay.get(day.dateStr);
            let dayTotalMs = 0;

            if (!svcMap || svcMap.size === 0) {
                sheet.addRow(['Sin actividad']);
                const r = sheet.rowCount;
                sheet.mergeCells(`A${r}:D${r}`);
                styleCell(sheet.getCell(`A${r}`), { italic: true, color: GREY_TEXT, align: 'center' });
            } else {
                const aggs = Array.from(svcMap.values()).sort((a, b) => a.firstIngreso - b.firstIngreso);
                for (const agg of aggs) {
                    dayTotalMs += agg.totalMs;
                    const egresoTxt = agg.lastEgreso ? formatArgTime(agg.lastEgreso) : '—';
                    const durTxt = (agg.ongoing && agg.totalMs === 0) ? 'En curso' : formatDuration(agg.totalMs);
                    const nameTxt = agg.anyFar
                        ? `${agg.service_name}  (lejos ${Math.round(agg.maxFarMeters)} m)`
                        : agg.service_name;
                    const row = sheet.addRow([nameTxt, formatArgTime(agg.firstIngreso), egresoTxt, durTxt]);
                    row.getCell(2).alignment = { horizontal: 'center' };
                    row.getCell(3).alignment = { horizontal: 'center' };
                    row.getCell(4).alignment = { horizontal: 'center' };
                    if (agg.anyFar) styleCell(row.getCell(1), { bold: true, color: AMBER_TEXT, bg: AMBER_BG });
                }
            }

            totalRangeMs += dayTotalMs;

            // Total del día
            sheet.addRow(['', '', 'TOTAL DEL DÍA:', formatDuration(dayTotalMs)]);
            const totalRowNum = sheet.rowCount;
            styleCell(sheet.getCell(totalRowNum, 3), { bold: true, bg: TOTAL_BG, align: 'right' });
            styleCell(sheet.getCell(totalRowNum, 4), { bold: true, bg: TOTAL_BG, align: 'center' });

            sheet.addRow([]);
        }

        // Total general
        sheet.addRow(['', '', 'TOTAL GENERAL DE HORAS:', formatDuration(totalRangeMs)]);
        const grandRowNum = sheet.rowCount;
        styleCell(sheet.getCell(grandRowNum, 3), { bold: true, size: 12, color: WHITE, bg: DARK_HEADER, align: 'right' });
        styleCell(sheet.getCell(grandRowNum, 4), { bold: true, size: 12, color: WHITE, bg: DARK_HEADER, align: 'center' });

        // Output
        const buffer = await workbook.xlsx.writeBuffer();
        const safeName = supervisorFullName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, '_');
        const filename = `Informe_Fichada_${safeName}_${fromStr}_a_${toStr}.xlsx`;

        return new Response(buffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (err) {
        console.error('Error generando Excel:', err);
        return Response.json({ error: String(err?.message || err) }, { status: 500 });
    }
}
