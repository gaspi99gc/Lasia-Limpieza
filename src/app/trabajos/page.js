'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { useCatalog } from '@/lib/CatalogContext';
import { getSessionUser } from '@/lib/session';
import { notify } from '@/lib/toast';
import { normalizeText } from '@/lib/search';
import SearchableSelect from '@/components/SearchableSelect';
import ActivarNotificaciones from '@/components/ActivarNotificaciones';
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
    if (dias === null) return { texto: '', color: 'var(--text-muted)' };
    if (dias < 0) return { texto: `hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'día' : 'días'}`, color: 'var(--text-muted)' };
    if (dias === 0) return { texto: 'HOY', color: '#B91C1C' };
    if (dias === 1) return { texto: 'MAÑANA', color: '#B91C1C' };
    if (dias <= 3) return { texto: `en ${dias} días`, color: '#B45309' };
    if (dias <= 7) return { texto: `en ${dias} días`, color: '#B45309' };
    return { texto: `en ${dias} días`, color: 'var(--text-muted)' };
}

const ESTADOS = {
    pendiente: { label: 'Sin coordinar', bg: '#FFFBEB', fg: '#B45309', border: '#FCD34D' },
    coordinado: { label: 'Coordinado', bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
    hecho: { label: 'Hecho', bg: '#F3F4F6', fg: '#374151', border: '#E5E7EB' },
    cancelado: { label: 'Cancelado', bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
};

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

    const visibles = useMemo(() => {
        const q = normalizeText(busqueda);
        if (!q) return trabajos;
        return trabajos.filter((t) =>
            normalizeText(`${t.titulo} ${t.servicio_nombre || ''} ${t.descripcion || ''}`).includes(q));
    }, [trabajos, busqueda]);

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
            notify.success(estado === 'hecho' ? 'Marcado como hecho.' : 'Actualizado.');
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

    return (
        <MainLayout>
            <div className="config-view">
                <header className="page-header" style={{ marginBottom: '1rem', alignItems: 'center' }}>
                    <h1 style={{ margin: 0 }}>Trabajos programados</h1>
                    {puedeEditar && (
                        <button className="btn btn-primary" onClick={() => setModal('nuevo')}>
                            + Nuevo trabajo
                        </button>
                    )}
                </header>

                {/* Acá y no en configuración: es la pantalla donde importa que
                    los avisos lleguen, así que es donde se acuerda de activarlos. */}
                <ActivarNotificaciones />

                {/* Lo que se viene sin resolver: es la razón de ser de la pantalla. */}
                {!cargando && urgentes > 0 && (
                    <div className="card" style={{ padding: '0.85rem 1.1rem', marginBottom: '1rem', background: '#FFFBEB', border: '1px solid #FCD34D', color: '#92400E', fontSize: '0.9rem' }}>
                        <strong>{urgentes}</strong> {urgentes === 1 ? 'trabajo' : 'trabajos'} en los próximos 7 días
                        {urgentes === 1 ? ' está' : ' están'} sin coordinar.
                    </div>
                )}

                <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                        type="text"
                        className="card"
                        style={{ flex: '1 1 260px', margin: 0, fontWeight: 'normal' }}
                        placeholder="🔍 Buscar por trabajo o servicio…"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <input type="checkbox" checked={verHechos} onChange={(e) => setVerHechos(e.target.checked)} />
                        Ver los terminados
                    </label>
                </div>

                {cargando ? (
                    <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>
                ) : error ? (
                    <div className="card" style={{ padding: '1.5rem', color: 'var(--error)' }}>{error}</div>
                ) : visibles.length === 0 ? (
                    <div className="card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📋</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>
                            {busqueda ? 'Nada coincide con la búsqueda' : 'No hay trabajos programados'}
                        </div>
                        {!busqueda && puedeEditar && (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '0.3rem' }}>
                                Cargá el primero con “+ Nuevo trabajo”.
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {visibles.map((t) => {
                            const dias = diasHasta(t.fecha);
                            const cuando = cuandoEs(dias);
                            const est = ESTADOS[t.estado] || ESTADOS.pendiente;
                            const urgente = t.estado === 'pendiente' && dias !== null && dias >= 0 && dias <= 7;
                            return (
                                <div
                                    key={t.id}
                                    className="card"
                                    style={{
                                        padding: '0.85rem 1.1rem',
                                        borderLeft: `4px solid ${urgente ? '#F59E0B' : est.fg}`,
                                        opacity: t.estado === 'hecho' || t.estado === 'cancelado' ? 0.6 : 1,
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.98rem' }}>{t.titulo}</span>
                                        <span style={{
                                            fontSize: '0.72rem', fontWeight: 700, padding: '0.1rem 0.45rem',
                                            borderRadius: '99px', background: est.bg, color: est.fg, border: `1px solid ${est.border}`,
                                        }}>
                                            {est.label}
                                        </span>
                                        <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            {fmtFecha(t.fecha)}{t.hora_inicio && ` · ${fmtHora(t.hora_inicio)}`}
                                            {cuando.texto && (
                                                <strong style={{ color: cuando.color }}> · {cuando.texto}</strong>
                                            )}
                                        </span>
                                    </div>

                                    <div style={{ fontSize: '0.88rem', marginTop: '0.25rem' }}>
                                        {t.servicio_nombre || 'Sin servicio'}
                                        <span style={{ color: 'var(--text-muted)' }}>
                                            {' · '}{t.operarios_necesarios} {t.operarios_necesarios === 1 ? 'operario' : 'operarios'}
                                            {t.supervisor_nombre && <>{' · '}Supervisor: {t.supervisor_nombre}</>}
                                        </span>
                                    </div>

                                    {t.descripcion && (
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                            {t.descripcion}
                                        </div>
                                    )}

                                    {t.operarios?.length > 0 && (
                                        <div style={{ fontSize: '0.84rem', marginTop: '0.3rem' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>
                                                {t.estado === 'pendiente' ? 'Confirmados hasta ahora' : 'Van'}
                                                {' '}({t.operarios.length} de {t.operarios_necesarios}):{' '}
                                            </span>
                                            {t.operarios.map((o) => o.nombre).join(' · ')}
                                        </div>
                                    )}

                                    {t.coordinado_por && (
                                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>
                                            Coordinado por {t.coordinado_por}
                                        </div>
                                    )}

                                    {(() => {
                                        const avisos = estadoAvisos(t);
                                        if (!avisos.length) return null;
                                        return (
                                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                                                🔔 Avisos:{' '}
                                                {avisos.map((a, i) => (
                                                    <span key={a.etiqueta} style={{ color: a.tono === 'mal' ? 'var(--error)' : undefined }}>
                                                        {i > 0 && ' · '}{a.etiqueta}: {a.texto}
                                                    </span>
                                                ))}
                                            </div>
                                        );
                                    })()}

                                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                                        {puedeEditar && t.estado === 'pendiente' && (
                                            <button className="btn btn-primary" style={{ padding: '0.25rem 0.7rem', fontSize: '0.8rem' }}
                                                onClick={() => setCoordinando(t)}>
                                                ✓ Coordinar
                                            </button>
                                        )}
                                        {puedeEditar && t.estado === 'coordinado' && (
                                            <>
                                                <button className="btn btn-secondary" style={{ padding: '0.25rem 0.7rem', fontSize: '0.8rem' }}
                                                    onClick={() => setCoordinando(t)}>
                                                    Operarios
                                                </button>
                                                <button className="btn btn-secondary" style={{ padding: '0.25rem 0.7rem', fontSize: '0.8rem' }}
                                                    onClick={() => cambiarEstado(t, 'hecho')}>
                                                    Marcar como hecho
                                                </button>
                                            </>
                                        )}
                                        {puedeEditar && (
                                            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.7rem', fontSize: '0.8rem' }}
                                                onClick={() => setModal(t)}>
                                                Editar
                                            </button>
                                        )}
                                        <button className="btn btn-secondary" style={{ padding: '0.25rem 0.7rem', fontSize: '0.8rem' }}
                                            onClick={() => setHistorialDe(historialDe === t.id ? null : t.id)}>
                                            {historialDe === t.id ? 'Ocultar historial' : 'Historial'}
                                        </button>
                                        {puedeEditar && (
                                            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem', color: 'var(--error)', marginLeft: 'auto' }}
                                                onClick={() => anular(t)}>
                                                🗑️
                                            </button>
                                        )}
                                    </div>

                                    {historialDe === t.id && <HistorialTrabajo trabajo={t} />}
                                </div>
                            );
                        })}
                    </div>
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
    const labelEstilo = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 };

    return (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
            <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{editando ? 'Editar trabajo' : 'Nuevo trabajo'}</h2>
                    <button className="btn btn-secondary" onClick={onClose} disabled={guardando} style={{ padding: '0.3rem 0.6rem' }}>✕</button>
                </div>

                <div style={{ display: 'grid', gap: '0.85rem', marginTop: '1.1rem' }}>
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

                    <div style={labelEstilo}>
                        <span>Supervisor (recibe los avisos para estar al tanto)</span>
                        <SearchableSelect
                            options={opcionesSupervisor}
                            value={supervisorId}
                            onChange={(v) => setSupervisorId(String(v || ''))}
                            placeholder="Sin supervisor (avisa solo a Operaciones)"
                        />
                        <span style={{ fontWeight: 400, fontSize: '0.76rem' }}>
                            Coordinan las de Operaciones: les llega a las dos 7 y 2 días antes, mientras siga sin coordinar.
                            Ya coordinado, el día anterior les llega a todos quiénes van.
                        </span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <label style={{ ...labelEstilo, flex: '1 1 150px' }}>
                            Fecha del trabajo
                            <input type="date" className="card" style={inputCard} value={fecha} onChange={(e) => setFecha(e.target.value)} />
                        </label>
                        <label style={{ ...labelEstilo, flex: '1 1 110px' }}>
                            Hora de inicio
                            <input type="time" className="card" style={inputCard} value={hora} onChange={(e) => setHora(e.target.value)} />
                        </label>
                        <label style={{ ...labelEstilo, flex: '1 1 120px' }}>
                            Operarios que hacen falta
                            <input type="number" min="1" step="1" className="card"
                                style={{ ...inputCard, textAlign: 'right', fontWeight: 700 }}
                                value={operarios} onChange={(e) => setOperarios(e.target.value)} />
                        </label>
                    </div>

                    <label style={labelEstilo}>
                        Notas (opcional)
                        <textarea rows={2} className="card" style={{ ...inputCard, resize: 'vertical' }}
                            placeholder="Detalles del trabajo, a quién avisar, etc."
                            value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
                    </label>
                </div>

                <div className="config-modal-actions" style={{ marginTop: '1.25rem', alignItems: 'center', gap: '0.6rem' }}>
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

    return (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
            <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '540px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Coordinar: {trabajo.titulo}</h2>
                        <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            {trabajo.servicio_nombre || 'Sin servicio'} · {fmtFecha(trabajo.fecha)}
                            {trabajo.hora_inicio && ` · ${fmtHora(trabajo.hora_inicio)}`} · hacen falta {necesarios}
                        </div>
                    </div>
                    <button className="btn btn-secondary" onClick={onClose} disabled={guardando} style={{ padding: '0.3rem 0.6rem' }}>✕</button>
                </div>

                <div style={{ marginTop: '1rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Van: {elegidos.length} de {necesarios}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem', minHeight: '1.8rem' }}>
                    {elegidos.length === 0 && (
                        <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Todavía no elegiste a nadie. Buscalos abajo.
                        </span>
                    )}
                    {elegidos.map((e) => (
                        <span key={e.id} style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem',
                            padding: '0.2rem 0.3rem 0.2rem 0.6rem', borderRadius: '99px',
                            background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0',
                        }}>
                            {e.nombre}
                            <button type="button" onClick={() => quitar(e.id)} disabled={guardando} aria-label={`Quitar a ${e.nombre}`}
                                style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '0.85rem', padding: '0 0.2rem' }}>
                                ✕
                            </button>
                        </span>
                    ))}
                </div>

                {!completo && (
                <input
                    type="text"
                    className="card"
                    style={{ margin: '0.85rem 0 0', fontWeight: 'normal', width: '100%' }}
                    placeholder="🔍 Escribí 3 letras del nombre, apellido o legajo…"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    disabled={guardando}
                />
                )}
                <div style={{ maxHeight: '260px', overflowY: 'auto', marginTop: completo ? '0.85rem' : '0.4rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                    {sobran > 0 ? (
                        <div style={{ padding: '0.75rem', color: 'var(--error)', fontSize: '0.85rem' }}>
                            Sobran {sobran}: hacen falta {necesarios}. Quitá {sobran === 1 ? 'uno' : sobran} de arriba para poder guardar.
                        </div>
                    ) : completo ? (
                        <div style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Ya están los {necesarios} que hacen falta. Para cambiar a alguien, quitalo de arriba.
                        </div>
                    ) : !alcanza ? (
                        <div style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Escribí al menos 3 letras para buscar en el legajo.
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
                                padding: '0.5rem 0.75rem', border: 'none', borderBottom: '1px solid var(--border-color)',
                                background: 'transparent', color: 'var(--text-main)', cursor: 'pointer', fontSize: '0.88rem',
                            }}
                        >
                            <span>
                                + {[e.apellido, e.nombre].filter(Boolean).join(', ')}
                                {e.legajo && <span style={{ color: 'var(--text-muted)' }}> · leg. {e.legajo}</span>}
                            </span>
                            <span style={{ color: e.servicio_id === trabajo.service_id ? '#047857' : 'var(--text-muted)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                {e.servicio_id === trabajo.service_id ? 'de este servicio' : (e.servicio_nombre || '')}
                            </span>
                        </button>
                    ))}
                </div>

                {elegidos.length > 0 && faltan > 0 && (
                    <div style={{ fontSize: '0.8rem', color: '#B45309', marginTop: '0.6rem' }}>
                        Faltan {faltan}. Se puede {yaCoordinado ? 'dejar' : 'marcar'} como coordinado igual.
                    </div>
                )}

                <div className="config-modal-actions" style={{ marginTop: '1.1rem', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
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
        <div style={{ marginTop: '0.6rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', fontSize: '0.8rem' }}>
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
