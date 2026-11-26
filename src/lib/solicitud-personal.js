// Lógica pura de la Solicitud de Personal (mejoras aprobadas el 2026-11-26).
// Sin imports con '@/': la usan la API, la pantalla, el PDF y `npm test`.
import { textoPersonas } from './sexo-solicitud.js';

// ---------------------------------------------------------------------------
// Dirección del servicio. Las guardadas vienen del geocodificador, largas y
// repetidas: 'Calle Quevedo 3365, Buenos Aires, Ciudad Autónoma de Buenos
// Aires, C1417, Ciudad Autónoma de Buenos Aires' -> 'Calle Quevedo 3365, CABA'.
export function direccionCorta(d) {
    const partes = String(d || '').split(',').map((x) => x.trim()).filter(Boolean)
        .filter((x) => !/^[A-Z]\d{4}[A-Z]{0,3}$/.test(x))
        .map((x) => (/^Ciudad Aut[oó]noma de Buenos Aires$/i.test(x) ? 'CABA' : x));
    const unicas = partes.filter((x, i) => partes.indexOf(x) === i);
    return (unicas.includes('CABA') ? unicas.filter((x) => x !== 'Buenos Aires') : unicas).join(', ');
}

// ---------------------------------------------------------------------------
// Días de la semana: guardados como 'lun,mar,mie'. El orden es el real.
export const DIAS = [
    { k: 'lun', c: 'L', n: 'Lunes' },
    { k: 'mar', c: 'M', n: 'Martes' },
    { k: 'mie', c: 'M', n: 'Miércoles' },
    { k: 'jue', c: 'J', n: 'Jueves' },
    { k: 'vie', c: 'V', n: 'Viernes' },
    { k: 'sab', c: 'S', n: 'Sábado' },
    { k: 'dom', c: 'D', n: 'Domingo' },
];
const SEMANA = ['lun', 'mar', 'mie', 'jue', 'vie'];

// El resumen en palabras de lo marcado ("Lunes a viernes", "Todos los días").
export function resumenDias(dias) {
    const d = Array.isArray(dias) ? dias : String(dias || '').split(',').filter(Boolean);
    if (!d.length) return '';
    const set = new Set(d);
    const enOrden = DIAS.filter((x) => set.has(x.k));
    if (enOrden.length === 7) return 'Todos los días';
    if (enOrden.length === 6 && !set.has('dom')) return 'Lunes a sábado';
    if (enOrden.length === 5 && SEMANA.every((k) => set.has(k))) return 'Lunes a viernes';
    if (enOrden.length === 2 && set.has('sab') && set.has('dom')) return 'Fines de semana';
    if (enOrden.length === 1) return enOrden[0].n;
    const nombres = enOrden.map((x) => x.n);
    return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Quién entra al puesto al marcar Cubierta: un DNI y un nombre por persona
// pedida. El DNI se guarda solo con números; el nombre, en mayúsculas como en
// los legajos.
export function limpiarPersonas(lista, cantidad) {
    const pedidas = Math.max(1, Math.floor(Number(cantidad)) || 1);
    const filas = Array.isArray(lista) ? lista : [];
    if (filas.length < pedidas) return { error: `Faltan personas: se pidieron ${pedidas}.` };
    const personas = [];
    for (const p of filas.slice(0, pedidas)) {
        const dni = String(p?.dni ?? '').replace(/\D/g, '');
        const nombre = String(p?.nombre ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
        if (!dni || !nombre) return { error: 'Completá el DNI y el nombre de cada persona.' };
        if (dni.length < 7 || dni.length > 8) return { error: 'El DNI tiene que tener 7 u 8 números.' };
        personas.push({ dni, nombre });
    }
    return { personas };
}

// El grupo une las solicitudes de un mismo pedido ("Guardar y cargar otra
// igual"), para que el tablero de rotación las cuente una vez.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function limpiarGrupo(v) {
    return typeof v === 'string' && UUID_RE.test(v.trim()) ? v.trim().toLowerCase() : null;
}

// ---------------------------------------------------------------------------
// PDF simple: una fila por solicitud, cuatro columnas.
const JORNADA_PDF = { completa: 'Completa', media: 'Media jornada', turno: 'Turno' };
const hhmm = (t) => (t ? String(t).slice(0, 5) : null);
function horario(desde, hasta) {
    const d = hhmm(desde), h = hhmm(hasta);
    if (d && h) return `${d} a ${h}`;
    if (d) return `desde ${d}`;
    if (h) return `hasta ${h}`;
    return '';
}
const fechaDMA = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : '—');

export function filasPdf(solicitudes) {
    return (solicitudes || []).map((s) => {
        const servicio = [
            s.service_name || '—',
            s.service_name_2 ? `+ ${s.service_name_2}` : null,
            s.urgencia === 'urgente' ? 'Urgente' : null,
            s.por_vacaciones ? 'Vacaciones' : null,
        ].filter(Boolean).join('\n');
        const pedido = [
            `${textoPersonas(s.cantidad, s.sexo)} · ${JORNADA_PDF[s.tipo_jornada] || '—'}`,
            horario(s.hora_desde, s.hora_hasta),
            resumenDias(s.dias),
        ].filter(Boolean).join('\n');
        const entraron = (Array.isArray(s.personas_tomadas) ? s.personas_tomadas : [])
            .map((p) => `Entró: ${p.nombre} · DNI ${p.dni}`);
        const comentarios = [...entraron, s.motivo, s.notas].filter(Boolean).join('\n') || '—';
        return [servicio, pedido, fechaDMA(s.fecha_necesaria), comentarios];
    });
}

const QUE_SE_BAJA = {
    todos: 'abiertas',
    pendiente: 'pendientes',
    en_proceso: 'con entrevista agendada',
    cubierta: 'cubiertas',
    vacaciones: 'para cubrir vacaciones',
};
export function tituloPdf(filtro, hoy) {
    return `Solicitudes de personal ${QUE_SE_BAJA[filtro] || QUE_SE_BAJA.todos} al ${hoy}`;
}
