// Calendario de quincenas de vacaciones que fija la empresa.
//
// Sale del PDF "calendario VACACIONES 2026": cada quincena arranca un lunes y
// dura 14 días; se reincorpora el lunes siguiente. Las vacaciones se dan de a
// quincenas, así que la carga ofrece esta lista en vez de una fecha libre (que
// queda como escape para los casos que no encajan).
//
// Para el período siguiente: agregar la lista nueva con su año como clave.

const CALENDARIO = {
    2026: [
        { desde: '2026-11-23', nombre: '2° de noviembre' },
        { desde: '2026-12-07', nombre: '1° de diciembre' },
        { desde: '2026-12-21', nombre: '2° de diciembre' },
        { desde: '2027-01-04', nombre: '1° de enero' },
        { desde: '2027-01-18', nombre: '2° de enero' },
        { desde: '2027-02-01', nombre: '1° de febrero' },
        { desde: '2027-02-15', nombre: '2° de febrero' },
        { desde: '2027-03-01', nombre: '1° de marzo' },
        { desde: '2027-03-15', nombre: '2° de marzo' },
    ],
};

export const DIAS_QUINCENA = 14;

export function quincenasDe(periodo) {
    return CALENDARIO[periodo] || [];
}

/**
 * El período de vacaciones que corre hoy. La temporada va de octubre a abril
 * (art. 150 LCT) y se imputa al año en que empezó: en enero de 2027 se siguen
 * tomando las del período 2026. Usar el año calendario a secas hacía que el
 * 1° de enero desaparecieran 6 de las 9 quincenas.
 */
export function periodoVigente(hoy = hoyAR()) {
    const [a, m] = hoy.split('-').map(Number);
    return m <= 4 ? a - 1 : a;
}

export const hoyAR = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

/** Las quincenas del período con su último día: [{ desde, hasta, nombre }]. */
export function quincenasConFin(periodo) {
    return quincenasDe(periodo).map(q => ({ ...q, hasta: sumarDias(q.desde, DIAS_QUINCENA) }));
}

/**
 * Cuántos anotados hay en cada quincena: las vacaciones vigentes (aprobadas y
 * sin aprobar) que la tocan. Quien se toma 28 días cuenta en las dos.
 * Lo usan el resumen de "Para aprobar" y su Excel, para que digan lo mismo.
 * @returns [{ desde, hasta, nombre, total, aprobadas, pendientes }]
 */
export function anotadosPorQuincena(periodo, movimientos) {
    return quincenasConFin(periodo).map(q => {
        const tocan = (movimientos || []).filter(m => m.fecha_desde && m.fecha_hasta
            && m.fecha_desde <= q.hasta && m.fecha_hasta >= q.desde);
        const pendientes = tocan.filter(m => m.estado === 'pendiente').length;
        return { ...q, total: tocan.length, pendientes, aprobadas: tocan.length - pendientes };
    });
}

// Cuándo se cobran los días que no se toman: una quincena del MES (no las del
// calendario de vacaciones): la 1ª del 1 al 15 y la 2ª del 16 a fin de mes. Se
// guarda el primer día ('2026-11-01' o '2026-11-16'). Decidido con el usuario el
// 2026-11-02: así lo anotaban ("la segunda quincena de noviembre").
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const COBRO_RE = /^\d{4}-\d{2}-(01|16)$/;

/** '2026-11-16' -> "2ª quincena de noviembre" */
export function nombreCobro(ymd) {
    if (!COBRO_RE.test(ymd || '')) return '';
    const [, m, d] = ymd.split('-').map(Number);
    return `${d === 1 ? '1ª' : '2ª'} quincena de ${MESES_LARGOS[m - 1]}`;
}

// "Cuando sale de vacaciones" (pedido del usuario, 2026-11-02): hay quien cobra
// los días justo antes de irse, y mientras la jefa no aprueba la quincena no se
// sabe cuál es. Ese cobro se guarda SIN fecha y la toma al aprobarse el tomado
// que se cargó junto (misma persona, mismo created_at).
export const COBRO_AL_SALIR = 'al_salir';

/**
 * La quincena de cobro más cercana al día que sale: "2° de febrero" arranca el
 * 15/02 y cobra en la 2ª de febrero; "1° de diciembre" (07/12), en la 1ª.
 */
export function cobroDeSalida(desde) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || '')) return null;
    const [a, m, d] = desde.split('-').map(Number);
    const t = Date.UTC(a, m - 1, d);
    const mejor = [Date.UTC(a, m - 1, 1), Date.UTC(a, m - 1, 16), Date.UTC(a, m, 1)]
        .reduce((x, y) => (Math.abs(y - t) < Math.abs(x - t) ? y : x));
    return new Date(mejor).toISOString().slice(0, 10);
}

/**
 * Con qué salida va un cobro "al salir": la de la misma carga o, si la quincena
 * se volvió a cargar aparte (Díaz, 2026-11-02), la más nueva de esa persona en
 * el período. tomados = los vigentes (sin anulados ni rechazados).
 */
export function salidaDelCobro(cobro, tomados) {
    const suyos = (tomados || []).filter(t => t.tipo === 'tomado'
        && t.employee_id === cobro.employee_id && t.periodo === cobro.periodo);
    return suyos.find(t => t.created_at === cobro.created_at)
        || suyos.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;
}

/**
 * Para un cobro "al salir de vacaciones" que todavía no tiene fecha: en qué
 * quincena cobraría según la salida que se apruebe. tomado = el de la misma carga.
 */
export function cobroSegunSalida(tomado) {
    if (!tomado?.fecha_desde) return '';
    const salidas = tomado.estado === 'pendiente'
        ? [tomado.fecha_desde, tomado.fecha_desde_opcion2] : [tomado.fecha_desde];
    const nombres = [...new Set(salidas.filter(Boolean).map(cobroDeSalida))].map(nombreCobro);
    return nombres.length > 1 ? `${nombres.join(' o ')}, según la que se apruebe` : nombres[0] || '';
}

/** Para el Excel: "2ª quincena de noviembre" o "Al salir de vacaciones (…)". */
export function cuandoCobra(cobro, tomado) {
    if (cobro?.fecha_cobro) return nombreCobro(cobro.fecha_cobro);
    const segun = cobroSegunSalida(tomado);
    return `Al salir de vacaciones${segun ? ` (${segun})` : ''}`;
}

/** Las quincenas de cobro desde la del mes en curso, para elegir: [{ value, label }]. */
export function quincenasDeCobro(desdeYmd = hoyAR(), meses = 8) {
    const [a, m] = desdeYmd.split('-').map(Number);
    const out = [];
    for (let i = 0; i < meses; i++) {
        const f = new Date(Date.UTC(a, m - 1 + i, 1));
        const ym = f.toISOString().slice(0, 7);
        const fin = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
        out.push({ value: `${ym}-01`, label: `1ª quincena de ${MESES_LARGOS[f.getUTCMonth()]} (1 al 15)` });
        out.push({ value: `${ym}-16`, label: `2ª quincena de ${MESES_LARGOS[f.getUTCMonth()]} (16 al ${fin})` });
    }
    return out;
}

const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** "lun 04/01/2027". El día de la semana sirve de control: la vuelta cae lunes. */
export function fmtConDia(ymd) {
    if (!ymd) return '—';
    const [a, m, d] = ymd.split('-').map(Number);
    return `${DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${fmtFecha(ymd)}`;
}

/** El día que se reincorpora: el siguiente al último de vacaciones. */
export const vuelveEl = (hasta) => sumarDias(hasta, 2);

/** Días corridos contando el primero: del 3/11 por 14 días -> 16/11. */
export function sumarDias(desde, dias) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || '')) return null;
    if (!Number.isFinite(dias) || dias < 1) return null;
    const [a, m, d] = desde.split('-').map(Number);
    if (a < 1900 || a > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const fecha = new Date(Date.UTC(a, m - 1, d + dias - 1));
    if (Number.isNaN(fecha.getTime())) return null;
    return fecha.toISOString().slice(0, 10);
}

export const fmtFecha = (ymd) => {
    if (!ymd) return '—';
    const [a, m, d] = String(ymd).slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
};

/**
 * Cómo nombrar un período: "1ª quincena de enero" si arranca en una quincena
 * del calendario (y "1ª y 2ª quincena de enero" si son 28 días seguidos), o las
 * fechas si no encaja.
 */
export function describirPeriodo(desde, dias) {
    const todas = Object.values(CALENDARIO).flat();
    const i = todas.findIndex(q => q.desde === desde);
    if (i >= 0 && dias === DIAS_QUINCENA) return todas[i].nombre;
    if (i >= 0 && dias === DIAS_QUINCENA * 2 && todas[i + 1]?.desde === sumarDias(desde, DIAS_QUINCENA + 1)) {
        return `${todas[i].nombre} + ${todas[i + 1].nombre}`;
    }
    return `${fmtFecha(desde)} al ${fmtFecha(sumarDias(desde, dias))}`;
}

/**
 * Solo para el admin (pedido del usuario, 2026-11-12): quién resolvió un
 * movimiento y cuándo, con día y hora. Para poder ver qué marcó la jefa
 * operativa y a qué hora. Vacío si no hay registro (lo aprobado antes del
 * 2026-10-14, o lo que nace aprobado, no lo tiene).
 *   "Ivana Britos aprobó el jue 12/11/2026 a las 14:32"
 */
export function quienResolvio(m) {
    if (!m?.resuelto_at || !m?.resuelto_por) return '';
    let verbo = 'aprobó';
    if (m.estado === 'rechazado') verbo = 'rechazó';
    else if (m.fecha_desde_original) {
        verbo = m.fecha_desde === m.fecha_desde_opcion2 ? 'aprobó la 2ª opción' : 'cambió la fecha y aprobó';
    }
    const cuando = new Date(m.resuelto_at);
    if (Number.isNaN(cuando.getTime())) return `${m.resuelto_por} ${verbo}`;
    const tz = 'America/Argentina/Buenos_Aires';
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(cuando);
    const hora = new Intl.DateTimeFormat('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(cuando);
    return `${m.resuelto_por} ${verbo} el ${fmtConDia(ymd)} a las ${hora}`;
}
