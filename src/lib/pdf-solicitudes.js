// PDF simple de las Solicitudes de Personal, para que RRHH las tenga en papel
// (pedido del usuario 2026-11-26: "mucho más simple"). Una tabla: servicio,
// qué se pide, para cuándo y comentarios. Baja lo que se ve con el filtro.
//
// armarPdfSolicitudes recibe jsPDF y autoTable para poder probarlo con
// `npm test`; descargarPdfSolicitudes los carga recién al tocar el botón.
import { filasPdf, tituloPdf } from './solicitud-personal.js';

const TEXTO = [45, 55, 72];

export function armarPdfSolicitudes(JsPDF, autoTable, { filas, titulo }) {
    const doc = new JsPDF({ unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...TEXTO);
    doc.text(titulo, 14, 16);
    autoTable(doc, {
        startY: 21,
        margin: { left: 14, right: 14 },
        head: [['Servicio', 'Qué se pide', 'Para cuándo', 'Comentarios']],
        body: filas,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2, textColor: TEXTO, lineColor: [210, 214, 220], lineWidth: 0.2, valign: 'top' },
        headStyles: { fillColor: [237, 240, 244], textColor: TEXTO, fontStyle: 'bold' },
        bodyStyles: { fillColor: [255, 255, 255] },
        columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' }, 1: { cellWidth: 44 }, 2: { cellWidth: 25 }, 3: { cellWidth: 'auto' } },
        didDrawPage: () => {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(113, 128, 150);
            doc.text(`Hoja ${doc.getNumberOfPages()}`, 196, 290, { align: 'right' });
        },
    });
    return doc;
}

const hoyAR = () => new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
}).format(new Date());

export async function descargarPdfSolicitudes(solicitudes, filtro) {
    const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const hoy = hoyAR();
    const doc = armarPdfSolicitudes(jsPDF, autoTable, { filas: filasPdf(solicitudes), titulo: tituloPdf(filtro, hoy) });
    doc.save(`Solicitudes de personal ${hoy.replaceAll('/', '-')}.pdf`);
}
