'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { useCatalog } from '@/lib/CatalogContext';
import { getSessionUser } from '@/lib/session';
import { notify } from '@/lib/toast';
import { normalizeText } from '@/lib/search';
import SearchableSelect from '@/components/SearchableSelect';
import ActivarNotificaciones from '@/components/ActivarNotificaciones';
import HojaFecha from '@/components/HojaFecha';
import {
    AVISOS_DIAS_ANTES, MAX_INTENTOS_AVISO, VISPERA_DIAS_ANTES, diasEntre, fmtFecha, fmtHora, hoyArgentina, sumarDias,
} from '@/lib/trabajos';

// Trabajos programados: los especiales que se acuerdan con el cliente para una
// fecha (vidrios, tanques, pisos).
//
// La pantalla responde una sola pregunta: que se viene y si ya esta resuelto.
// Por eso lo primero que se ve es cuantos dias faltan y quien falta conseguir,
// y no una tabla de datos.

// Cuantos dias faltan, contando desde HOY EN ARGENTINA. Antes se tomaba el hoy
// en UTC y despues de las 21 la cuenta regresiva quedaba corrida un dia.
const diasHasta = (ymd) => (ymd ? diasEntre(hoyArgentina(), ymd) : null);

// Fechas y horas de los registros (timestamps) en hora de Argentina.
const fmtAR = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const fmtDiaMesAR = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit',
});
const fmtFechaHora = (iso) => (iso ? fmtAR.format(new Date(iso)) : '');
const fmtDiaMes = (iso) => (iso ? fmtDiaMesAR.format(new Date(iso)) : '');

// Como se lee la cuenta regresiva. Es lo primero que mira alguien al entrar.
function cuandoEs(dias) {
    if (dias === null) return '';
    if (dias < 0) return `hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'día' : 'días'}`;
    if (dias === 0) return 'hoy';
    if (dias === 1) return 'mañana';
    return `en ${dias} días`;
}

const ESTADOS = {
    pendiente: { label: 'Sin coordinar', tono: 'ambar' },
    coordinado: { label: 'Coordinado', tono: 'verde' },
    hecho: { label: 'Hecho' },
    cancelado: { label: 'Cancelado' },
};

// La urgencia de un trabajo, en una palabra (ver .agenda en globals.css). Solo
// apura lo que falta coordinar; lo coordinado ya está resuelto.
function tonoDe(t, dias) {
    if (t.estado === 'coordinado') return 'verde';
    if (t.estado !== 'pendiente' || dias === null) return undefined;
    return dias <= 2 ? 'rojo' : dias <= 7 ? 'ambar' : undefined;
}

const GRUPOS = [
    { id: 'pasados', titulo: 'Ya pasaron', tono: 'rojo' },
    { id: 'semana', titulo: 'Esta semana', tono: 'ambar' },
    { id: 'despues', titulo: 'Más adelante' },
];
const grupoDe = (dias) => (dias !== null && dias < 0 ? 'pasados' : dias !== null && dias <= 7 ? 'semana' : 'despues');

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// La hora de Argentina, para saber si el envio de las 8 ya paso.
const horaAR = () => Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hourCycle: 'h23',
}).format(new Date()));

// Un aviso que ya tiene registro, como se lee.
function describirAviso(a, { reintenta }) {
    if (a.estado === 'enviado') {
        return {
            tono: 'ok',
            texto: `enviado el ${fmtDiaMes(a.enviado_at)} a ${plural(a.destinatarios, 'persona', 'personas')} (${plural(a.dispositivos, 'dispositivo', 'dispositivos')})`,
        };
    }
    if (a.estado === 'fallido') {
        return { tono: 'mal', texto: `no llegó: ${a.ultimo_error || 'error desconocido'}${reintenta ? ' Se reintenta en el próximo envío.' : ''}` };
    }
    if (a.estado === 'enviando') return { tono: 'mal', texto: `el envío se cortó a la mitad.${reintenta ? ' Se reintenta en el próximo envío.' : ''}` };
    return null; // 'omitido' no se muestra: ya salio uno mas cercano a la fecha.
}

// El estado de los avisos de un trabajo, como se lee: "7 días: enviado el 05/10
// a 3 personas (4 dispositivos)". Es la respuesta a "¿le llegó a alguien?".
// Repite la cuenta del cron para decir tambien cuando sale el que falta.
function estadoAvisos(t) {
    const hoy = hoyArgentina();
    const dias = diasEntre(hoy, t.fecha);
    const llegados = AVISOS_DIAS_ANTES.filter((d) => dias <= d);
    const elQueToca = llegados.length ? Math.min(...llegados) : null;
    const lineas = [];

    // Los de coordinar: 7 y 2 dias antes, mientras siga sin coordinar.
    for (const d of AVISOS_DIAS_ANTES) {
        const etiqueta = `${d} días`;
        const a = (t.avisos || []).find((x) => x.dias_antes === d);
        if (a) {
            const reintenta = t.estado === 'pendiente' && a.intentos < MAX_INTENTOS_AVISO && d === elQueToca;
            const linea = describirAviso(a, { reintenta });
            if (linea) lineas.push({ etiqueta, ...linea });
            continue;
        }
        if (t.estado !== 'pendiente' || dias < 0) continue;
        const sale = sumarDias(t.fecha, -d);
        if (sale > hoy) lineas.push({ etiqueta, tono: null, texto: `sale el ${fmtFecha(sale).slice(0, 5)}` });
        else if (d === elQueToca) lineas.push({ etiqueta, tono: null, texto: 'sale en el próximo envío (8 h)' });
    }

    // La vispera: solo para los coordinados, con quienes van.
    const etiqueta = 'Día anterior';
    const v = (t.avisos || []).find((x) => x.dias_antes === VISPERA_DIAS_ANTES);
    if (v) {
        const reintenta = t.estado === 'coordinado' && v.intentos < MAX_INTENTOS_AVISO && dias === VISPERA_DIAS_ANTES;
        const linea = describirAviso(v, { reintenta });
        if (linea) lineas.push({ etiqueta, ...linea });
    } else if (t.estado === 'coordinado' && dias >= VISPERA_DIAS_ANTES) {
        const sale = sumarDias(t.fecha, -VISPERA_DIAS_ANTES);
        if (sale > hoy) lineas.push({ etiqueta, tono: null, texto: `sale el ${fmtFecha(sale).slice(0, 5)}` });
        // Hoy es el dia anterior: si ya paso el envio de las 8, no sale (se
        // coordino despues). Se dice, para que nadie lo espere.
        else if (horaAR() < 9) lineas.push({ etiqueta, tono: null, texto: 'sale hoy a las 8 h' });
        else lineas.push({ etiqueta, tono: null, texto: 'no sale: se coordinó después del envío de las 8 h' });
    }
    return lineas;
}

export default function TrabajosPage() {
    const { services = [], supervisors = [] } = useCatalog();
    const [trabajos, setTrabajos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [modal, setModal] = useState(null);       // null | 'nuevo' | el trabajo a editar
    const [coordinando, setCoordinando] = useState(null);   // el trabajo al que se le eligen operarios
    const [historialDe, setHistorialDe] = useState(null);   // id del trabajo con el historial abierto
    const [busqueda, setBusqueda] = useState('');
    const [verHechos, setVerHechos] = useState(false);
    const [role, setRole] = useState(null);

    useEffect(() => { setRole(getSessionUser()?.role || null); }, []);
    const puedeEditar = role === 'admin' || role === 'operaciones';

    // `primeraVez` distingue "todavía no hay nada que mostrar" de "estoy
    // refrescando lo que ya se ve". Sin eso, tildar "Ver los terminados" o
    // coordinar un trabajo borraba la lista y ponía "Cargando…" un instante:
    // la pantalla parpadeaba entera por un cambio de una fila.
    const cargar = useCallback(async (historico = false, primeraVez = false) => {
        if (primeraVez) setCargando(true);
        setError('');
        try {
            const res = await fetch(`/api/trabajos-programados${historico ? '?historico=1' : ''}`, { credentials: 'include' });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'No se pudo cargar.');
            setTrabajos(Array.isArray(json) ? json : []);
        } catch (e) {
            setError(e.message || 'Error de red.');
        } finally {
            setCargando(false);
        }
    }, []);

    const yaCargoAlgunaVez = useRef(false);
    useEffect(() => {
        cargar(verHechos, !yaCargoAlgunaVez.current);
        yaCargoAlgunaVez.current = true;
    }, [cargar, verHechos]);

    // Si se llego desde el boton "Coordinar" de una notificacion
    // (/trabajos?coordinar=12), se abre ese trabajo directo para elegir quienes
    // van. Una sola vez, y se limpia la URL para que recargar no lo reabra.
    const deepLinkVisto = useRef(false);
    useEffect(() => {
        if (deepLinkVisto.current || cargando || !role) return;
        deepLinkVisto.current = true;
        const id = Number(new URLSearchParams(window.location.search).get('coordinar'));
        if (!id) return;
        window.history.replaceState(null, '', window.location.pathname);
        const t = trabajos.find((x) => x.id === id);
        if (!t) {
            notify.info('Ese trabajo ya no está en la lista: puede estar hecho o anulado.');
            return;
        }
        if (puedeEditar && (t.estado === 'pendiente' || t.estado === 'coordinado')) setCoordinando(t);
    }, [cargando, role, trabajos, puedeEditar]);

    // "Ver los terminados" muestra SOLO los hechos y cancelados, no todo junto:
    // es la forma de encontrar uno que se cerró, sin la agenda en el medio.
    const visibles = useMemo(() => {
        const terminado = (t) => t.estado === 'hecho' || t.estado === 'cancelado';
        const q = normalizeText(busqueda);
        return trabajos.filter((t) =>
            terminado(t) === verHechos
            && (!q || normalizeText(`${t.titulo} ${t.servicio_nombre || ''} ${t.descripcion || ''}`).includes(q)));
    }, [trabajos, busqueda, verHechos]);

    // Lo que se viene sin coordinar en la próxima semana: es el número que
    // importa y el que el aviso automático va a perseguir.
    const urgentes = useMemo(
        () => trabajos.filter((t) => {
            if (t.estado !== 'pendiente') return false;
            const d = diasHasta(t.fecha);
            return d !== null && d >= 0 && d <= 7;
        }).length,
        [trabajos]
    );

    const cambiarEstado = async (trabajo, estado) => {
        try {
            const res = await fetch('/api/trabajos-programados', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: trabajo.id, estado }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'No se pudo actualizar.');
            notify.success(estado === 'hecho' ? 'Marcado como hecho.'
                : estado === 'pendiente' ? 'Volvió a la lista, sin coordinar.' : 'Actualizado.');
            cargar(verHechos);
        } catch (e) {
            notify.error(e.message || 'Error de red.');
        }
    };

    const anular = async (trabajo) => {
        if (!confirm(`¿Anular "${trabajo.titulo}" del ${fmtFecha(trabajo.fecha)}?\n\nDeja de aparecer en la lista.`)) return;
        try {
            const res = await fetch(`/api/trabajos-programados?id=${trabajo.id}`, { method: 'DELETE', credentials: 'include' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || 'No se pudo anular.');
            notify.success('Trabajo anulado.');
            cargar(verHechos);
        } catch (e) {
            notify.error(e.message || 'Error de red.');
        }
    };

    // Una fila de la agenda. La fecha manda; la acción principal depende de en
    // qué está el trabajo, y el resto (editar, historial, anular) va callado.
    const fila = (t) => {
        const dias = diasHasta(t.fecha);
        const tono = tonoDe(t, dias);
        const est = ESTADOS[t.estado] || ESTADOS.pendiente;
        const terminado = t.estado === 'hecho' || t.estado === 'cancelado';
        const avisos = estadoAvisos(t);
        const detalle = [
            t.hora_inicio && fmtHora(t.hora_inicio),
            `${t.operarios_necesarios} ${t.operarios_necesarios === 1 ? 'operario' : 'operarios'}`,
            t.supervisor_nombre && `Supervisor: ${t.supervisor_nombre}`,
        ].filter(Boolean).join(' · ');
        return (
            <article key={t.id} className="agenda-fila" data-apagada={terminado}>
                <HojaFecha fecha={t.fecha} tono={tono} />
                <div className="agenda-cuerpo">
                    <div className="agenda-cabeza">
                        <h3 className="agenda-titulo">{t.titulo}</h3>
                        <span className="agenda-estado" data-tono={est.tono}>{est.label}</span>
                        {/* Uno coordinado que ya pasó no está "bien": falta cerrarlo. */}
                        {!terminado && (
                            <span className="agenda-cuando" data-tono={dias !== null && dias < 0 && t.estado !== 'pendiente' ? undefined : tono}>
                                {cuandoEs(dias)}
                            </span>
                        )}
                    </div>
                    <div className="agenda-detalle">
                        <strong>{t.servicio_nombre || 'Sin servicio'}</strong> · {detalle}
                    </div>

                    {t.operarios?.length > 0 && (
                        <div className="agenda-detalle">
                            {t.estado === 'pendiente' ? 'Confirmados' : 'Van'} ({t.operarios.length} de {t.operarios_necesarios}):{' '}
                            <strong>{t.operarios.map((o) => o.nombre).join(', ')}</strong>
                        </div>
                    )}

                    {t.descripcion && <div className="agenda-nota">{t.descripcion}</div>}

                    {avisos.length > 0 && (
                        <div className="agenda-avisos">
                            Avisos:{' '}
                            {avisos.map((a, i) => (
                                <span key={a.etiqueta} data-mal={a.tono === 'mal'}>
                                    {i > 0 && ' · '}{a.etiqueta}: {a.texto}
                                </span>
                            ))}
                        </div>
                    )}

                    {t.coordinado_por && (
                        <div className="agenda-avisos">Coordinado por {t.coordinado_por}</div>
                    )}

                    <div className="agenda-acciones">
                        {puedeEditar && t.estado === 'pendiente' && (
                            <button className="btn btn-primary" onClick={() => setCoordinando(t)}>✓ Coordinar</button>
                        )}
                        {puedeEditar && t.estado === 'coordinado' && (
                            <>
                                <button className="btn btn-primary" onClick={() => {
                                    // Saca el trabajo de la lista: un clic de más no
                                    // puede cerrarlo sin preguntar.
                                    if (confirm(`¿Marcar "${t.titulo}" como hecho?\n\nSale de la lista y ya no manda avisos.`)) {
                                        cambiarEstado(t, 'hecho');
                                    }
                                }}>
                                    ✓ Marcar como hecho
                                </button>
                                <button className="agenda-accion" onClick={() => setCoordinando(t)}>Operarios</button>
                            </>
                        )}
                        {/* Para deshacer un "hecho" marcado por error. Vuelve a sin
                            coordinar con los mismos operarios: se confirma de nuevo
                            con "Coordinar". */}
                        {puedeEditar && t.estado === 'hecho' && (
                            <button className="btn btn-secondary" onClick={() => cambiarEstado(t, 'pendiente')}>↩ Volver a la lista</button>
                        )}
                        {puedeEditar && <button className="agenda-accion" onClick={() => setModal(t)}>Editar</button>}
                        <button className="agenda-accion" onClick={() => setHistorialDe(historialDe === t.id ? null : t.id)}>
                            {historialDe === t.id ? 'Ocultar historial' : 'Historial'}
                        </button>
                        {puedeEditar && (
                            <button className="agenda-accion agenda-accion--borrar" onClick={() => anular(t)}>Anular</button>
                        )}
                    </div>

                    {historialDe === t.id && <HistorialTrabajo trabajo={t} />}
                </div>
            </article>
        );
    };

    const grupos = verHechos ? [] : GRUPOS
        .map((g) => ({ ...g, filas: visibles.filter((t) => grupoDe(diasHasta(t.fecha)) === g.id) }))
        .filter((g) => g.filas.length);

    return (
        <MainLayout>
            <div className="config-view agenda">
                <header className="page-header" style={{ marginBottom: '1rem', alignItems: 'center' }}>
                    <h1 style={{ margin: 0, flex: '1 1 0', minWidth: 'min-content' }}>Trabajos programados</h1>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginLeft: 'auto' }}>
                        {puedeEditar && (
                            <button className="btn btn-primary" onClick={() => setModal('nuevo')}>
                                + Nuevo trabajo
                            </button>
                        )}
                        {/* Acá y no en todas las pantallas: es donde importa que
                            los avisos lleguen, así que es donde se acuerda de activarlos. */}
                        <ActivarNotificaciones />
                    </div>
                </header>

                <div className="agenda-tabs" role="tablist">
                    {[{ id: false, label: 'Próximos' }, { id: true, label: 'Terminados' }].map((x) => (
                        <button key={x.label} role="tab" aria-selected={verHechos === x.id} onClick={() => setVerHechos(x.id)}>
                            {x.label}
                        </button>
                    ))}
                </div>

                <div className="agenda-barra">
                    <input
                        type="search"
                        placeholder="Buscar por trabajo o servicio"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                    />
                    {/* Lo que se viene sin resolver: es la razón de ser de la pantalla. */}
                    {!cargando && !verHechos && urgentes > 0 && (
                        <span className="agenda-pendientes">
                            {urgentes} sin coordinar en los próximos 7 días
                        </span>
                    )}
                </div>

                {cargando ? (
                    <div className="agenda-vacia">Cargando…</div>
                ) : error ? (
                    <div className="agenda-vacia" style={{ color: 'var(--error)' }}>{error}</div>
                ) : visibles.length === 0 ? (
                    <div className="agenda-vacia">
                        <strong>
                            {busqueda ? 'Nada coincide con la búsqueda'
                                : verHechos ? 'No hay trabajos terminados' : 'No hay trabajos programados'}
                        </strong>
                        {!busqueda && !verHechos && puedeEditar && 'Cargá el primero con “+ Nuevo trabajo”.'}
                    </div>
                ) : verHechos ? (
                    <div className="agenda-lista">{visibles.map(fila)}</div>
                ) : (
                    grupos.map((g) => (
                        <section key={g.id} className="agenda-grupo" data-tono={g.tono}>
                            <h2 className="agenda-grupo__titulo">{g.titulo} <small>{g.filas.length}</small></h2>
                            <div className="agenda-lista">{g.filas.map(fila)}</div>
                        </section>
                    ))
                )}

                {coordinando && (
                    <CoordinarModal
                        trabajo={coordinando}
                        onClose={() => setCoordinando(null)}
                        onGuardado={() => { setCoordinando(null); cargar(verHechos); }}
                    />
                )}

                {modal && (
                    <TrabajoModal
                        trabajo={modal === 'nuevo' ? null : modal}
                        services={services}
                        supervisors={supervisors}
                        onClose={() => setModal(null)}
                        onGuardado={() => { setModal(null); cargar(verHechos); }}
                    />
                )}
            </div>
        </MainLayout>
    );
}

function TrabajoModal({ trabajo, services, supervisors, onClose, onGuardado }) {
    const editando = Boolean(trabajo);
    const [serviceId, setServiceId] = useState(trabajo?.service_id ? String(trabajo.service_id) : '');
    const [titulo, setTitulo] = useState(trabajo?.titulo || '');
    const [descripcion, setDescripcion] = useState(trabajo?.descripcion || '');
    const [fecha, setFecha] = useState(trabajo?.fecha || '');
    // La base la devuelve con segundos ('08:30:00'); el input quiere '08:30'.
    const [hora, setHora] = useState(trabajo?.hora_inicio ? String(trabajo.hora_inicio).slice(0, 5) : '');
    const [operarios, setOperarios] = useState(String(trabajo?.operarios_necesarios || 1));
    const [supervisorId, setSupervisorId] = useState(trabajo?.supervisor_id ? String(trabajo.supervisor_id) : '');
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !guardando) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, guardando]);

    const opcionesServicio = useMemo(
        () => [...services].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))
            .map((s) => ({ value: s.id, label: s.name })),
        [services]
    );

    // Solo los habilitados, salvo el que ya tenia el trabajo: si se dio de baja
    // tiene que seguir apareciendo para que se vea y se pueda cambiar.
    const opcionesSupervisor = useMemo(() => [
        { value: '', label: 'Sin supervisor (avisa solo a Operaciones)' },
        ...supervisors
            .filter((s) => s.login_enabled || String(s.id) === supervisorId)
            .map((s) => ({ value: s.id, label: `${s.name} ${s.surname}`.trim() })),
    ], [supervisors, supervisorId]);

    const nOperarios = Math.trunc(Number(operarios)) || 0;
    // Nunca menos lugares que gente ya asignada (no puede sobrar nadie).
    const asignados = trabajo?.operarios?.length || 0;
    const error = !serviceId ? 'Elegí el servicio.'
        : !titulo.trim() ? 'Poné qué trabajo es.'
            : !fecha ? 'Elegí la fecha.'
            : !hora ? 'Poné a qué hora empieza.'
                : nOperarios < 1 ? 'Tiene que ser 1 operario o más.'
                    : nOperarios < asignados ? `Ya hay ${asignados} asignados: para bajar, quitá en «Coordinar».`
                    : null;

    const guardar = async () => {
        if (error) { notify.error(error); return; }
        setGuardando(true);
        try {
            const cuerpo = {
                service_id: Number(serviceId),
                titulo: titulo.trim(),
                descripcion: descripcion.trim() || null,
                fecha,
                hora_inicio: hora,
                operarios_necesarios: nOperarios,
                supervisor_id: supervisorId ? Number(supervisorId) : null,
            };
            const res = await fetch('/api/trabajos-programados', {
                method: editando ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(editando ? { ...cuerpo, id: trabajo.id } : cuerpo),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'No se pudo guardar.');
            notify.success(editando ? 'Trabajo actualizado.' : 'Trabajo programado.');
            onGuardado();
        } catch (e) {
            notify.error(e.message || 'Error de red.');
        } finally {
            setGuardando(false);
        }
    };

    const inputCard = { margin: 0, fontWeight: 'normal', width: '100%' };
    const labelEstilo = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, margin: 0 };

    return (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
            <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{editando ? 'Editar trabajo' : 'Nuevo trabajo'}</h2>
                    <button className="btn btn-secondary" onClick={onClose} disabled={guardando} style={{ padding: '0.3rem 0.6rem' }} aria-label="Cerrar">✕</button>
                </div>

                <div style={{ display: 'grid', gap: '0.9rem', marginTop: '1.1rem' }}>
                    <label style={labelEstilo}>
                        Qué trabajo es
                        <input type="text" className="card" style={inputCard} placeholder="Limpieza de vidrios"
                            value={titulo} onChange={(e) => setTitulo(e.target.value)} />
                    </label>

                    <div style={labelEstilo}>
                        <span>Servicio</span>
                        <SearchableSelect
                            options={opcionesServicio}
                            value={serviceId ? Number(serviceId) : ''}
                            onChange={(v) => setServiceId(String(v || ''))}
                            placeholder="Buscar servicio…"
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <label style={{ ...labelEstilo, flex: '1 1 150px' }}>
                            Fecha
                            <input type="date" className="card" style={inputCard} value={fecha} onChange={(e) => setFecha(e.target.value)} />
                        </label>
                        <label style={{ ...labelEstilo, flex: '1 1 110px' }}>
                            Hora de inicio
                            <input type="time" className="card" style={inputCard} value={hora} onChange={(e) => setHora(e.target.value)} />
                        </label>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div style={{ ...labelEstilo, flex: '0 0 auto' }}>
                            <span>Operarios</span>
                            <div className="stepper">
                                <button type="button" aria-label="Uno menos" disabled={nOperarios <= Math.max(1, asignados)}
                                    onClick={() => setOperarios(String(Math.max(1, nOperarios - 1)))}>−</button>
                                <input type="number" min="1" step="1" aria-label="Operarios que hacen falta"
                                    value={operarios} onChange={(e) => setOperarios(e.target.value)} />
                                <button type="button" aria-label="Uno más" onClick={() => setOperarios(String(nOperarios + 1))}>+</button>
                            </div>
                        </div>
                        <div style={{ ...labelEstilo, flex: '1 1 220px' }}>
                            <span>Supervisor (le llegan los avisos)</span>
                            <SearchableSelect
                                options={opcionesSupervisor}
                                value={supervisorId}
                                onChange={(v) => setSupervisorId(String(v || ''))}
                                placeholder="Sin supervisor"
                            />
                        </div>
                    </div>

                    <label style={labelEstilo}>
                        Notas (opcional)
                        <textarea rows={2} className="card" style={{ ...inputCard, resize: 'vertical', fontFamily: 'inherit' }}
                            placeholder="Detalles del trabajo, a quién avisar, etc."
                            value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
                    </label>
                </div>

                <div className="config-modal-actions" style={{ marginTop: '1.4rem', alignItems: 'center', gap: '0.6rem' }}>
                    <button className="btn btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
                    <button className="btn btn-primary" onClick={guardar} disabled={guardando || !!error}>
                        {guardando ? 'Guardando…' : (editando ? 'Guardar cambios' : 'Programar trabajo')}
                    </button>
                    {error && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{error}</span>}
                </div>
            </div>
        </div>
    );
}

// Para buscar operarios hacen falta 3 letras, como en los buscadores de
// servicios. Antes la ventana traia el legajo entero (mas de mil personas) cada
// vez que se abria y tardaba; ahora se busca en la base mientras se escribe.
const MIN_LETRAS_BUSQUEDA = 3;

// Coordinar = elegir que operarios van. Se puede guardar a medias (los que ya
// confirmaron, y el trabajo sigue sin coordinar) o darlo por coordinado aunque
// sean menos de los necesarios: eso lo deciden las de Operaciones.
function CoordinarModal({ trabajo, onClose, onGuardado }) {
    const [elegidos, setElegidos] = useState(() => (trabajo.operarios || []).map((o) => ({ id: o.id, nombre: o.nombre })));
    const [busqueda, setBusqueda] = useState('');
    // La ultima respuesta, con la busqueda que la pidio: si no coincide con lo
    // que hay escrito ahora, todavia se esta buscando.
    const [respuesta, setRespuesta] = useState({ q: '', filas: [], error: '' });
    const [guardando, setGuardando] = useState(false);
    const necesarios = trabajo.operarios_necesarios;
    const yaCoordinado = trabajo.estado === 'coordinado';

    const consulta = busqueda.trim();
    const alcanza = normalizeText(consulta).replace(/[^a-z0-9]/g, '').length >= MIN_LETRAS_BUSQUEDA;
    const buscando = alcanza && respuesta.q !== consulta;

    useEffect(() => {
        if (!alcanza) return;
        const ctrl = new AbortController();
        // Se espera a que se deje de escribir un momento: no una consulta por letra.
        const espera = setTimeout(() => {
            fetch(`/api/trabajos-programados/operarios?q=${encodeURIComponent(consulta)}&service_id=${trabajo.service_id || ''}`, {
                credentials: 'include',
                signal: ctrl.signal,
            })
                .then(async (r) => {
                    const j = await r.json();
                    if (!r.ok) throw new Error(j.error || 'No se pudo buscar.');
                    return j;
                })
                .then((j) => setRespuesta({ q: consulta, filas: Array.isArray(j) ? j : [], error: '' }))
                .catch((e) => {
                    if (e.name !== 'AbortError') setRespuesta({ q: consulta, filas: [], error: e.message || 'Error de red.' });
                });
        }, 250);
        return () => { clearTimeout(espera); ctrl.abort(); };
    }, [consulta, alcanza, trabajo.service_id]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !guardando) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, guardando]);

    const idsElegidos = useMemo(() => new Set(elegidos.map((e) => e.id)), [elegidos]);

    // El servidor ya los manda con los del servicio del trabajo primero. Aca
    // solo se sacan los que ya estan elegidos.
    const resultados = useMemo(
        () => (alcanza && respuesta.q === consulta ? respuesta.filas.filter((e) => !idsElegidos.has(e.id)) : []),
        [alcanza, respuesta, consulta, idsElegidos]
    );

    const iniciales = useMemo(() => new Set((trabajo.operarios || []).map((o) => o.id)), [trabajo.operarios]);
    const huboCambios = elegidos.length !== iniciales.size || elegidos.some((e) => !iniciales.has(e.id));
    const faltan = Math.max(0, necesarios - elegidos.length);
    // Nunca mas gente de la que hace falta: con el cupo lleno se deja de buscar.
    // "Sobran" solo pasa en trabajos coordinados antes de que existiera el tope.
    const completo = elegidos.length >= necesarios;
    const sobran = Math.max(0, elegidos.length - necesarios);

    const agregar = (e) => {
        if (completo) return;
        const nombre = [e.apellido, e.nombre].filter(Boolean).join(', ') + (e.legajo ? ` (leg. ${e.legajo})` : '');
        setElegidos((prev) => [...prev, { id: e.id, nombre }]);
        setBusqueda('');
    };
    const quitar = (id) => setElegidos((prev) => prev.filter((e) => e.id !== id));

    const guardar = async (coordinado) => {
        setGuardando(true);
        try {
            const res = await fetch('/api/trabajos-programados/coordinar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: trabajo.id, operarios: elegidos.map((e) => e.id), coordinado }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'No se pudo guardar.');
            notify.success(
                coordinado
                    ? (yaCoordinado ? 'Operarios actualizados.' : 'Trabajo coordinado.')
                    : (yaCoordinado ? 'Volvió a sin coordinar.' : 'Guardado. Sigue sin coordinar.')
            );
            onGuardado();
        } catch (e) {
            notify.error(e.message || 'Error de red.');
        } finally {
            setGuardando(false);
        }
    };

    // Un lugar por operario que hace falta: se ve de un golpe cuántos faltan.
    // Si sobran (trabajos coordinados antes de que hubiera tope), se muestran
    // en rojo para quitarlos.
    const lugares = Array.from({ length: Math.max(necesarios, elegidos.length) }, (_, i) => elegidos[i] || null);

    return (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
            <div className="modal-content agenda" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ minWidth: 0 }}>
                        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{trabajo.titulo}</h2>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            {trabajo.servicio_nombre || 'Sin servicio'} · {fmtFecha(trabajo.fecha)}
                            {trabajo.hora_inicio && ` · ${fmtHora(trabajo.hora_inicio)}`}
                        </div>
                    </div>
                    <button className="btn btn-secondary" onClick={onClose} disabled={guardando} style={{ padding: '0.3rem 0.6rem' }} aria-label="Cerrar">✕</button>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', margin: '1.1rem 0 0.5rem' }}>
                    <span style={{ fontSize: '0.92rem', fontWeight: 700 }}>Quiénes van</span>
                    <span style={{ fontSize: '0.85rem', color: faltan ? 'var(--tono-ambar)' : 'var(--tono-verde)', fontWeight: 600 }}>
                        {elegidos.length} de {necesarios}
                    </span>
                </div>
                <div className="cupos">
                    {lugares.map((e, i) => (e ? (
                        <div key={e.id} className="cupo" data-lleno="true" data-sobra={i >= necesarios}>
                            <span className="cupo__nombre" title={e.nombre}>{e.nombre}</span>
                            <button type="button" className="cupo__quitar" onClick={() => quitar(e.id)} disabled={guardando} aria-label={`Quitar a ${e.nombre}`}>✕</button>
                        </div>
                    ) : (
                        <div key={`libre-${i}`} className="cupo" data-lleno="false">Libre</div>
                    )))}
                </div>

                {!completo && (
                    <input
                        type="search"
                        className="card"
                        style={{ margin: '0.9rem 0 0', fontWeight: 'normal', width: '100%' }}
                        placeholder="Buscar operario: 3 letras del nombre, apellido o legajo"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        disabled={guardando}
                        autoFocus
                    />
                )}
                {(sobran > 0 || alcanza) && (
                    <div style={{ maxHeight: '240px', overflowY: 'auto', marginTop: '0.4rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                        {sobran > 0 ? (
                            <div style={{ padding: '0.75rem', color: 'var(--error)', fontSize: '0.85rem' }}>
                                Sobran {sobran}: hacen falta {necesarios}. Quitá {sobran === 1 ? 'uno' : sobran} para poder guardar.
                            </div>
                        ) : buscando ? (
                            <div style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Buscando…</div>
                        ) : respuesta.error ? (
                            <div style={{ padding: '0.75rem', color: 'var(--error)', fontSize: '0.85rem' }}>{respuesta.error}</div>
                        ) : resultados.length === 0 ? (
                            <div style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                Nadie con ese nombre o legajo entre los operarios activos.
                            </div>
                        ) : resultados.map((e) => (
                            <button
                                key={e.id}
                                type="button"
                                onClick={() => agregar(e)}
                                disabled={guardando}
                                style={{
                                    display: 'flex', width: '100%', justifyContent: 'space-between', gap: '0.6rem', textAlign: 'left',
                                    padding: '0.6rem 0.8rem', border: 'none', borderBottom: '1px solid var(--border-color)',
                                    background: 'transparent', color: 'var(--text-main)', cursor: 'pointer', fontSize: '0.88rem', font: 'inherit',
                                }}
                            >
                                <span>
                                    {[e.apellido, e.nombre].filter(Boolean).join(', ')}
                                    {e.legajo && <span style={{ color: 'var(--text-muted)' }}> · leg. {e.legajo}</span>}
                                </span>
                                <span style={{ color: e.servicio_id === trabajo.service_id ? 'var(--tono-verde)' : 'var(--text-muted)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                    {e.servicio_id === trabajo.service_id ? 'de este servicio' : (e.servicio_nombre || '')}
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                {elegidos.length > 0 && faltan > 0 && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--tono-ambar)', marginTop: '0.7rem' }}>
                        Faltan {faltan}. Se puede {yaCoordinado ? 'dejar' : 'marcar'} como coordinado igual.
                    </div>
                )}

                <div className="config-modal-actions" style={{ marginTop: '1.2rem', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
                    {yaCoordinado ? (
                        <>
                            <button className="btn btn-secondary" onClick={() => guardar(false)} disabled={guardando || sobran > 0}>
                                Volver a sin coordinar
                            </button>
                            <button className="btn btn-primary" onClick={() => guardar(true)} disabled={guardando || !huboCambios || !elegidos.length || sobran > 0}>
                                {guardando ? 'Guardando…' : 'Guardar cambios'}
                            </button>
                        </>
                    ) : (
                        <>
                            <button className="btn btn-secondary" onClick={() => guardar(false)} disabled={guardando || !huboCambios || sobran > 0}
                                title="Anota a los que ya confirmaron. Los avisos siguen llegando.">
                                Guardar sin coordinar
                            </button>
                            <button className="btn btn-primary" onClick={() => guardar(true)} disabled={guardando || !elegidos.length || sobran > 0}>
                                {guardando ? 'Guardando…' : '✓ Marcar como coordinado'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

const CAMPOS_HISTORIAL = {
    titulo: 'Trabajo',
    descripcion: 'Notas',
    fecha: 'Fecha',
    servicio: 'Servicio',
    supervisor: 'Supervisor',
    operarios_necesarios: 'Operarios que hacen falta',
    hora_inicio: 'Hora de inicio',
    estado: 'Estado',
};

function fraseHistorial(h) {
    if (h.campo === 'creado') return `Cargó el trabajo${h.valor_nuevo ? `: ${h.valor_nuevo}` : ''}`;
    if (h.campo === 'operario_agregado') return `Agregó a ${h.valor_nuevo}`;
    if (h.campo === 'operario_quitado') return `Quitó a ${h.valor_anterior}`;
    if (h.campo === 'anulado') return `Anuló el trabajo${h.valor_nuevo ? `: ${h.valor_nuevo}` : ''}`;
    return `${CAMPOS_HISTORIAL[h.campo] || h.campo}: ${h.valor_anterior || '—'} → ${h.valor_nuevo || '—'}`;
}

// Cada cambio del trabajo, el mas nuevo arriba. Se vuelve a pedir cuando el
// trabajo cambia (updated_at), asi lo que se acaba de guardar aparece.
function HistorialTrabajo({ trabajo }) {
    const [filas, setFilas] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let vivo = true;
        fetch(`/api/trabajos-programados/historial?id=${trabajo.id}`, { credentials: 'include' })
            .then(async (r) => {
                const j = await r.json();
                if (!r.ok) throw new Error(j.error || 'No se pudo cargar el historial.');
                return j;
            })
            .then((j) => { if (vivo) setFilas(j); })
            .catch((e) => { if (vivo) setError(e.message || 'Error de red.'); });
        return () => { vivo = false; };
    }, [trabajo.id, trabajo.updated_at]);

    // Los trabajos cargados antes del 05/10/2026 no tienen su alta en el
    // historial: se arma con lo que guardo el propio trabajo.
    const sinAlta = filas && !filas.some((h) => h.campo === 'creado');

    return (
        <div className="agenda-historial">
            {error ? (
                <div style={{ color: 'var(--error)' }}>{error}</div>
            ) : !filas ? (
                <div style={{ color: 'var(--text-muted)' }}>Cargando historial…</div>
            ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.25rem' }}>
                    {filas.map((h) => (
                        <li key={h.id}>
                            <span style={{ color: 'var(--text-muted)' }}>{fmtFechaHora(h.created_at)} · {h.usuario || '—'} · </span>
                            {fraseHistorial(h)}
                        </li>
                    ))}
                    {sinAlta && (
                        <li>
                            <span style={{ color: 'var(--text-muted)' }}>{fmtFechaHora(trabajo.created_at)} · {trabajo.creado_por || '—'} · </span>
                            Cargó el trabajo
                            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                Los cambios anteriores al 05/10/2026 no quedaron registrados.
                            </div>
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}
