'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import SearchableSelect from '@/components/SearchableSelect';
import { getSessionUser } from '@/lib/session';
import { formatArgentinaDate } from '@/lib/datetime';
import { isWeworkService } from '@/lib/wework';
import { EstadoBadge, DetalleModal } from '@/components/wework/shared';

export default function WeWorkHistoricoPage() {
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState(null);
    const [services, setServices] = useState([]);
    const [tickets, setTickets] = useState([]);
    const [loadingSvc, setLoadingSvc] = useState(true);
    const [loadingTickets, setLoadingTickets] = useState(false);

    const [step, setStep] = useState(1);
    const [serviceId, setServiceId] = useState('');
    const [selectedTicketId, setSelectedTicketId] = useState(null);
    const [filter, setFilter] = useState('todos');

    useEffect(() => {
        const user = getSessionUser();
        if (!user) { router.push('/login'); return; }
        setCurrentUser(user);
    }, [router]);

    useEffect(() => {
        if (!currentUser) return;
        (async () => {
            setLoadingSvc(true);
            try {
                const res = await fetch('/api/services');
                const data = await res.json();
                const all = Array.isArray(data) ? data : [];
                setServices(all.filter(s => isWeworkService(s.name)));
            } finally {
                setLoadingSvc(false);
            }
        })();
    }, [currentUser]);

    const loadTickets = useCallback(async () => {
        if (!serviceId || !currentUser) return;
        setLoadingTickets(true);
        try {
            const reporterParam = currentUser.app_user_id || currentUser.id;
            const res = await fetch(`/api/maintenance-tickets?reporter_id=${reporterParam}&service_id=${serviceId}`);
            const data = await res.json();
            setTickets(Array.isArray(data) ? data : []);
        } finally {
            setLoadingTickets(false);
        }
    }, [serviceId, currentUser]);

    useEffect(() => { loadTickets(); }, [loadTickets]);

    const selectedService = useMemo(
        () => services.find(s => String(s.id) === String(serviceId)) || null,
        [services, serviceId]
    );

    const filtered = useMemo(() => {
        if (filter === 'todos') return tickets;
        return tickets.filter(t => t.estado === filter);
    }, [tickets, filter]);

    const counts = useMemo(() => ({
        todos: tickets.length,
        abierto: tickets.filter(t => t.estado === 'abierto').length,
        en_proceso: tickets.filter(t => t.estado === 'en_proceso').length,
        resuelto: tickets.filter(t => t.estado === 'resuelto').length,
    }), [tickets]);

    const goToStep2 = () => setStep(2);
    const changeService = () => setStep(1);

    return (
        <MainLayout>
            <div className="wework-page">
                {step === 1 && (
                    <div className="wework-step-card">
                        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.4rem' }}>Histórico de tickets</h1>
                        <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: '0 0 1.5rem' }}>
                            Elegí el servicio para ver sus tickets y el estado de cada uno.
                        </p>

                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Servicio</label>
                        <SearchableSelect
                            options={services.map(s => ({ value: s.id, label: s.name }))}
                            value={serviceId}
                            onChange={(v) => setServiceId(v)}
                            placeholder={loadingSvc ? 'Cargando servicios...' : 'Seleccionar servicio...'}
                            searchPlaceholder="Buscar servicio..."
                        />

                        <button
                            type="button"
                            onClick={goToStep2}
                            disabled={!serviceId}
                            style={{
                                marginTop: '1.5rem', width: '100%',
                                padding: '0.95rem', borderRadius: '10px',
                                border: 'none', background: '#00AEEF', color: '#fff',
                                fontWeight: 700, fontSize: '1rem',
                                cursor: serviceId ? 'pointer' : 'not-allowed',
                                opacity: serviceId ? 1 : 0.45,
                            }}
                        >
                            Ver tickets
                        </button>
                    </div>
                )}

                {step === 2 && selectedService && (
                    <div className="wework-step-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                            <button
                                type="button"
                                onClick={changeService}
                                aria-label="Volver"
                                style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '999px', width: '36px', height: '36px', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                            >
                                ←
                            </button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Servicio</p>
                                <strong style={{ fontSize: '1.05rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedService.name}</strong>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={changeService}
                            style={{ background: 'none', border: 'none', color: '#00AEEF', fontSize: '0.82rem', cursor: 'pointer', padding: 0, fontWeight: 600, marginBottom: '1.25rem' }}
                        >
                            Cambiar servicio
                        </button>

                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem', overflowX: 'auto' }}>
                            {[
                                { key: 'todos', label: 'Todos' },
                                { key: 'abierto', label: 'Abiertos' },
                                { key: 'en_proceso', label: 'En proceso' },
                                { key: 'resuelto', label: 'Resueltos' },
                            ].map(({ key, label }) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setFilter(key)}
                                    style={{
                                        padding: '0.4rem 0.85rem',
                                        border: `1px solid ${filter === key ? '#00AEEF' : 'var(--border-color)'}`,
                                        borderRadius: '999px',
                                        background: filter === key ? '#00AEEF' : 'var(--color-surface)',
                                        color: filter === key ? '#fff' : 'var(--text-main)',
                                        fontWeight: 600,
                                        fontSize: '0.82rem',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {label} ({counts[key]})
                                </button>
                            ))}
                        </div>

                        {loadingTickets ? (
                            <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Cargando...</div>
                        ) : filtered.length === 0 ? (
                            <div className="card" style={{ textAlign: 'center', padding: '2rem 1.25rem', color: 'var(--text-muted)' }}>
                                {tickets.length === 0
                                    ? 'Todavía no hay tickets para este servicio. Creá uno desde "Crear ticket" en el menú.'
                                    : 'No hay tickets en este filtro.'}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {filtered.map(t => (
                                    <div
                                        key={t.id}
                                        onClick={() => setSelectedTicketId(t.id)}
                                        style={{
                                            display: 'flex', flexDirection: 'column', gap: '0.4rem',
                                            padding: '0.95rem 1rem', borderRadius: '12px',
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
                                            <span>{formatArgentinaDate(t.created_at)}</span>
                                            {t.comment_count > 0 && <span>💬 {t.comment_count}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {selectedTicketId && (
                <DetalleModal
                    ticketId={selectedTicketId}
                    onClose={() => { setSelectedTicketId(null); loadTickets(); }}
                />
            )}

            <style jsx>{`
                .wework-page {
                    max-width: 760px;
                    margin: 0 auto;
                    padding: 1.25rem 1rem calc(2rem + env(safe-area-inset-bottom));
                }
                .wework-step-card {
                    background: var(--color-surface);
                    border: 1px solid var(--border-color);
                    border-radius: 14px;
                    padding: 1.25rem 1.1rem;
                }
                @media (min-width: 700px) {
                    .wework-step-card {
                        padding: 1.75rem 1.5rem;
                    }
                    .wework-page {
                        padding: 1.75rem 1.25rem 3rem;
                    }
                }
            `}</style>
        </MainLayout>
    );
}
