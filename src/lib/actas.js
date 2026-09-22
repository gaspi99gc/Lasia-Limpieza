// Actas formales de RRHH: el papel que se imprime, se firma y va al legajo físico.
//
// El informe ya cargado es el registro interno; el acta es el documento que se
// le entrega a la persona. Sale de los MISMOS datos, así que el papel siempre
// dice lo que está registrado: no se carga nada dos veces ni se pueden
// contradecir entre sí.
//
// El PDF solo se descarga. El PDF sin firmar no se guarda en ningún lado: el
// que vale es el firmado en papel, que va al legajo físico de la persona.
//
// Se generan tres tipos, que son los que se entregan en mano:
//   apercibimiento  (de las categorías 'advertencia' y 'sancion')
//   suspension      (lleva los días y el período exacto)
//   cambio_servicio (notifica el pase de un servicio a otro)
//
// 'felicitacion' e 'incidente' NO generan acta: una felicitación no se notifica
// con un descargo al pie, y un incidente es una nota interna.

// Qué categorías de informe producen acta, y con qué título.
const ACTAS = {
    advertencia: { titulo: 'ACTA DE APERCIBIMIENTO', tipo: 'apercibimiento' },
    sancion: { titulo: 'ACTA DE APERCIBIMIENTO', tipo: 'apercibimiento' },
    suspension: { titulo: 'ACTA DE SUSPENSIÓN', tipo: 'suspension' },
    cambio_servicio: { titulo: 'NOTIFICACIÓN DE CAMBIO DE SERVICIO', tipo: 'cambio_servicio' },
};

export function tieneActa(categoria) {
    return Boolean(ACTAS[categoria]);
}

export function tituloActa(categoria) {
    return ACTAS[categoria]?.titulo || null;
}

// 'YYYY-MM-DD' -> '05/09/2026'. Se parte el string en vez de usar Date: con
// new Date('2026-09-05') el navegador interpreta UTC y en Argentina muestra el
// día anterior, que en un acta con fechas de suspensión sería un error serio.
function fmtFecha(ymd) {
    if (!ymd) return '';
    const [a, m, d] = String(ymd).slice(0, 10).split('-');
    return a && m && d ? `${d}/${m}/${a}` : '';
}

// La fecha del informe viene como timestamp; el acta muestra solo el día.
function fmtFechaISO(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(d);
}

// Días corridos entre dos fechas, contando los dos extremos: del 1 al 3 son 3
// días de suspensión, no 2.
export function diasSuspension(desde, hasta) {
    if (!desde || !hasta) return 0;
    const a = new Date(`${desde}T00:00:00Z`);
    const b = new Date(`${hasta}T00:00:00Z`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
    return Math.round((b - a) / 86400000) + 1;
}

// La fecha de hoy en Argentina, en palabras: "22 de septiembre de 2026".
function hoyEnPalabras() {
    return new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date());
}

// Carga el logo como dataURL para meterlo en el PDF. Si falla, el acta se
// genera igual sin logo: no tener el membrete no puede impedir que se emita.
async function cargarLogo() {
    try {
        const res = await fetch('/branding/logo-lasia-limpieza.png');
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise((resolve) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = () => resolve(null);
            fr.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

// El cuerpo del acta según el tipo. Devuelve los párrafos como array: el
// renderizador se encarga del salto de línea y del alto de cada uno.
function cuerpoDelActa({ tipo, informe, empleado }) {
    const nombre = `${empleado?.apellido || ''}, ${empleado?.nombre || ''}`.replace(/^,\s*/, '').trim();
    const motivo = (informe.descripcion || '').trim();

    if (tipo === 'suspension') {
        const dias = diasSuspension(informe.fecha_desde, informe.fecha_hasta);
        const plural = dias === 1 ? 'día' : 'días';
        return [
            `Por medio de la presente se notifica a ${nombre} que, en razón de los hechos que se detallan a continuación, se aplica una SUSPENSIÓN de ${dias} ${plural}, a cumplirse desde el ${fmtFecha(informe.fecha_desde)} hasta el ${fmtFecha(informe.fecha_hasta)} inclusive.`,
            `Motivo: ${motivo}`,
            'Durante el período indicado la persona no deberá presentarse a prestar servicios, y el mismo no será remunerado.',
            'Se deja constancia de que la reiteración de hechos de similar naturaleza podrá dar lugar a la aplicación de sanciones de mayor gravedad.',
        ];
    }

    if (tipo === 'cambio_servicio') {
        const origen = informe.servicio_origen_nombre || 'su servicio actual';
        const destino = informe.servicio_destino_nombre || 'el nuevo servicio';
        const parrafos = [
            `Por medio de la presente se notifica a ${nombre} que, a partir de la fecha, pasará a prestar servicios en ${destino}, dejando de desempeñarse en ${origen}.`,
            'Las condiciones de trabajo, la categoría y la remuneración no sufren modificación alguna por el presente cambio.',
        ];
        // La nota es opcional; cuando el informe se guardó sin nota, el sistema
        // la completa con "Cambio de servicio: A → B", que acá sería repetir lo
        // que ya dice el primer párrafo.
        if (motivo && !/^cambio de servicio:/i.test(motivo)) {
            parrafos.splice(1, 0, `Observaciones: ${motivo}`);
        }
        return parrafos;
    }

    // Apercibimiento (advertencia y sanción).
    return [
        `Por medio de la presente se notifica a ${nombre} un APERCIBIMIENTO por los hechos que se detallan a continuación.`,
        `Motivo: ${motivo}`,
        'Se solicita adecuar la conducta a las obligaciones a su cargo. Se deja constancia de que la reiteración de hechos de similar naturaleza podrá dar lugar a la aplicación de sanciones de mayor gravedad.',
    ];
}

/**
 * Genera y descarga el acta de un informe.
 *
 * @param {object} informe   La fila de /api/employee-reports (ya trae nombre,
 *                           legajo, fechas y nombres de servicio).
 * @param {object} empleado  El legajo, para CUIL/DNI e ingreso. Opcional: si no
 *                           está, el acta sale igual con lo que trae el informe.
 */
export async function descargarActa(informe, empleado = null) {
    const def = ACTAS[informe?.categoria];
    if (!def) throw new Error('Esta categoría de informe no genera acta.');

    const [{ jsPDF }, logo] = await Promise.all([
        import('jspdf').then(m => ({ jsPDF: m.jsPDF })),
        cargarLogo(),
    ]);

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const ANCHO = 210;
    const M = 20;                 // margen lateral
    const UTIL = ANCHO - M * 2;
    let y = M;

    // --- Membrete ---
    if (logo) {
        try { doc.addImage(logo, 'PNG', M, y, 32, 12, undefined, 'FAST'); } catch { /* sigue sin logo */ }
    }
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text('LASIA LIMPIEZA', ANCHO - M, y + 5, { align: 'right' });
    doc.text(`Ciudad Autónoma de Buenos Aires, ${hoyEnPalabras()}`, ANCHO - M, y + 10, { align: 'right' });
    y += 20;

    doc.setDrawColor(200);
    doc.line(M, y, ANCHO - M, y);
    y += 12;

    // --- Título ---
    doc.setFontSize(15);
    doc.setTextColor(20);
    doc.setFont(undefined, 'bold');
    doc.text(def.titulo, ANCHO / 2, y, { align: 'center' });
    doc.setFont(undefined, 'normal');
    y += 12;

    // --- Datos de la persona ---
    const nombre = informe.empleado_nombre
        || `${empleado?.apellido || ''}, ${empleado?.nombre || ''}`.replace(/^,\s*/, '').trim();
    const datos = [
        ['Apellido y nombre', nombre || '—'],
        ['Legajo', informe.empleado_legajo || empleado?.legajo || '—'],
        ['CUIL', empleado?.cuil || empleado?.dni || '—'],
        ['Fecha de ingreso', fmtFecha(empleado?.fecha_ingreso) || '—'],
        // Es la fecha en que se REGISTRÓ el informe, no la del hecho: puede
        // haberse cargado días después. Llamarla "fecha del hecho" sería decir
        // algo falso en un papel que se firma —y en una suspensión chocaría con
        // el período, que sí es la fecha real.
        ['Informe registrado el', fmtFechaISO(informe.created_at) || '—'],
    ];

    doc.setFontSize(10);
    doc.setFillColor(246, 247, 249);
    doc.rect(M, y - 5, UTIL, datos.length * 6 + 4, 'F');
    for (const [etiqueta, valor] of datos) {
        doc.setTextColor(110);
        doc.text(`${etiqueta}:`, M + 3, y);
        doc.setTextColor(20);
        doc.text(String(valor), M + 42, y);
        y += 6;
    }
    y += 10;

    // --- Cuerpo ---
    doc.setFontSize(11);
    doc.setTextColor(20);
    for (const parrafo of cuerpoDelActa({ tipo: def.tipo, informe, empleado })) {
        const lineas = doc.splitTextToSize(parrafo, UTIL);
        // Si el párrafo no entra en lo que queda de página, se pasa a la siguiente
        // antes de escribirlo, para no partirlo al medio.
        if (y + lineas.length * 5.5 > 250) { doc.addPage(); y = M; }
        doc.text(lineas, M, y, { align: 'justify', maxWidth: UTIL });
        y += lineas.length * 5.5 + 5;
    }

    // --- Firmas ---
    // Se anclan al pie salvo que el cuerpo haya crecido tanto que las pisaría:
    // en ese caso van en una página nueva, nunca encimadas con el texto.
    let yFirmas = 232;
    if (y > yFirmas - 24) { doc.addPage(); yFirmas = 232; }

    doc.setFontSize(9);
    doc.setTextColor(90);
    const pie = 'Firma la presente en prueba de notificación. La firma acredita la recepción de este documento y no implica necesariamente conformidad con su contenido.';
    doc.text(doc.splitTextToSize(pie, UTIL), M, yFirmas - 14);

    const anchoFirma = 62;   // deja un pasillo de aire entre las dos firmas
    const izq = M;
    const der = ANCHO - M - anchoFirma;
    doc.setDrawColor(120);
    doc.line(izq, yFirmas + 14, izq + anchoFirma, yFirmas + 14);
    doc.line(der, yFirmas + 14, der + anchoFirma, yFirmas + 14);

    doc.setFontSize(8.5);
    doc.setTextColor(110);
    doc.text('Firma del trabajador', izq, yFirmas + 19);
    doc.text('Aclaración y DNI', izq, yFirmas + 24);
    doc.text('Por la Empresa', der, yFirmas + 19);
    doc.text(informe.autor ? `${informe.autor}` : 'Aclaración', der, yFirmas + 24);

    // --- Nombre del archivo ---
    const slug = (nombre || 'operario')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    const fechaArchivo = (informe.created_at || '').slice(0, 10) || 'sin-fecha';
    doc.save(`acta-${def.tipo}-${slug}-${fechaArchivo}.pdf`);
}
