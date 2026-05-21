'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { getSessionUser } from '@/lib/session';
import { formatArgentinaDate } from '@/lib/datetime';

const INCIDENT_ESTADOS = {
    abierta: { label: 'Abierta', bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
    en_revision: { label: 'En revisión', bg: '#FFFBEB', fg: '#B45309', border: '#FCD34D' },
    reparada: { label: 'Reparada', bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
    reemplazada: { label: 'Reemplazada', bg: '#F1F5F9', fg: '#475569', border: '#CBD5E1' },
    descartada: { label: 'Descartada', bg: '#F8FAFC', fg: '#94A3B8', border: '#E2E8F0' },
};

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

function PedidosTab() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [savingId, setSavingId] = useState(null);

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

    const markComplete = async (request) => {
        const { default: Swal } = await import('sweetalert2');
        const confirm = await Swal.fire({
            title: '¿Marcar como entregado?',
            text: `Pedido del servicio ${request.service_name || ''} quedará completado.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, entregado',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#10B981',
        });
        if (!confirm.isConfirmed) return;

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
        } catch (e) {
            await Swal.fire({ title: 'Error', text: e.message, icon: 'error', confirmButtonColor: '#ef4444' });
        } finally {
            setSavingId(null);
        }
    };

    return (
        <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                Pedidos enviados al proveedor. Cuando hagas la entrega en el servicio, marcalos como completados.
            </p>

            {error && <div style={{ color: 'var(--error)', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

            {loading ? (
                <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Cargando...</div>
            ) : requests.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: 'var(--text-muted)' }}>
                    No hay pedidos pendientes de entrega.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {requests.map(req => (
                        <div key={req.id} className="card" style={{ marginBottom: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                                <div>
                                    <strong style={{ fontSize: '1rem' }}>{req.service_name || 'Sin servicio'}</strong>
                                    {req.urgent && (
                                        <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--error)', border: '1px solid var(--error)', borderRadius: '999px', padding: '0.1rem 0.5rem' }}>URGENTE</span>
                                    )}
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                        Pedido #{req.id} · {formatArgentinaDate(req.created_at)}
                                        {(req.supervisor_surname || req.supervisor_name) && ` · ${req.supervisor_surname || ''} ${req.supervisor_name || ''}`.trimEnd()}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    disabled={savingId === req.id}
                                    onClick={() => markComplete(req)}
                                    style={{ background: '#10B981' }}
                                >
                                    {savingId === req.id ? 'Guardando...' : '✓ Entregado'}
                                </button>
                            </div>

                            <div style={{ display: 'grid', gap: '0.4rem' }}>
                                {(req.items || []).map((item, idx) => (
                                    <div key={idx} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '0.5rem 0.7rem', background: 'var(--color-muted-surface)',
                                        border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem',
                                    }}>
                                        <span>{item.nombre || 'Insumo'}</span>
                                        <strong>{item.cantidad}{item.unidad ? ` ${item.unidad}` : ''}</strong>
                                    </div>
                                ))}
                            </div>

                            {req.notas && (
                                <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    <strong style={{ color: 'var(--text-main)' }}>Notas:</strong> {req.notas}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
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
            const open = (Array.isArray(data) ? data : []).filter(i => i.estado === 'abierta' || i.estado === 'en_revision');
            setIncidents(open);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const markResolved = async (incident) => {
        const { default: Swal } = await import('sweetalert2');
        const confirm = await Swal.fire({
            title: '¿Marcar como reparada?',
            text: `La incidencia de ${incident.machine_nombre || 'la máquina'} quedará resuelta.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, reparada',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#10B981',
        });
        if (!confirm.isConfirmed) return;

        setSavingId(incident.id);
        try {
            const res = await fetch(`/api/machine-incidents/${incident.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: 'reparada' }),
            });
            if (!res.ok) throw new Error('No se pudo actualizar la incidencia.');
            setIncidents(prev => prev.filter(i => i.id !== incident.id));
        } catch (e) {
            await Swal.fire({ title: 'Error', text: e.message, icon: 'error', confirmButtonColor: '#ef4444' });
        } finally {
            setSavingId(null);
        }
    };

    return (
        <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                Incidencias de maquinaria abiertas. Cuando las resuelvas, marcalas como reparadas.
            </p>

            {error && <div style={{ color: 'var(--error)', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

            {loading ? (
                <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Cargando...</div>
            ) : incidents.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: 'var(--text-muted)' }}>
                    No hay incidencias abiertas.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {incidents.map(inc => (
                        <div key={inc.id} className="card" style={{ marginBottom: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                                <div>
                                    <strong style={{ fontSize: '1rem' }}>{inc.machine_nombre || 'Máquina'}</strong>
                                    <EstadoBadge estado={inc.estado} />
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                        {inc.service_name || 'Sin servicio'} · {formatArgentinaDate(inc.created_at)}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    disabled={savingId === inc.id}
                                    onClick={() => markResolved(inc)}
                                    style={{ background: '#10B981' }}
                                >
                                    {savingId === inc.id ? 'Guardando...' : '✓ Reparada'}
                                </button>
                            </div>

                            <div style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>{inc.descripcion}</div>
                            {inc.nota_interna && (
                                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    <strong style={{ color: 'var(--text-main)' }}>Nota:</strong> {inc.nota_interna}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
