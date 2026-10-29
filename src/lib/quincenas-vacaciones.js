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
