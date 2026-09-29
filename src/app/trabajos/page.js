'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { useCatalog } from '@/lib/CatalogContext';
import { getSessionUser } from '@/lib/session';
import { notify } from '@/lib/toast';
import { normalizeText } from '@/lib/search';
import SearchableSelect from '@/components/SearchableSelect';
import ActivarNotificaciones from '@/components/ActivarNotificaciones';

// Trabajos programados: los especiales que se acuerdan con el cliente para una
// fecha (vidrios, tanques, pisos).
//
// La pantalla responde una sola pregunta: que se viene y si ya esta resuelto.
// Por eso lo primero que se ve es cuantos dias faltan y quien falta conseguir,
// y no una tabla de datos.

const hoyISO = () => new Date().toISOString().slice(0, 10);

// 'YYYY-MM-DD' -> '15/10/2026'. Se parte el string y no se usa Date: en
// Argentina new Date('2026-10-15') cae un dia antes.
function fmtFecha(ymd) {
    if (!ymd) return '';
    const [a, m, d] = String(ymd).slice(0, 10).split('-');
    return a && m && d ? `${d}/${m}/${a}` : '';
}

// Cuantos dias faltan. Se compara en UTC a mediodia para que el cambio de
// horario no corra el resultado un dia.
function diasHasta(ymd) {
    if (!ymd) return null;
    const [a, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
    const objetivo = Date.UTC(a, m - 1, d, 12);
    const [ha, hm, hd] = hoyISO().split('-').map(Number);
    const hoy = Date.UTC(ha, hm - 1, hd, 12);
    return Math.round((objetivo - hoy) / 86400000);
}

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

export default function TrabajosPage() {
    const { services = [] } = useCatalog();
    const [trabajos, setTrabajos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [modal, setModal] = useState(null);       // null | 'nuevo' | el trabajo a editar
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
            notify.success(estado === 'coordinado' ? 'Marcado como coordinado.' : 'Actualizado.');
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
                                            {fmtFecha(t.fecha)}
                                            {cuando.texto && (
                                                <strong style={{ color: cuando.color }}> · {cuando.texto}</strong>
                                            )}
                                        </span>
                                    </div>

                                    <div style={{ fontSize: '0.88rem', marginTop: '0.25rem' }}>
                                        {t.servicio_nombre || 'Sin servicio'}
                                        <span style={{ color: 'var(--text-muted)' }}>
                                            {' · '}{t.operarios_necesarios} {t.operarios_necesarios === 1 ? 'operario' : 'operarios'}
                                        </span>
                                    </div>

                                    {t.descripcion && (
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                            {t.descripcion}
                                        </div>
                                    )}

                                    {t.coordinado_por && (
                                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>
                                            Coordinado por {t.coordinado_por}
                                        </div>
                                    )}

                                    {puedeEditar && (
                                        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                                            {t.estado === 'pendiente' && (
                                                <button className="btn btn-primary" style={{ padding: '0.25rem 0.7rem', fontSize: '0.8rem' }}
                                                    onClick={() => cambiarEstado(t, 'coordinado')}>
                                                    ✓ Ya lo coordiné
                                                </button>
                                            )}
                                            {t.estado === 'coordinado' && (
                                                <button className="btn btn-secondary" style={{ padding: '0.25rem 0.7rem', fontSize: '0.8rem' }}
                                                    onClick={() => cambiarEstado(t, 'hecho')}>
                                                    Marcar como hecho
                                                </button>
                                            )}
                                            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.7rem', fontSize: '0.8rem' }}
                                                onClick={() => setModal(t)}>
                                                Editar
                                            </button>
                                            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem', color: 'var(--error)', marginLeft: 'auto' }}
                                                onClick={() => anular(t)}>
                                                🗑️
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {modal && (
                    <TrabajoModal
                        trabajo={modal === 'nuevo' ? null : modal}
                        services={services}
                        onClose={() => setModal(null)}
                        onGuardado={() => { setModal(null); cargar(verHechos); }}
                    />
                )}
            </div>
        </MainLayout>
    );
}

function TrabajoModal({ trabajo, services, onClose, onGuardado }) {
    const editando = Boolean(trabajo);
    const [serviceId, setServiceId] = useState(trabajo?.service_id ? String(trabajo.service_id) : '');
    const [titulo, setTitulo] = useState(trabajo?.titulo || '');
    const [descripcion, setDescripcion] = useState(trabajo?.descripcion || '');
    const [fecha, setFecha] = useState(trabajo?.fecha || '');
    const [operarios, setOperarios] = useState(String(trabajo?.operarios_necesarios || 1));
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

    const nOperarios = Math.trunc(Number(operarios)) || 0;
    const error = !serviceId ? 'Elegí el servicio.'
        : !titulo.trim() ? 'Poné qué trabajo es.'
            : !fecha ? 'Elegí la fecha.'
                : nOperarios < 1 ? 'Tiene que ser 1 operario o más.'
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
                operarios_necesarios: nOperarios,
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

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <label style={{ ...labelEstilo, flex: '1 1 150px' }}>
                            Fecha del trabajo
                            <input type="date" className="card" style={inputCard} value={fecha} onChange={(e) => setFecha(e.target.value)} />
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
