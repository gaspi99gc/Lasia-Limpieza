import { supabase } from '@/lib/db';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export const runtime = 'nodejs';

const toArg = (date) => new Date(date.getTime() - 3 * 60 * 60 * 1000);

const formatArgDate = (date) => {
    const a = toArg(date);
    return `${String(a.getUTCDate()).padStart(2, '0')}/${String(a.getUTCMonth() + 1).padStart(2, '0')}/${a.getUTCFullYear()}`;
};

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

const DAY_NAMES = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const supervisorId = searchParams.get('supervisor_id');

        if (!supervisorId) {
            return Response.json({ error: 'supervisor_id es requerido' }, { status: 400 });
        }

        // Previous week calculation (Argentina time, Mon–Sun)
        const now = new Date();
        const argNow = toArg(now);
        const argDow = argNow.getUTCDay();
        const daysSinceMonday = argDow === 0 ? 6 : argDow - 1;

        const currentMondayUTC = new Date(argNow);
        currentMondayUTC.setUTCDate(argNow.getUTCDate() - daysSinceMonday);
        currentMondayUTC.setUTCHours(3, 0, 0, 0);

        const weekStart = new Date(currentMondayUTC);
        weekStart.setUTCDate(currentMondayUTC.getUTCDate() - 7);

        const weekEnd = new Date(currentMondayUTC);
        weekEnd.setUTCMilliseconds(-1);

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
            .select('event_type, occurred_at, service_id, services:service_id(name)')
            .eq('supervisor_id', supervisorId)
            .gte('occurred_at', weekStart.toISOString())
            .lte('occurred_at', weekEnd.toISOString())
            .order('occurred_at', { ascending: true });

        if (error) throw error;

        const logs = (data || []).map(l => ({
            event_type: l.event_type,
            occurred_at: new Date(l.occurred_at),
            service_id: l.service_id,
            service_name: l.services?.name || 'Sin servicio',
        }));

        // Pair ingreso + salida into visits
        const openIngresos = {};
        const visits = [];

        for (const event of logs) {
            if (event.event_type === 'ingreso') {
                openIngresos[event.service_id] = event;
            } else if (event.event_type === 'salida' && openIngresos[event.service_id]) {
                const ingreso = openIngresos[event.service_id];
                visits.push({
                    service_name: event.service_name,
                    ingreso: ingreso.occurred_at,
                    egreso: event.occurred_at,
                    durationMs: event.occurred_at - ingreso.occurred_at,
                });
                delete openIngresos[event.service_id];
            }
        }

        visits.sort((a, b) => a.ingreso - b.ingreso);

        // Group by day index (0=Mon … 6=Sun)
        const visitsByDay = Array.from({ length: 7 }, () => []);
        for (const visit of visits) {
            const dow = toArg(visit.ingreso).getUTCDay();
            const dayIdx = dow === 0 ? 6 : dow - 1;
            visitsByDay[dayIdx].push(visit);
        }

        // Build table rows
        const bodyRows = [];
        const rowTypes = [];
        let totalWeekMs = 0;

        for (let d = 0; d < 7; d++) {
            const dayUTC = new Date(weekStart);
            dayUTC.setUTCDate(weekStart.getUTCDate() + d);
            const dayLabel = `${DAY_NAMES[d]}  ${formatArgDate(dayUTC)}`;

            bodyRows.push([dayLabel, '', '', '', '']);
            rowTypes.push('day-header');

            const dayVisits = visitsByDay[d];
            let dayTotalMs = 0;

            if (dayVisits.length === 0) {
                bodyRows.push(['Sin fichadas', '', '', '', '']);
                rowTypes.push('empty');
            } else {
                for (const visit of dayVisits) {
                    dayTotalMs += visit.durationMs;
                    bodyRows.push([
                        formatArgDate(visit.ingreso),
                        visit.service_name,
                        formatArgTime(visit.ingreso),
                        formatArgTime(visit.egreso),
                        formatDuration(visit.durationMs),
                    ]);
                    rowTypes.push('data');
                }
            }

            totalWeekMs += dayTotalMs;

            bodyRows.push(['', '', '', 'TOTAL DEL DÍA:', formatDuration(dayTotalMs)]);
            rowTypes.push('total');
        }

        bodyRows.push(['', '', '', 'TOTAL GENERAL DE HORAS:', formatDuration(totalWeekMs)]);
        rowTypes.push('grand-total');

        // Generate PDF
        const weekStartLabel = formatArgDate(weekStart);
        const weekEndLabel = formatArgDate(weekEnd);

        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('REPORTE SEMANAL', 40, 50);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Supervisor: ${supervisorFullName}`, 40, 70);
        doc.text(`Período: ${weekStartLabel} al ${weekEndLabel}`, 40, 86);

        autoTable(doc, {
            startY: 110,
            head: [['FECHA', 'SERVICIO', 'HORA INGRESO', 'HORA EGRESO', 'DURACIÓN']],
            body: bodyRows,
            styles: { font: 'helvetica', fontSize: 9, cellPadding: 5 },
            headStyles: { fillColor: [31, 58, 74], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
            columnStyles: {
                0: { cellWidth: 80 },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 75, halign: 'center' },
                3: { cellWidth: 75, halign: 'center' },
                4: { cellWidth: 65, halign: 'center' },
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
                    data.cell.styles.textColor = [160, 160, 160];
                    data.cell.styles.fontStyle = 'italic';
                    data.cell.styles.halign = 'center';
                } else if (rowType === 'total') {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [235, 242, 250];
                    if (data.column.index === 3) data.cell.styles.halign = 'right';
                    if (data.column.index === 4) data.cell.styles.halign = 'center';
                } else if (rowType === 'grand-total') {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fontSize = 10;
                    data.cell.styles.fillColor = [31, 58, 74];
                    data.cell.styles.textColor = [255, 255, 255];
                    if (data.column.index === 3) data.cell.styles.halign = 'right';
                    if (data.column.index === 4) data.cell.styles.halign = 'center';
                }
            },
        });

        const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
        const safeName = supervisorFullName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, '_');
        const filename = `Reporte_Semanal_${safeName}_${weekStartLabel.replace(/\//g, '-')}.pdf`;

        return new Response(pdfBuffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (err) {
        console.error('Error generando PDF semanal:', err);
        return Response.json({ error: String(err?.message || err) }, { status: 500 });
    }
}
