import { supabase } from '@/lib/db';
import { formatArgentinaDateTime, getArgentinaDateStamp } from '@/lib/datetime';
import { checkinDistance } from '@/lib/geo';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export const runtime = 'nodejs';

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const supervisorId = searchParams.get('supervisor_id');
        const days = Number(searchParams.get('days')) || 7;

        if (!supervisorId) {
            return Response.json({ error: 'supervisor_id es requerido' }, { status: 400 });
        }

        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const { data, error } = await supabase
            .from('supervisor_presentismo_logs')
            .select('id, event_type, occurred_at, event_lat, event_lng, services:service_id(name, address, lat, lng), supervisors:supervisor_id(id, app_users(name, surname, username))')
            .eq('supervisor_id', supervisorId)
            .gte('occurred_at', cutoff.toISOString())
            .order('occurred_at', { ascending: false });

        if (error) throw error;

        const logs = (data || []).map(pl => {
            let ubicacion = '-';
            if (pl.event_type === 'ingreso') {
                const d = checkinDistance(pl.event_lat, pl.event_lng, pl.services?.lat, pl.services?.lng);
                if (d) ubicacion = d.far ? `LEJOS (${Math.round(d.meters)} m)` : 'En el servicio';
                else ubicacion = 'Sin ubicacion';
            }
            return {
                occurred_at: pl.occurred_at,
                event_type: pl.event_type,
                service_name: pl.services?.name || 'Sin servicio',
                service_address: pl.services?.address || 'Sin direccion cargada',
                supervisor_name: pl.supervisors?.app_users?.name || '',
                supervisor_surname: pl.supervisors?.app_users?.surname || '',
                supervisor_dni: pl.supervisors?.app_users?.username || '',
                ubicacion,
            };
        });

        if (logs.length === 0) {
            return Response.json({ error: 'Sin registros en los ultimos 7 dias' }, { status: 404 });
        }

        const supervisorFullName = logs[0].supervisor_surname
            ? `${logs[0].supervisor_surname}, ${logs[0].supervisor_name}`
            : 'Supervisor';
        const supervisorDni = logs[0].supervisor_dni;
        const generatedAt = formatArgentinaDateTime(new Date());
        const dateStamp = getArgentinaDateStamp();

        const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('Presentismo - Ultimos 7 dias', 40, 60);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Supervisor: ${supervisorFullName}`, 40, 82);
        doc.text(`DNI: ${supervisorDni}`, 40, 98);
        doc.text(`Generado: ${generatedAt}`, 40, 114);

        autoTable(doc, {
            startY: 136,
            head: [['Fecha y hora', 'Supervisor', 'DNI', 'Servicio', 'Direccion', 'Evento', 'Ubicacion']],
            body: logs.map(log => [
                formatArgentinaDateTime(log.occurred_at),
                `${log.supervisor_surname}, ${log.supervisor_name}`,
                log.supervisor_dni,
                log.service_name,
                log.service_address,
                log.event_type === 'ingreso' ? 'Ingreso' : 'Salida',
                log.ubicacion,
            ]),
            styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, overflow: 'linebreak' },
            headStyles: { fillColor: [31, 58, 74], textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { cellWidth: 105 },
                1: { cellWidth: 105 },
                2: { cellWidth: 65 },
                3: { cellWidth: 105 },
                4: { cellWidth: 150 },
                5: { cellWidth: 60 },
                6: { cellWidth: 95 },
            },
            margin: { left: 40, right: 40, bottom: 40 },
            didParseCell: (d) => {
                if (d.section === 'body' && d.column.index === 6 && String(d.cell.raw).startsWith('LEJOS')) {
                    d.cell.styles.textColor = [255, 255, 255];
                    d.cell.styles.fillColor = [220, 38, 38];
                    d.cell.styles.fontStyle = 'bold';
                }
            },
        });

        const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
        const safeName = supervisorFullName.replace(/[^a-zA-Z0-9_-]+/g, '_');
        const filename = `Presentismo_${safeName}_ultimos_7_dias_${dateStamp}.pdf`;

        return new Response(pdfBuffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (err) {
        console.error('Error generando PDF de presentismo:', err);
        return Response.json({ error: String(err?.message || err) }, { status: 500 });
    }
}
