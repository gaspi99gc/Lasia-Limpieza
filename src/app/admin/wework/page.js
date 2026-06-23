'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { AttachmentThumbs } from '@/components/AttachmentViewer';
import MaintenanceTicketComments from '@/components/MaintenanceTicketComments';
import { getSessionUser } from '@/lib/session';
import { formatArgentinaDate } from '@/lib/datetime';
import { isWeworkService } from '@/lib/wework';

const ESTADO_STYLE = {
    abierto: { label: 'Abierto', bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
    en_proceso: { label: 'En proceso', bg: '#FFFBEB', fg: '#B45309', border: '#FCD34D' },
    resuelto: { label: 'Resuelto', bg: '#ECFDF5', fg: '#065F46', border: '#6EE7B7' },
};

function EstadoBadge({ estado }) {
    const e = ESTADO_STYLE[estado] || ESTADO_STYLE.abierto;
    return (
        <span style={{
            display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '999px',
            fontSize: '0.72rem', fontWeight: 700,
            background: e.bg, color: e.fg, border: `1px solid ${e.border}`, whiteSpace: 'nowrap',
        }}>
            {e.label}
        </span>
    );
}

function DetalleModal({ ticketId, onClose }) {
    const [ticket, setTicket] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/maintenance-tickets/${ticketId}`, { cache: 'no-store' });
            if (!res.ok) throw new Error('No se pudo cargar el ticket.');
            const data = await res.json();
            setTicket(data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [ticketId]);

    useEffect(() => { load(); }, [load]);

    return (
        <div
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
            <div style={{ background: 'var(--color-surface)', borderRadius: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', width: 'min(680px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
                    <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Ticket #{ticketId}</h2>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.4rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0.25rem' }}>×</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
                    {loading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
                    {error && <p style={{ color: 'var(--error)' }}>{error}</p>}
                    {ticket && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                                <strong style={{ fontSize: '1.1rem' }}>{ticket.titulo}</strong>
                                <EstadoBadge estado={ticket.estado} />
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                                {ticket.service_name || 'Sin servicio'} · {formatArgentinaDate(ticket.created_at)}
                                {ticket.reportado_por_nombre ? ` · ${ticket.reportado_por_nombre}` : ''}
                            </div>
                            <div style={{ fontSize: '0.95rem', whiteSpace: 'pre-wrap', marginBottom: '0.75rem' }}>{ticket.descripcion}</div>
                            {ticket.attachments?.length > 0 && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <AttachmentThumbs attachments={ticket.attachments} size={84} />
                                </div>
                            )}
                            <MaintenanceTicketComments ticketId={ticket.id} initialComments={ticket.comments || []} canAdd={false} />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function TicketsTab() {
    const [services, setServices] = useState([]);
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [filterEstado, setFilterEstado] = useState('todos');
    const [filterServiceId, setFilterServiceId] = useState('todos');
    const [selectedTicketId, setSelectedTicketId] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [svcRes, ticketsRes] = await Promise.all([
                fetch('/api/services'),
                fetch('/api/maintenance-tickets'),
            ]);
            const svcData = await svcRes.json();
            const ticketsData = await ticketsRes.json();

            const weworkSvcs = (Array.isArray(svcData) ? svcData : []).filter(s => isWeworkService(s.name));
            const weworkSvcIds = new Set(weworkSvcs.map(s => Number(s.id)));
            const weworkTickets = (Array.isArray(ticketsData) ? ticketsData : []).filter(t => weworkSvcIds.has(Number(t.service_id)));

            setServices(weworkSvcs);
            setTickets(weworkTickets);
        } catch (e) {
            setError('No se pudieron cargar los tickets.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        return tickets.filter(t => {
            if (filterEstado !== 'todos' && t.estado !== filterEstado) return false;
            if (filterServiceId !== 'todos' && Number(t.service_id) !== Number(filterServiceId)) return false;
            return true;
        });
    }, [tickets, filterEstado, filterServiceId]);

    const counts = useMemo(() => ({
        todos: tickets.length,
        abierto: tickets.filter(t => t.estado === 'abierto').length,
        en_proceso: tickets.filter(t => t.estado === 'en_proceso').length,
        resuelto: tickets.filter(t => t.estado === 'resuelto').length,
    }), [tickets]);

    const perService = useMemo(() => {
        const map = new Map(services.map(s => [Number(s.id), { id: s.id, name: s.name, total: 0, abierto: 0, en_proceso: 0, resuelto: 0 }]));
        for (const t of tickets) {
            const entry = map.get(Number(t.service_id));
            if (!entry) continue;
            entry.total += 1;
            if (entry[t.estado] !== undefined) entry[t.estado] += 1;
        }
        return Array.from(map.values());
    }, [services, tickets]);

    return (
        <div>
            {/* Resumen por servicio */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {perService.map(s => (
                    <button
                        key={s.id}
                        type="button"
                        onClick={() => setFilterServiceId(String(s.id))}
                        style={{
                            textAlign: 'left',
                            padding: '0.85rem 1rem',
                            borderRadius: '12px',
                            border: `1px solid ${String(filterServiceId) === String(s.id) ? '#00AEEF' : 'var(--border-color)'}`,
                            background: 'var(--color-surface)',
                            cursor: 'pointer',
                            display: 'flex', flexDirection: 'column', gap: '0.4rem',
                        }}
                    >
                        <strong style={{ fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</strong>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '999px', background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', fontWeight: 700 }}>{s.abierto} ab.</span>
                            <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '999px', background: '#FFFBEB', color: '#B45309', border: '1px solid #FCD34D', fontWeight: 700 }}>{s.en_proceso} en proc.</span>
                            <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '999px', background: '#ECFDF5', color: '#065F46', border: '1px solid #6EE7B7', fontWeight: 700 }}>{s.resuelto} res.</span>
                        </div>
                    </button>
                ))}
            </div>

            {/* Filtros */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {[
                        { key: 'todos', label: 'Todos' },
                        { key: 'abierto', label: 'Abiertos' },
                        { key: 'en_proceso', label: 'En proceso' },
                        { key: 'resuelto', label: 'Resueltos' },
                    ].map(({ key, label }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setFilterEstado(key)}
                            style={{
                                padding: '0.35rem 0.75rem',
                                border: `1px solid ${filterEstado === key ? '#00AEEF' : 'var(--border-color)'}`,
                                borderRadius: '999px',
                                background: filterEstado === key ? '#00AEEF' : 'var(--color-surface)',
                                color: filterEstado === key ? '#fff' : 'var(--text-main)',
                                fontWeight: 600,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                            }}
                        >
                            {label} ({counts[key]})
                        </button>
                    ))}
                </div>
                {filterServiceId !== 'todos' && (
                    <button
                        type="button"
                        onClick={() => setFilterServiceId('todos')}
                        style={{ padding: '0.35rem 0.75rem', borderRadius: '999px', border: '1px solid var(--border-color)', background: 'var(--color-muted-surface)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                    >
                        Ver todos los servicios ×
                    </button>
                )}
            </div>

            {error && <div style={{ color: 'var(--error)', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

            {loading ? (
                <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Cargando...</div>
            ) : filtered.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: 'var(--text-muted)' }}>
                    No hay tickets para los filtros seleccionados.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {filtered.map(t => (
                        <div
                            key={t.id}
                            onClick={() => setSelectedTicketId(t.id)}
                            style={{
                                display: 'flex', flexDirection: 'column', gap: '0.4rem',
                                padding: '0.85rem 1rem', borderRadius: '12px',
                                background: 'var(--color-surface)', border: '1px solid var(--border-color)',
                                cursor: 'pointer',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <strong style={{ fontSize: '0.98rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.titulo}</strong>
                                <EstadoBadge estado={t.estado} />
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                                <span>#{t.id}</span>
                                <span>{t.service_name}</span>
                                <span>{formatArgentinaDate(t.created_at)}</span>
                                {t.comment_count > 0 && <span>💬 {t.comment_count}</span>}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {selectedTicketId && (
                <DetalleModal ticketId={selectedTicketId} onClose={() => setSelectedTicketId(null)} />
            )}
        </div>
    );
}

const TABS = [
    { key: 'tickets', label: 'Tickets de mantenimiento' },
];

function PanelContent() {
    const router = useRouter();
    const params = useSearchParams();
    const tab = params.get('tab') || 'tickets';

    useEffect(() => {
        const user = getSessionUser();
        if (!user) { router.push('/login'); return; }
    }, [router]);

    const changeTab = (key) => {
        router.push(`/admin/wework?tab=${key}`);
    };

    return (
        <div>
            <header className="page-header" style={{ marginBottom: '1rem' }}>
                <div>
                    <h1>WeWork</h1>
                    <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
                        Panel de gestión del cliente. Solo lectura: el supervisor técnico es quien atiende los tickets.
                    </p>
                </div>
            </header>

            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)' }}>
                {TABS.map(t => {
                    const active = tab === t.key;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => changeTab(t.key)}
                            style={{
                                padding: '0.6rem 1rem',
                                border: 'none',
                                background: 'none',
                                borderBottom: `2px solid ${active ? '#00AEEF' : 'transparent'}`,
                                color: active ? 'var(--text-main)' : 'var(--text-muted)',
                                fontWeight: active ? 700 : 600,
                                fontSize: '0.92rem',
                                cursor: 'pointer',
                                marginBottom: '-1px',
                            }}
                        >
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {tab === 'tickets' && <TicketsTab />}
        </div>
    );
}

export default function AdminWeWorkPage() {
    return (
        <MainLayout>
            <Suspense fallback={null}>
                <PanelContent />
            </Suspense>
        </MainLayout>
    );
}
