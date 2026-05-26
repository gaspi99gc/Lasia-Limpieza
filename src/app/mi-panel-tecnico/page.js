'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { AttachmentThumbs } from '@/components/AttachmentViewer';
import IncidentNotesThread from '@/components/IncidentNotesThread';
import { getSessionUser } from '@/lib/session';
import { formatArgentinaDate } from '@/lib/datetime';
import { notify } from '@/lib/toast';

const INCIDENT_ESTADOS = {
    abierta: { label: 'Abierta', bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
    en_revision: { label: 'En revisión', bg: '#FFFBEB', fg: '#B45309', border: '#FCD34D' },
    reparada: { label: 'Reparada', bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
    reemplazada: { label: 'Reemplazada', bg: '#F1F5F9', fg: '#475569', border: '#CBD5E1' },
    descartada: { label: 'Descartada', bg: '#F8FAFC', fg: '#94A3B8', border: '#E2E8F0' },
    completada: { label: 'Completada', bg: '#ECFDF5', fg: '#065F46', border: '#6EE7B7' },
};
const ESTADOS_LIST = ['abierta', 'en_revision', 'reparada', 'reemplazada', 'descartada', 'completada'];

function EstadoBadge({ estado }) {
    const e = INCIDENT_ESTADOS[estado] || INCIDENT_ESTADOS.abierta;
    return (
        <span style={{
            display: 'inline-block', padding: '0.18rem 0.55rem', borderRadius: '999px',
            fontSize: '0.72rem', fontWeight: 700,
            background: e.bg, color: e.fg, border: `1px solid ${e.border}`, whiteSpace: 'nowrap',
        }}>
            {e.label}
        </span>
    );
}

function PanelContent() {
    const params = useSearchParams();
    const tab = params.get('tab') === 'incidencias' ? 'incidencias' : 'pedidos';

    return (
        <div>
            <header className="page-header" style={{ marginBottom: '1.5rem' }}>
                <div>
                    <h1>{tab === 'incidencias' ? 'Incidencias' : 'Pedidos'}</h1>
                </div>
            </header>

            {tab === 'pedidos' ? <PedidosTab /> : <IncidenciasTab />}
        </div>
    );
}

export default function MiPanelTecnicoPage() {
    return (
        <MainLayout>
            <Suspense fallback={null}>
                <PanelContent />
            </Suspense>
        </MainLayout>
    );
}

function PedidoDrawer({ request, onClose, onToggleFaltante, onMarkComplete, saving, togglingItemId }) {
    if (!request) return null;
    const faltantesCount = (request.items || []).filter(i => i.faltante).length;

    return (
        <>
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999,
                }}
            />
            <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000,
                maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                background: 'var(--color-surface)', borderRadius: '20px 20px 0 0',
                boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
            }}>
                {/* Handle */}
                <div style={{ display: 'flex', justifyContent: 'center', padding: '0.75rem 0 0' }}>
                    <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: 'var(--border-color)' }} />
                </div>

                {/* Header */}
                <div style={{ padding: '0.75rem 1.25rem 0.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '1.05rem' }}>{request.service_name || 'Sin servicio'}</strong>
                            {request.urgent && (
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--error)', border: '1px solid var(--error)', borderRadius: '999px', padding: '0.1rem 0.5rem' }}>URGENTE</span>
                            )}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                            Pedido #{request.id} · {formatArgentinaDate(request.created_at)}
                            {(request.supervisor_surname || request.supervisor_name) && ` · ${(request.supervisor_surname || '') + ' ' + (request.supervisor_name || '')}`.trim()}
                        </div>
                        {faltantesCount > 0 && (
                            <div style={{ fontSize: '0.75rem', color: '#B91C1C', fontWeight: 600, marginTop: '0.2rem' }}>
                                {faltantesCount} faltante{faltantesCount !== 1 ? 's' : ''} marcado{faltantesCount !== 1 ? 's' : ''}
                            </div>
                        )}
                    </div>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1, padding: '0.1rem 0.3rem' }}>×</button>
                </div>

                {(request.service_address || request.service_encargado_telefono || request.service_encargado_nombre) && (
                    <div style={{ padding: '0.6rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'var(--color-muted-surface)' }}>
                        {request.service_address && (
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                📍 {request.service_address}
                            </div>
                        )}
                        {request.service_encargado_telefono && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <div style={{ fontSize: '0.82rem', color: 'var(--text-main)' }}>
                                    <strong>Encargado:</strong> {request.service_encargado_nombre || 'sin nombre'}
                                </div>
                                <a
                                    href={`https://wa.me/${request.service_encargado_telefono}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                        background: '#25D366', color: '#fff', fontWeight: 700,
                                        fontSize: '0.8rem', padding: '0.35rem 0.75rem', borderRadius: '999px',
                                        textDecoration: 'none',
                                    }}
                                >
                                    💬 WhatsApp
                                </a>
                            </div>
                        )}
                    </div>
                )}

                {/* Items list — scrollable */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.25rem' }}>
                    {(request.items || []).length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Sin insumos registrados.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            {(request.items || []).map(item => (
                                <div key={item.id} style={{
                                    borderRadius: '10px', padding: '0.7rem 0.9rem',
                                    background: item.faltante ? '#FEF2F2' : 'var(--color-muted-surface)',
                                    border: `1px solid ${item.faltante ? '#FECACA' : 'var(--border-color)'}`,
                                }}>
                                    {/* Fila 1: nombre + badges */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                                        <span style={{
                                            fontWeight: 600, fontSize: '0.92rem',
                                            textDecoration: item.faltante ? 'line-through' : 'none',
                                            color: item.faltante ? '#B91C1C' : 'var(--text-main)',
                                        }}>
                                            {item.nombre || 'Insumo'}
                                        </span>
                                        {item.faltante && (
                                            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#B91C1C', border: '1px solid #FECACA', background: '#fff', borderRadius: '999px', padding: '0.1rem 0.45rem' }}>FALTANTE</span>
                                        )}
                                        {item.agregado && (
                                            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#047857', border: '1px solid #A7F3D0', background: '#ECFDF5', borderRadius: '999px', padding: '0.1rem 0.45rem' }}>AGREGADO</span>
                                        )}
                                    </div>
                                    {/* Fila 2: cantidad + botón */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            <strong style={{ color: 'var(--text-main)' }}>{item.cantidad}</strong>
                                            {item.unidad ? ` ${item.unidad}` : ''}
                                        </span>
                                        <button
                                            type="button"
                                            disabled={togglingItemId === item.id}
                                            onClick={() => onToggleFaltante(item, request)}
                                            style={{
                                                fontSize: '0.78rem', padding: '0.3rem 0.75rem', borderRadius: '8px', fontWeight: 600,
                                                border: `1px solid ${item.faltante ? '#FECACA' : 'var(--border-color)'}`,
                                                background: item.faltante ? '#fff' : 'var(--color-surface)',
                                                color: item.faltante ? '#B91C1C' : 'var(--text-main)',
                                                cursor: togglingItemId === item.id ? 'not-allowed' : 'pointer',
                                                opacity: togglingItemId === item.id ? 0.6 : 1,
                                            }}
                                        >
                                            {togglingItemId === item.id ? 'Guardando...' : (item.faltante ? 'Quitar faltante' : 'Marcar faltante')}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {request.notas?.trim() && (
                        <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)', padding: '0.6rem 0.8rem', background: 'var(--color-muted-surface)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <strong style={{ color: 'var(--text-main)' }}>Notas:</strong> {request.notas}
                        </div>
                    )}
                </div>

                {/* Footer sticky */}
                <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)' }}>
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={saving}
                        onClick={() => onMarkComplete(request)}
                        style={{ width: '100%', background: '#10B981', fontSize: '1rem', padding: '0.75rem' }}
                    >
                        {saving ? 'Guardando...' : '✓ Marcar como entregado'}
                    </button>
                </div>
            </div>
        </>
    );
}

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');
const normalize = s => (s || '').toString().toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '');

function PedidosTab() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [savingId, setSavingId] = useState(null);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [togglingItemId, setTogglingItemId] = useState(null);
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/supply-requests?status=revisado');
            if (!res.ok) throw new Error('No se pudieron cargar los pedidos.');
            const data = await res.json();
            setRequests(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const updateItemInState = (requestId, itemId, patch) => {
        const updater = items => items.map(it => it.id === itemId ? { ...it, ...patch } : it);
        setRequests(prev => prev.map(r => r.id !== requestId ? r : { ...r, items: updater(r.items || []) }));
        setSelectedRequest(prev => prev?.id === requestId ? { ...prev, items: updater(prev.items || []) } : prev);
    };

    const toggleFaltante = async (item, request) => {
        const user = getSessionUser();
        const nuevo = !item.faltante;
        setTogglingItemId(item.id);
        updateItemInState(request.id, item.id, { faltante: nuevo });
        try {
            const res = await fetch('/api/supply-requests/items', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_id: item.id,
                    faltante: nuevo,
                    marcado_por: user ? `${user.name} ${user.surname}` : null,
                }),
            });
            if (!res.ok) throw new Error('No se pudo actualizar el ítem.');
        } catch (e) {
            updateItemInState(request.id, item.id, { faltante: !nuevo });
            notify.error(e.message);
        } finally {
            setTogglingItemId(null);
        }
    };

    const markComplete = async (request) => {
        const { default: Swal } = await import('sweetalert2');
        const confirmed = await Swal.fire({
            title: '¿Marcar como entregado?',
            text: `Pedido del servicio ${request.service_name || ''} quedará completado.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, entregado',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#10B981',
        });
        if (!confirmed.isConfirmed) return;

        const user = getSessionUser();
        setSavingId(request.id);
        try {
            const res = await fetch('/api/supply-requests', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    request_id: request.id,
                    status: 'cerrado',
                    completed_by: user ? `${user.name} ${user.surname}` : null,
                    provider_id: request.provider_id || null,
                }),
            });
            if (!res.ok) throw new Error('No se pudo completar el pedido.');
            setRequests(prev => prev.filter(r => r.id !== request.id));
            setSelectedRequest(null);
        } catch (e) {
            await Swal.fire({ title: 'Error', text: e.message, icon: 'error', confirmButtonColor: '#ef4444' });
        } finally {
            setSavingId(null);
        }
    };

    const q = normalize(search.trim());
    const filtered = !q ? requests : requests.filter(req => {
        const haystack = [
            req.service_name,
            req.supervisor_name,
            req.supervisor_surname,
            `#${req.id}`,
            String(req.id),
            ...(req.items || []).map(i => i.nombre),
        ].map(normalize).join(' ');
        return haystack.includes(q);
    });

    return (
        <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Tocá un pedido para ver los insumos y marcar faltantes. Cuando entregues, marcalo como completado.
            </p>

            {/* Barra de búsqueda */}
            {!loading && requests.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none', display: 'flex' }}>
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                        </span>
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por servicio, supervisor, n° de pedido o insumo..."
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                padding: '0.75rem 2.5rem 0.75rem 2.6rem',
                                fontSize: '1rem', borderRadius: '12px',
                                border: '1px solid var(--border-color)', background: 'var(--color-surface)',
                                color: 'var(--text-main)', outline: 'none',
                            }}
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                aria-label="Limpiar búsqueda"
                                style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'var(--color-muted-surface)', border: '1px solid var(--border-color)', borderRadius: '999px', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1 }}
                            >
                                ×
                            </button>
                        )}
                    </div>
                    {q && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                            Mostrando {filtered.length} de {requests.length} pedido{requests.length !== 1 ? 's' : ''}
                        </div>
                    )}
                </div>
            )}

            {error && <div style={{ color: 'var(--error)', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

            {loading ? (
                <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Cargando...</div>
            ) : requests.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: 'var(--text-muted)' }}>
                    No hay pedidos pendientes de entrega.
                </div>
            ) : filtered.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: 'var(--text-muted)' }}>
                    <p style={{ marginBottom: '1rem' }}>No se encontraron pedidos para «{search.trim()}».</p>
                    <button type="button" className="btn btn-secondary" onClick={() => setSearch('')}>Limpiar búsqueda</button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {filtered.map(req => {
                        const faltantes = (req.items || []).filter(i => i.faltante).length;
                        const totalItems = (req.items || []).length;
                        return (
                            <div
                                key={req.id}
                                onClick={() => setSelectedRequest(req)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    padding: '0.75rem 1rem', borderRadius: '12px',
                                    background: 'var(--color-surface)', border: '1px solid var(--border-color)',
                                    cursor: 'pointer', userSelect: 'none',
                                }}
                            >
                                {/* Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                        <strong style={{ fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {req.service_name || 'Sin servicio'}
                                        </strong>
                                        {req.urgent && (
                                            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--error)', border: '1px solid var(--error)', borderRadius: '999px', padding: '0.05rem 0.4rem', flexShrink: 0 }}>URGENTE</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <span>#{req.id} · {formatArgentinaDate(req.created_at)}{(req.supervisor_surname || req.supervisor_name) ? ` · ${req.supervisor_surname || ''} ${req.supervisor_name || ''}`.trim() : ''}</span>
                                        <span style={{ color: faltantes > 0 ? '#B91C1C' : 'var(--text-muted)', fontWeight: faltantes > 0 ? 600 : 400 }}>
                                            {totalItems} insumo{totalItems !== 1 ? 's' : ''}{faltantes > 0 ? ` · ${faltantes} faltante${faltantes !== 1 ? 's' : ''}` : ''}
                                        </span>
                                    </div>
                                </div>
                                {/* Entregado button — stopPropagation para no abrir el drawer */}
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    disabled={savingId === req.id}
                                    onClick={e => { e.stopPropagation(); markComplete(req); }}
                                    style={{ background: '#10B981', fontSize: '0.8rem', padding: '0.4rem 0.75rem', flexShrink: 0, whiteSpace: 'nowrap' }}
                                >
                                    {savingId === req.id ? '...' : '✓ Entregado'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            <PedidoDrawer
                request={selectedRequest}
                onClose={() => setSelectedRequest(null)}
                onToggleFaltante={toggleFaltante}
                onMarkComplete={markComplete}
                saving={savingId === selectedRequest?.id}
                togglingItemId={togglingItemId}
            />
        </div>
    );
}

function IncidenciasTab() {
    const [incidents, setIncidents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [savingId, setSavingId] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/machine-incidents');
            if (!res.ok) throw new Error('No se pudieron cargar las incidencias.');
            const data = await res.json();
            setIncidents(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const changeEstado = async (incident, nuevoEstado) => {
        if (nuevoEstado === incident.estado) return;
        if (nuevoEstado === 'completada' && incident.tipo_falla === 'Traspaso') {
            const destName = incident.service_destino_name || `servicio #${incident.service_destino_id}`;
            const ok = confirm(`Esto va a transferir la máquina "${incident.machine_nombre}" desde "${incident.service_name}" hacia "${destName}". ¿Continuar?`);
            if (!ok) return;
        }
        setSavingId(incident.id);
        try {
            const res = await fetch(`/api/machine-incidents/${incident.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: nuevoEstado }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'No se pudo actualizar la incidencia.');
            }
            await load();
        } catch (e) {
            notify.error(e.message);
        } finally {
            setSavingId(null);
        }
    };

    const visibleIncidents = incidents.filter(i => i.estado === 'abierta' || i.estado === 'en_revision');

    return (
        <div>
            <div style={{ marginBottom: '1.25rem' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                    Incidencias reportadas por los supervisores. Cambiá el estado a medida que las atendés.
                </p>
            </div>

            {error && <div style={{ color: 'var(--error)', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

            {loading ? (
                <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Cargando...</div>
            ) : visibleIncidents.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: 'var(--text-muted)' }}>
                    No hay incidencias para mostrar.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {visibleIncidents.map(inc => (
                        <IncidentCard
                            key={inc.id}
                            incident={inc}
                            savingId={savingId}
                            onChangeEstado={changeEstado}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function IncidentCard({ incident, savingId, onChangeEstado }) {
    const isTraspaso = incident.tipo_falla === 'Traspaso';
    const estadoStyle = INCIDENT_ESTADOS[incident.estado] || INCIDENT_ESTADOS.abierta;

    return (
        <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '1rem' }}>{incident.machine_nombre || 'Máquina'}</strong>
                        {incident.tipo_falla && (
                            <span style={{ display: 'inline-block', padding: '0.12rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600, background: isTraspaso ? '#FEF3C7' : '#EFF6FF', color: isTraspaso ? '#92400E' : '#1D4ED8', border: `1px solid ${isTraspaso ? '#FDE68A' : '#BFDBFE'}` }}>
                                {incident.tipo_falla}
                                {isTraspaso && incident.service_destino_name && ` → ${incident.service_destino_name}`}
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {incident.service_name || 'Sin servicio'} · {formatArgentinaDate(incident.created_at)}
                    </div>
                    {incident.reportado_por_nombre && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                            Reportada por: <strong style={{ color: 'var(--text-main)' }}>{incident.reportado_por_nombre}</strong>
                            {incident.reportado_por_dni ? ` · DNI ${incident.reportado_por_dni}` : ''}
                        </div>
                    )}
                </div>
                <select
                    value={incident.estado}
                    disabled={savingId === incident.id}
                    onChange={e => onChangeEstado(incident, e.target.value)}
                    style={{
                        padding: '0.3rem 0.6rem',
                        borderRadius: '999px',
                        border: `1px solid ${estadoStyle.border}`,
                        background: estadoStyle.bg,
                        color: estadoStyle.fg,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        outline: 'none',
                    }}
                >
                    {ESTADOS_LIST.map(k => (
                        <option key={k} value={k} style={{ color: '#000' }}>
                            {INCIDENT_ESTADOS[k]?.label || k}
                        </option>
                    ))}
                </select>
            </div>

            <div style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>{incident.descripcion}</div>
            {incident.nota_interna && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
                    <strong style={{ color: 'var(--text-main)' }}>Nota:</strong> {incident.nota_interna}
                </div>
            )}

            {incident.attachments && incident.attachments.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                    <AttachmentThumbs attachments={incident.attachments} size={80} />
                </div>
            )}

            <IncidentNotesThread incidentId={incident.id} />
        </div>
    );
}
