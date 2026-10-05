// Lo que comparten la pantalla de trabajos programados, su API y el cron de
// avisos. Funciones puras: corren igual en el navegador y en el servidor.

// Cuantos dias antes de la fecha se avisa. Como el cron solo mira trabajos sin
// coordinar, el segundo aviso sale unicamente si nadie coordino despues del
// primero.
export const AVISOS_DIAS_ANTES = [7, 2];

// La vispera (sprint 5): el dia anterior, a los trabajos YA COORDINADOS, se les
// avisa quienes van. Se guarda en trabajos_avisos como el aviso de 1 dia
// antes, asi que AVISOS_DIAS_ANTES no puede incluir el 1: se pisarian.
export const VISPERA_DIAS_ANTES = 1;

// Un aviso que no llego a nadie (tipicamente: nadie tiene las notificaciones
// activadas) se reintenta en las corridas siguientes, hasta este total.
export const MAX_INTENTOS_AVISO = 3;

export const ESTADO_LABEL = {
    pendiente: 'Sin coordinar',
    coordinado: 'Coordinado',
    hecho: 'Hecho',
    cancelado: 'Cancelado',
};

// La fecha de hoy en Argentina, como 'YYYY-MM-DD'. No usar
// new Date().toISOString(): eso es UTC, y despues de las 21 ya es mañana.
export const hoyArgentina = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

// Las fechas se operan en UTC a mediodia, para que ni el huso horario ni un
// cambio de horario corran el resultado un dia.
const aUTC = (ymd) => {
    const [a, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
    return Date.UTC(a, m - 1, d, 12);
};
export const sumarDias = (ymd, n) => new Date(aUTC(ymd) + n * 86400000).toISOString().slice(0, 10);
export const diasEntre = (desde, hasta) => Math.round((aUTC(hasta) - aUTC(desde)) / 86400000);

// 'YYYY-MM-DD' -> '15/10/2026'. Se parte el string y no se usa Date: en
// Argentina new Date('2026-10-15') cae un dia antes.
export function fmtFecha(ymd) {
    if (!ymd) return '';
    const [a, m, d] = String(ymd).slice(0, 10).split('-');
    return a && m && d ? `${d}/${m}/${a}` : '';
}

// "Pérez, Juan (leg. 123)": asi se muestra un operario en la pantalla y asi
// queda escrito en el historial.
export function nombreOperario(e) {
    if (!e) return '';
    const nombre = [e.apellido, e.nombre].filter(Boolean).join(', ') || `Empleado ${e.id}`;
    return e.legajo ? `${nombre} (leg. ${e.legajo})` : nombre;
}
