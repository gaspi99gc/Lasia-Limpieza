'use client';

import { useState, useEffect, useCallback } from 'react';
import { AttachmentThumbs } from '@/components/AttachmentViewer';
import MaintenanceTicketComments from '@/components/MaintenanceTicketComments';
import { formatArgentinaDate } from '@/lib/datetime';
import { notify } from '@/lib/toast';

const TICKET_ESTADOS = {
    abierto: { label: 'Abierto', bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
    en_proceso: { label: 'En proceso', bg: '#FFFBEB', fg: '#B45309', border: '#FCD34D' },
    resuelto: { label: 'Resuelto', bg: '#ECFDF5', fg: '#065F46', border: '#6EE7B7' },
};
const TICKET_ESTADOS_LIST = ['abierto', 'en_proceso', 'resuelto'];

// Panel para ver y resolver tickets de mantenimiento (cargados por WeWork).
// Usado por el rol 'mantenimiento'. Cambia estado y responde en el hilo.
export default function MantenimientoPanel() {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [savingId, setSavingId] = useState(null);
    const [filter, setFilter] = useState('pendientes');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/maintenance-tickets');
            if (!res.ok) throw new Error('No se pudieron cargar los tickets.');
            const data = await res.json();
            setTickets(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const changeEstado = async (ticket, nuevoEstado) => {
        if (nuevoEstado === ticket.estado) return;
        setSavingId(ticket.id);
        try {
            const res = await fetch(`/api/maintenance-tickets/${ticket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: nuevoEstado }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'No se pudo actualizar el ticket.');
            }
            await load();
        } catch (e) {
            notify.error(e.message);
        } finally {
            setSavingId(null);
        }
    };

    const visibleTickets = filter === 'pendientes'
        ? tickets.filter(t => t.estado === 'abierto' || t.estado === 'en_proceso')
        : tickets;

    const counts = {
        pendientes: tickets.filter(t => t.estado === 'abierto' || t.estado === 'en_proceso').length,
        todos: tickets.length,
    };

    return (
        <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Tickets cargados por WeWork. Cambiá el estado a medida que los atendés y respondé en el hilo.
            </p>

            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {[
                    { key: 'pendientes', label: 'Pendientes' },
                    { key: 'todos', label: 'Todos' },
                ].map(({ key, label }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setFilter(key)}
                        style={{
                            padding: '0.35rem 0.75rem',
                            border: `1px solid ${filter === key ? '#00AEEF' : 'var(--border-color)'}`,
                            borderRadius: '999px',
                            background: filter === key ? '#00AEEF' : 'var(--color-surface)',
                            color: filter === key ? '#fff' : 'var(--text-main)',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                        }}
                    >
                        {label} ({counts[key]})
                    </button>
                ))}
            </div>

            {error && <div style={{ color: 'var(--error)', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

            {loading ? (
                <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Cargando...</div>
            ) : visibleTickets.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: 'var(--text-muted)' }}>
                    No hay tickets para mostrar.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {visibleTickets.map(t => (
                        <MaintenanceTicketCard
                            key={t.id}
                            ticket={t}
                            savingId={savingId}
                            onChangeEstado={changeEstado}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function MaintenanceTicketCard({ ticket, savingId, onChangeEstado }) {
    const estadoStyle = TICKET_ESTADOS[ticket.estado] || TICKET_ESTADOS.abierto;

    return (
        <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '1rem' }}>{ticket.titulo}</strong>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        #{ticket.id} · {ticket.service_name || 'Sin servicio'} · {formatArgentinaDate(ticket.created_at)}
                    </div>
                    {ticket.reportado_por_nombre && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                            Reportado por: <strong style={{ color: 'var(--text-main)' }}>{ticket.reportado_por_nombre}</strong>
                        </div>
                    )}
                </div>
                <select
                    value={ticket.estado}
                    disabled={savingId === ticket.id}
                    onChange={e => onChangeEstado(ticket, e.target.value)}
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
                    {TICKET_ESTADOS_LIST.map(k => (
                        <option key={k} value={k} style={{ color: '#000' }}>
                            {TICKET_ESTADOS[k]?.label || k}
                        </option>
                    ))}
                </select>
            </div>

            <div style={{ fontSize: '0.9rem', marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{ticket.descripcion}</div>

            {ticket.attachments && ticket.attachments.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                    <AttachmentThumbs attachments={ticket.attachments} size={80} />
                </div>
            )}

            <MaintenanceTicketComments ticketId={ticket.id} />
        </div>
    );
}
