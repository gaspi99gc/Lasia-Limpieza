import { supabase } from '@/lib/db';
import { checkinDistance } from '@/lib/geo';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export const runtime = 'nodejs';

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

const argDateStr = (date) => {
    const a = toArg(date);
    return `${a.getUTCFullYear()}-${String(a.getUTCMonth() + 1).padStart(2, '0')}-${String(a.getUTCDate()).padStart(2, '0')}`;
};

const fmtYMD = (ymd) => { const [y, m, d] = ymd.split('-'); return `${d}/${m}/${y}`; };

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

        // Fetch supervisor name
        const { data: supData } = await supabase
            .from('supervisors')
            .select('app_users(name, surname)')
            .eq('id', supervisorId)
            .single();

        const supName = supData?.app_users?.name || 'Supervisor';
        const supSurname = supData?.app_users?.surname || '';
        const supervisorFullName = supSurname ? `${supSurname}, ${supName}` : supName;

        // Fetch logs
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
            ingresoDist: l.event_type === 'ingreso'
                ? checkinDistance(l.event_lat, l.event_lng, l.services?.lat, l.services?.lng)
                : null,
        }));

        // Pair ingreso + salida into visits (track unclosed)
        const openIngresos = {};
        const visits = [];

        for (const event of logs) {
            if (event.event_type === 'ingreso') {
                if (openIngresos[event.service_id]) {
                    const prev = openIngresos[event.service_id];
                    visits.push({ service_id: prev.service_id, service_name: prev.service_name, ingreso: prev.occurred_at, egreso: null, durationMs: 0, ongoing: true, ingresoDist: prev.ingresoDist });
                }
                openIngresos[event.service_id] = event;
            } else if (event.event_type === 'salida') {
                const ingreso = openIngresos[event.service_id];
                if (ingreso) {
                    visits.push({ service_id: event.service_id, service_name: event.service_name, ingreso: ingreso.occurred_at, egreso: event.occurred_at, durationMs: event.occurred_at - ingreso.occurred_at, ongoing: false, ingresoDist: ingreso.ingresoDist });
                    delete openIngresos[event.service_id];
                }
            }
        }
        for (const sid in openIngresos) {
            const ing = openIngresos[sid];
            visits.push({ service_id: ing.service_id, service_name: ing.service_name, ingreso: ing.occurred_at, egreso: null, durationMs: 0, ongoing: true, ingresoDist: ing.ingresoDist });
        }

        // Aggregate per day per service
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
            if (v.ingresoDist) {
                agg.anyMeasured = true;
                if (v.ingresoDist.far) {
                    agg.anyFar = true;
                    agg.maxFarMeters = Math.max(agg.maxFarMeters, v.ingresoDist.meters);
                }
            }
        }

        // Build table rows
        const bodyRows = [];
        const rowTypes = [];
        const rowUbic = []; // '' | 'far' | 'none' — parallel to bodyRows, only meaningful on data rows
        let totalRangeMs = 0;

        for (const day of days) {
            bodyRows.push([day.label, '', '', '', '']);
            rowTypes.push('day-header');
            rowUbic.push('');

            const svcMap = byDay.get(day.dateStr);
            let dayTotalMs = 0;

            if (!svcMap || svcMap.size === 0) {
                bodyRows.push(['Sin actividad', '', '', '', '']);
                rowTypes.push('empty');
                rowUbic.push('');
            } else {
                const aggs = Array.from(svcMap.values()).sort((a, b) => a.firstIngreso - b.firstIngreso);
                for (const agg of aggs) {
                    dayTotalMs += agg.totalMs;
                    const egresoTxt = agg.lastEgreso ? formatArgTime(agg.lastEgreso) : '—';
                    const durTxt = (agg.ongoing && agg.totalMs === 0) ? 'En curso' : formatDuration(agg.totalMs);
                    const ubicTxt = agg.anyFar
                        ? `LEJOS (max ${Math.round(agg.maxFarMeters)} m)`
                        : agg.anyMeasured ? 'En el servicio' : 'Sin ubicacion';
                    bodyRows.push([agg.service_name, formatArgTime(agg.firstIngreso), egresoTxt, durTxt, ubicTxt]);
                    rowTypes.push('data');
                    rowUbic.push(agg.anyFar ? 'far' : agg.anyMeasured ? '' : 'none');
                }
            }

            totalRangeMs += dayTotalMs;

            bodyRows.push(['', '', 'TOTAL DEL DÍA:', formatDuration(dayTotalMs), '']);
            rowTypes.push('total');
            rowUbic.push('');
        }

        bodyRows.push(['', '', 'TOTAL GENERAL DE HORAS:', formatDuration(totalRangeMs), '']);
        rowTypes.push('grand-total');
        rowUbic.push('');

        // Generate PDF
        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('INFORME DE FICHADA', 40, 50);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Supervisor: ${supervisorFullName}`, 40, 70);
        doc.text(`Período: ${fmtYMD(fromStr)} al ${fmtYMD(toStr)}`, 40, 86);

        autoTable(doc, {
            startY: 110,
            head: [['SERVICIO', 'INGRESO', 'EGRESO', 'DURACIÓN', 'UBICACIÓN']],
            body: bodyRows,
            styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
            headStyles: { fillColor: [31, 58, 74], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
            columnStyles: {
                0: { cellWidth: 'auto' },
                1: { cellWidth: 58, halign: 'center' },
                2: { cellWidth: 58, halign: 'center' },
                3: { cellWidth: 52, halign: 'center' },
                4: { cellWidth: 108, halign: 'center' },
            },
            margin: { left: 40, right: 40, bottom: 40 },
            didParseCell: (data) => {
                if (data.section !== 'body') return;
                const rowType = rowTypes[data.row.index];

                if (rowType === 'day-header') {
                    data.cell.styles.fillColor = [46, 117, 182];
                    data.cell.styles.textColor = [255, 255, 255];
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.halign = 'center';
                    data.cell.styles.fontSize = 10;
                } else if (rowType === 'empty') {
                    data.cell.styles.textColor = [156, 163, 175];
                    data.cell.styles.fontStyle = 'italic';
                    data.cell.styles.halign = 'center';
                } else if (rowType === 'total') {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [235, 242, 250];
                    if (data.column.index === 2) data.cell.styles.halign = 'right';
                    if (data.column.index === 3) data.cell.styles.halign = 'center';
                } else if (rowType === 'grand-total') {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fontSize = 10;
                    data.cell.styles.fillColor = [31, 58, 74];
                    data.cell.styles.textColor = [255, 255, 255];
                    if (data.column.index === 2) data.cell.styles.halign = 'right';
                    if (data.column.index === 3) data.cell.styles.halign = 'center';
                } else if (rowType === 'data' && data.column.index === 4 && rowUbic[data.row.index] === 'far') {
                    data.cell.styles.fillColor = [220, 38, 38];
                    data.cell.styles.textColor = [255, 255, 255];
                    data.cell.styles.fontStyle = 'bold';
                }
            },
        });

        const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
        const safeName = supervisorFullName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, '_');
        const filename = `Informe_Fichada_${safeName}_${fromStr}_a_${toStr}.pdf`;

        return new Response(pdfBuffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (err) {
        console.error('Error generando PDF:', err);
        return Response.json({ error: String(err?.message || err) }, { status: 500 });
    }
}
