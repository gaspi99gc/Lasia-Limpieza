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
    // El DNI real. El modelo viejo de apercibimiento traía 34019231, que estaba
    // mal; se corrige acá para que las dos actas digan lo mismo.
    dni: '14.321.720',
    cargo: 'gerente de RRHH',
    // En el sello al pie del cambio de objetivo figura con el otro cargo.
    cargoFirma: 'SOCIO GERENTE',
};

const EMPRESA = {
    // Cada modelo la escribe con su propia capitalización; se respeta la de cada uno.
    razonSocial: 'LASIA Servicios SRL',
    razonSocialCorta: 'Lasia Servicios SRL',
    razonSocialLegal: 'LASIA SERVICIOS S.R.L.',
    domicilioLargo: 'Avenida Federico Lacroze 2252 Piso 9 Oficina A de esta Ciudad Autónoma de Buenos Aires',
    // Cada modelo escribe la dirección a su manera; se respeta la de cada uno.
    domicilio: 'Avenida Federico Lacroze 2252, 9 piso, depto. A, de esta ciudad de Buenos Aires',
    domicilioCorto: 'Avenida Federico Lacroze 2252 9° "A"',
    pie: 'LASIA SERVICIOS S.R.L / AV. FEDERICO LACROZE 2252 9º A - C.A.B.A / INFO@LASIA.COM.AR / Tel 4771-0481',
    // El modelo de cambio de objetivo cierra con otro pie.
    pieCambio: 'LASIA LIMPIEZA INTEGRAL S.R.L / AV. F. LACROZE 2252 PISO 9 OF. A - C.A.B.A / Tel: 4771-0481',
};

// Al terminar la suspensión la persona se presenta en la oficina para cerrar el
// tema, y recién después vuelve a su servicio. La hora es siempre la misma.
const HORA_PRESENTACION = '09';

// Qué categorías de informe producen acta.
//
// 'felicitacion' e 'incidente' NO generan: una felicitación no se notifica con
// una firma al pie y un incidente es una nota interna.
//
// Cambio de servicio queda preparado pero deshabilitado hasta tener su Word:
// emitir un acta con texto inventado es peor que no emitirla.
const ACTAS = {
    advertencia: { titulo: 'ACTA DE NOTIFICACIÓN DE APERCIBIMIENTO', tipo: 'apercibimiento', listo: true },
    sancion: { titulo: 'ACTA DE NOTIFICACIÓN DE APERCIBIMIENTO', tipo: 'apercibimiento', listo: true },
    suspension: { titulo: 'ACTA DE NOTIFICACIÓN SANCIÓN SUSPENSIÓN DE EMPLEO', tipo: 'suspension', listo: true },
    cambio_servicio: { titulo: 'ACTA DE NOTIFICACIÓN CAMBIO DE OBJETIVO', tipo: 'cambio_servicio', listo: true },
};

// Las direcciones de los servicios vienen del geocodificador, largas y con todo
// repetido ("Calle Iguazú 921, Buenos Aires, Ciudad Autónoma de Buenos Aires,
// C1437, Ciudad Autónoma de Buenos Aires"). El acta usa el formato corto de
// siempre: "Iguazú 921, CABA".
//
// Es un punto de partida editable: en el modal se puede corregir antes de
// imprimir, porque ninguna regla acierta con todas las direcciones.
export function direccionCorta(direccion) {
    const texto = String(direccion || '').trim();
    if (!texto) return '';

    const partes = texto.split(',').map(p => p.trim()).filter(Boolean);
    const calle = (partes[0] || texto)
        .replace(/^(calle|avenida|av\.?|Avda\.?)\s+/i, '')
        .trim();

    const enCaba = /ciudad aut[oó]noma|c\.?a\.?b\.?a\.?|capital federal/i.test(texto);
    if (enCaba) return `${calle}, CABA`;

    // Fuera de CABA: se conserva la localidad, que es la parte util para ubicarlo.
    const localidad = partes
        .slice(1)
        .map(p => p.replace(/\b[A-Z]\d{4}[A-Z]{0,3}\b/g, '').trim())   // codigo postal
        .filter(p => p && !/^provincia de/i.test(p) && !/^argentina$/i.test(p))[0];

    return localidad ? `${calle}, ${localidad}` : calle;
}

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
// año 2026".
//
// Es la fecha en que se CARGÓ el informe, no la de hoy. Antes usaba el día en
// que se generaba el PDF, y entonces reimprimir un acta de septiembre en
// noviembre la sacaba fechada en noviembre: dos papeles distintos para el mismo
// hecho, y el archivado deja de cerrar.
//
// Al salir de created_at, que ya está guardado y no cambia nunca, el acta sale
// siempre igual sin importar cuándo se la imprima.
function fechaEnPalabras(fecha = new Date()) {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    // Si la fecha no sirve, cae en hoy: es preferible a un acta sin fecha.
    const valida = Number.isNaN(d.getTime()) ? new Date() : d;
    const partes = new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit', month: 'numeric', year: 'numeric',
    }).formatToParts(valida);
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

// El día siguiente al último de suspensión: cuándo tiene que volver.
export function diaSiguiente(ymd) {
    if (!ymd) return '';
    const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return '';
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}

// El modelo escribe la cantidad en cifra y en letras: "1 (UN) días".
const EN_LETRAS = ['CERO', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE',
    'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
    'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE',
    'VEINTIUN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO',
    'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE', 'TREINTA'];

function enLetras(n) {
    return EN_LETRAS[n] || String(n);
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
function cuerpoDelActa({ tipo, informe, empleado, motivo, extra = {} }) {
    const nombre = nombreParaActa(informe, empleado);
    const dni = empleado?.dni || empleado?.cuil || '—';
    const { dia, mes, anio } = fechaEnPalabras(informe.created_at);

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

    if (tipo === 'suspension') {
        const dias = diasSuspension(informe.fecha_desde, informe.fecha_hasta);
        const retorno = diaSiguiente(informe.fecha_hasta);
        return [
            [
                { t: 'En la Ciudad Autónoma de Buenos Aires a los ' },
                { t: dia, b: true },
                { t: ' días del mes de ' },
                { t: mes, b: true },
                { t: ' del año ' },
                { t: anio, b: true },
                { t: `, ${FIRMANTE.nombre}, titular del DNI ${FIRMANTE.dni} en representación de ${EMPRESA.razonSocialCorta} como ${FIRMANTE.cargo} hallándose constituida en la sede la empresa, ${EMPRESA.domicilioCorto}, de esta Ciudad Autónoma de Buenos Aires, oficina de recursos humanos a los fines de notificar a el/la señor/a ` },
                { t: nombre, b: true },
                { t: ' con DNI ' },
                { t: String(dni), b: true },
                { t: ' en su carácter de trabajador dependiente de esta empresa, de la sanción impuesta consistente en ' },
                { t: `${dias} (${enLetras(dias)})`, b: true },
                { t: ' días de suspensión de empleo sin goce de haberes la que comenzará a hacerse efectiva el día ' },
                { t: fmtFecha(informe.fecha_desde), b: true },
                { t: ' debiendo retornar a sus tareas el día ' },
                { t: fmtFecha(retorno), b: true },
                { t: ` a las horas ${HORA_PRESENTACION}hs presentándose en las oficinas de ${EMPRESA.razonSocialCorta} (${EMPRESA.domicilioCorto})` },
                { t: ' de esta Ciudad Autónoma de Buenos.', b: true },
                { t: ' La falta cometida consistió en ' },
                { t: motivo },
                { t: '. ' },
                { t: 'Se le hace saber asimismo que la reiteración de conductas similares dará motivo a sanciones con mayor severidad', b: true },
                { t: '.' },
            ],
            [
                { t: 'Seguidamente el/la señor/a ' },
                { t: nombre, b: true },
                { t: ' se notifica de la sanción impuesta, se labra la presente, que es leída y ratificada al pie por los actuantes.' },
            ],
        ];
    }

    if (tipo === 'cambio_servicio') {
        // El horario y los días no están en el informe: se escriben al generar
        // el acta. La dirección sale del servicio destino y también es editable.
        const { desde, horario, direccion } = extra;
        return [
            [
                { t: 'En la Ciudad Autónoma de Buenos Aires a los ' },
                { t: dia, b: true },
                { t: ' días del mes de ' },
                { t: mes, b: true },
                { t: ' del año ' },
                { t: anio, b: true },
                { t: `, el señor ${FIRMANTE.nombre}, titular del DNI ${FIRMANTE.dni} en su calidad de ${FIRMANTE.cargo} de la firma ${EMPRESA.razonSocialLegal} constituidos en la sede de la empresa, ${EMPRESA.domicilioLargo}, oficina de recursos humanos, a los fines de notificar a el/la Sr/a. ` },
                { t: nombre, b: true },
                { t: ' con DNI: ' },
                { t: String(dni), b: true },
                { t: ' en su carácter de trabajador/a dependiente de esta empresa, del cambio de objetivo en el que deberá prestar tareas.' },
            ],
            [
                { t: 'Es así que de manera fehaciente se le notifica y hace saber que debido a las facultades de organización y dirección (artículos 64 y 65 de la L.C.T.) a partir del día ' },
                { t: fmtFecha(desde), b: true },
                { t: ' deberá presentarse a cumplir con su servicio laboral en ' },
                { t: direccion, b: true },
                { t: ' ' },
                { t: horario, b: true },
                { t: '.' },
            ],
            [
                { t: 'Seguidamente el/la Sr/a ' },
                { t: nombre, b: true },
                { t: ' se notifica de la medida dispuesta. Y presta conformidad del cambio de objetivo y horario. Se labra la presente, que es leída y ratificada al pie por los actuantes.' },
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
export async function descargarActa(informe, empleado = null, motivo = null, extra = {}) {
    const def = ACTAS[informe?.categoria];
    if (!def?.listo) throw new Error('Todavía no está cargado el modelo de esta acta.');

    // El cambio de objetivo no lleva motivo: lo que necesita son los datos del
    // nuevo puesto, que no están en el informe y se escriben al generar el acta.
    const esCambio = def.tipo === 'cambio_servicio';
    const textoMotivo = (motivo ?? informe.descripcion ?? '').trim();
    if (!esCambio && !textoMotivo) throw new Error('El acta necesita un motivo.');

    if (esCambio) {
        if (!extra.desde) throw new Error('Falta desde qué día se presenta en el nuevo servicio.');
        if (!String(extra.horario || '').trim()) throw new Error('Falta el horario del nuevo servicio.');
        if (!String(extra.direccion || '').trim()) throw new Error('Falta la dirección del nuevo servicio.');
    }

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

    for (const parrafo of cuerpoDelActa({ tipo: def.tipo, informe, empleado, motivo: textoMotivo, extra })) {
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

    // El cambio de objetivo cierra con el sello de quien firma por la empresa.
    // Ahí el modelo lo llama SOCIO GERENTE, distinto del "gerente de RRHH" con
    // el que se presenta en el cuerpo: se respetan los dos como están.
    if (def.tipo === 'cambio_servicio') {
        doc.setFontSize(9);
        doc.setTextColor(60);
        const xSello = ANCHO - M - 55;
        doc.text(FIRMANTE.nombre, xSello, yFirma + 4);
        doc.text(FIRMANTE.cargoFirma, xSello, yFirma + 9);
        doc.text(EMPRESA.razonSocialCorta.toUpperCase(), xSello, yFirma + 14);
    }

    // --- Pie ---
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    const pie = def.tipo === 'cambio_servicio' ? EMPRESA.pieCambio : EMPRESA.pie;
    doc.text(doc.splitTextToSize(pie, UTIL), ANCHO / 2, ALTO - 14, { align: 'center' });

    // --- Nombre del archivo ---
    const slug = nombreParaActa(informe, empleado)
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    // La misma fecha que lleva el acta adentro: así el archivo no cambia de
    // nombre entre una impresión y otra, y dos descargas no quedan como si
    // fueran actas distintas.
    const fechaArchivo = (informe.created_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    doc.save(`acta-${def.tipo}-${slug || 'operario'}-${fechaArchivo}.pdf`);
}
