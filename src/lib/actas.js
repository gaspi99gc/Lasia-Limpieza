// Actas formales de RRHH: el papel que se imprime, se firma y va al legajo físico.
//
// El texto NO se inventa acá: sale de los modelos en Word que RRHH ya usa
// (APERCIBIMIENTO MODELO.docx y los que sigan). Lo único que cambia de un acta
// a otra es lo que estaba resaltado en amarillo en esos modelos: la fecha, el
// nombre y DNI de la persona, y el motivo. Todo lo demás —incluida la dirección,
// que es la de la EMPRESA y no la del operario— es fijo.
//
// El acta sale de los MISMOS datos del informe ya cargado, así que el papel
// siempre dice lo que está registrado. Solo se descarga: el PDF sin firmar no se
// guarda en ningún lado porque el que vale es el firmado en papel, que va al
// legajo físico de la persona.

// Quién firma por la empresa. Es siempre el gerente de RRHH, así que va fijo;
// el día que cambie se toca acá y listo.
const FIRMANTE = {
    nombre: 'TORRES LUCAS',
    dni: '34019231',
    cargo: 'gerente de RRHH',
};

const EMPRESA = {
    razonSocial: 'LASIA Servicios SRL',
    domicilio: 'Avenida Federico Lacroze 2252, 9 piso, depto. A, de esta ciudad de Buenos Aires',
    pie: 'LASIA SERVICIOS S.R.L / AV. FEDERICO LACROZE 2252 9º A - C.A.B.A / INFO@LASIA.COM.AR / Tel 4771-0481',
};

// Qué categorías de informe producen acta.
//
// 'felicitacion' e 'incidente' NO generan: una felicitación no se notifica con
// una firma al pie y un incidente es una nota interna.
//
// Por ahora solo está el modelo de apercibimiento. Suspensión y cambio de
// servicio quedan preparados pero deshabilitados hasta tener sus Word: emitir
// un acta con texto inventado es peor que no emitirla.
const ACTAS = {
    advertencia: { titulo: 'ACTA DE NOTIFICACIÓN DE APERCIBIMIENTO', tipo: 'apercibimiento', listo: true },
    sancion: { titulo: 'ACTA DE NOTIFICACIÓN DE APERCIBIMIENTO', tipo: 'apercibimiento', listo: true },
    suspension: { titulo: 'ACTA DE NOTIFICACIÓN DE SUSPENSIÓN', tipo: 'suspension', listo: false },
    cambio_servicio: { titulo: 'NOTIFICACIÓN DE CAMBIO DE SERVICIO', tipo: 'cambio_servicio', listo: false },
};

export function tieneActa(categoria) {
    return Boolean(ACTAS[categoria]?.listo);
}

export function tituloActa(categoria) {
    return ACTAS[categoria]?.titulo || null;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// 'YYYY-MM-DD' -> '05/09/2026'. Se parte el string en vez de usar Date: con
// new Date('2026-09-05') el navegador interpreta UTC y en Argentina muestra el
// día anterior.
function fmtFecha(ymd) {
    if (!ymd) return '';
    const [a, m, d] = String(ymd).slice(0, 10).split('-');
    return a && m && d ? `${d}/${m}/${a}` : '';
}

// La fecha en el formato del modelo: "a los 03 días del mes de septiembre del
// año 2026". Es la fecha en que se LABRA el acta (hoy), no la del informe: el
// acta se firma el día que la persona viene a la oficina.
function fechaEnPalabras(fecha = new Date()) {
    const partes = new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit', month: 'numeric', year: 'numeric',
    }).formatToParts(fecha);
    const val = (t) => partes.find(p => p.type === t)?.value || '';
    return {
        dia: val('day'),
        mes: MESES[Number(val('month')) - 1] || '',
        anio: val('year'),
    };
}

// Días corridos entre dos fechas contando los dos extremos: del 1 al 3 son 3.
export function diasSuspension(desde, hasta) {
    if (!desde || !hasta) return 0;
    const a = new Date(`${desde}T00:00:00Z`);
    const b = new Date(`${hasta}T00:00:00Z`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
    return Math.round((b - a) / 86400000) + 1;
}

// Carga una imagen del sitio como dataURL para meterla en el PDF. Si falla, el
// acta se genera igual sin ella: no tener el membrete no puede impedir que se
// emita el documento.
async function cargarImagen(ruta) {
    try {
        const res = await fetch(ruta);
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

// El nombre como lo espera el acta: "NIZ FLORENCIA NOEMI", sin coma.
function nombreParaActa(informe, empleado) {
    if (empleado?.apellido || empleado?.nombre) {
        return `${empleado.apellido || ''} ${empleado.nombre || ''}`.replace(/\s+/g, ' ').trim().toUpperCase();
    }
    // El informe lo trae como "APELLIDO, NOMBRE".
    return (informe.empleado_nombre || '').replace(/,/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

// El cuerpo del acta, calcado del modelo en Word. Devuelve trozos con su
// formato: los datos variables van en negrita para que se vean de un vistazo al
// controlar el papel antes de firmarlo.
function cuerpoDelActa({ tipo, informe, empleado, motivo }) {
    const nombre = nombreParaActa(informe, empleado);
    const dni = empleado?.dni || empleado?.cuil || '—';
    const { dia, mes, anio } = fechaEnPalabras();

    if (tipo === 'apercibimiento') {
        return [
            [
                { t: 'En la Ciudad Autónoma de Buenos Aires a los ' },
                { t: dia, b: true },
                { t: ' días del mes de ' },
                { t: mes, b: true },
                { t: ' del año ' },
                { t: anio, b: true },
                { t: `, ${FIRMANTE.nombre}, titular de DNI ${FIRMANTE.dni} en representación de ${EMPRESA.razonSocial} como ${FIRMANTE.cargo} hallándose constituida en la sede de la empresa, ${EMPRESA.domicilio}, oficina de Recursos Humanos a los fines de notificar a el/la señor/a ` },
                { t: nombre, b: true },
                { t: ' con DNI ' },
                { t: String(dni), b: true },
                { t: ' en su carácter de trabajador/a dependiente de esta empresa, un apercibimiento por ' },
                { t: motivo, b: true },
                { t: '. Se le hace saber asimismo que la reiteración de conductas similares dará motivo a sanciones con mayor severidad.' },
            ],
            [
                { t: 'Seguidamente el/la señor/a ' },
                { t: nombre, b: true },
                { t: ' se notifica del apercibimiento impuesto, se labra la presente, que es leída y ratificada al pie de los actuantes.' },
            ],
        ];
    }

    throw new Error('Todavía no está cargado el modelo de esta acta.');
}

/**
 * Genera y descarga el acta de un informe.
 *
 * @param {object} informe   La fila de /api/employee-reports.
 * @param {object} empleado  El legajo, para DNI. Opcional.
 * @param {string} motivo    El texto del motivo. Por defecto el del informe,
 *                           pero la pantalla deja corregirlo antes de imprimir.
 */
export async function descargarActa(informe, empleado = null, motivo = null) {
    const def = ACTAS[informe?.categoria];
    if (!def?.listo) throw new Error('Todavía no está cargado el modelo de esta acta.');

    const textoMotivo = (motivo ?? informe.descripcion ?? '').trim();
    if (!textoMotivo) throw new Error('El acta necesita un motivo.');

    const [{ jsPDF }, membrete, iso] = await Promise.all([
        import('jspdf').then(m => ({ jsPDF: m.jsPDF })),
        cargarImagen('/branding/membrete-lasia.png'),
        cargarImagen('/branding/iso-9001.jpg'),
    ]);

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const ANCHO = 210;
    const ALTO = 297;
    const M = 25;
    const UTIL = ANCHO - M * 2;
    let y = 18;

    // --- Membrete (logo a la izquierda, sello ISO a la derecha) ---
    if (membrete) {
        try { doc.addImage(membrete, 'PNG', M, y, 48, 13, undefined, 'FAST'); } catch { /* sin logo */ }
    }
    if (iso) {
        try { doc.addImage(iso, 'JPEG', ANCHO - M - 30, y, 30, 11, undefined, 'FAST'); } catch { /* sin sello */ }
    }
    y += 26;

    // --- Título ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(20);
    doc.text(def.titulo, ANCHO / 2, y, { align: 'center' });
    y += 14;

    // --- Cuerpo ---
    // Se escribe palabra por palabra para poder alternar negrita en el medio de
    // un párrafo (jsPDF no tiene texto enriquecido). El justificado se hace a
    // mano: se reparte el sobrante entre los espacios de cada línea, salvo en la
    // última de cada párrafo, que va suelta.
    const TAM = 11;
    const INTERLINEA = 6.2;
    doc.setFontSize(TAM);

    const escribirParrafo = (trozos) => {
        // Cada palabra arrastra su formato.
        const palabras = [];
        for (const trozo of trozos) {
            const partes = String(trozo.t).split(/(\s+)/).filter(s => s !== '');
            for (const p of partes) {
                if (/^\s+$/.test(p)) continue;
                palabras.push({ txt: p, b: Boolean(trozo.b) });
            }
        }

        const anchoDe = (p) => {
            doc.setFont('helvetica', p.b ? 'bold' : 'normal');
            return doc.getTextWidth(p.txt);
        };
        const anchoEspacio = () => { doc.setFont('helvetica', 'normal'); return doc.getTextWidth(' '); };

        // Agrupar en líneas que entren en el ancho útil.
        const lineas = [];
        let actual = [];
        let ancho = 0;
        for (const p of palabras) {
            const w = anchoDe(p);
            const sumando = actual.length ? ancho + anchoEspacio() + w : w;
            if (actual.length && sumando > UTIL) {
                lineas.push({ palabras: actual, ancho });
                actual = [p];
                ancho = w;
            } else {
                actual.push(p);
                ancho = sumando;
            }
        }
        if (actual.length) lineas.push({ palabras: actual, ancho, ultima: true });

        for (const linea of lineas) {
            if (y + INTERLINEA > ALTO - 60) { doc.addPage(); y = M; }
            const huecos = linea.palabras.length - 1;
            // Justificado: el sobrante se reparte entre los espacios. La última
            // línea del párrafo no se estira (quedaría con huecos enormes).
            const extra = (!linea.ultima && huecos > 0) ? (UTIL - linea.ancho) / huecos : 0;
            let x = M;
            for (let i = 0; i < linea.palabras.length; i++) {
                const p = linea.palabras[i];
                doc.setFont('helvetica', p.b ? 'bold' : 'normal');
                doc.text(p.txt, x, y);
                x += doc.getTextWidth(p.txt);
                if (i < huecos) { doc.setFont('helvetica', 'normal'); x += doc.getTextWidth(' ') + extra; }
            }
            y += INTERLINEA;
        }
        y += 5;
    };

    for (const parrafo of cuerpoDelActa({ tipo: def.tipo, informe, empleado, motivo: textoMotivo })) {
        escribirParrafo(parrafo);
    }

    // --- Firma ---
    // Los tres renglones del modelo. Se anclan al pie salvo que el cuerpo haya
    // crecido tanto que los pisaría.
    let yFirma = Math.max(y + 12, ALTO - 78);
    if (yFirma > ALTO - 50) { doc.addPage(); yFirma = ALTO - 78; }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(TAM);
    doc.setTextColor(20);
    for (const etiqueta of ['Firma:', 'Aclaración:', 'DNI:']) {
        doc.text(etiqueta, M, yFirma);
        doc.setDrawColor(150);
        doc.line(M + 24, yFirma + 1, M + 110, yFirma + 1);
        yFirma += 12;
    }

    // --- Pie ---
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text(doc.splitTextToSize(EMPRESA.pie, UTIL), ANCHO / 2, ALTO - 14, { align: 'center' });

    // --- Nombre del archivo ---
    const slug = nombreParaActa(informe, empleado)
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    const hoy = new Date().toISOString().slice(0, 10);
    doc.save(`acta-${def.tipo}-${slug || 'operario'}-${hoy}.pdf`);
}
