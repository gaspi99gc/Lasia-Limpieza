'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import SearchableSelect from '@/components/SearchableSelect';
import { AttachmentThumbs } from '@/components/AttachmentViewer';
import MaintenanceTicketComments from '@/components/MaintenanceTicketComments';
import { getSessionUser } from '@/lib/session';
import { formatArgentinaDate } from '@/lib/datetime';
import { notify } from '@/lib/toast';

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

function FileInput({ files, setFiles, required, label }) {
    const [error, setError] = useState('');
    const inputRef = useRef(null);

    const onPick = (e) => {
        setError('');
        const picked = Array.from(e.target.files || []);
        const invalid = picked.find(f => !/^(image|video)\//.test(f.type));
        if (invalid) { setError(`Solo fotos o videos (${invalid.name})`); return; }
        const big = picked.find(f => f.size > 50 * 1024 * 1024);
        if (big) { setError(`Archivo demasiado grande: ${big.name} (máx 50 MB)`); return; }
        setFiles(prev => [...prev, ...picked]);
        e.target.value = '';
    };

    return (
        <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {label}{required ? ' *' : ' (opcional)'}
            </label>
            <input ref={inputRef} type="file" accept="image/*,video/*" multiple onChange={onPick} style={{ display: 'none' }} />
            <button type="button" onClick={() => inputRef.current?.click()} style={{ width: '100%', padding: '0.7rem', border: '1px solid #00AEEF', borderRadius: '8px', background: 'transparent', color: '#00AEEF', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                📎 Agregar fotos o videos
            </button>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Tu celu te va a preguntar si querés tomar la foto en el momento o elegirla de la galería.
            </p>
            {error && <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: '#B91C1C' }}>{error}</p>}
            {files.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                    {files.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.55rem', background: 'var(--color-muted-surface)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.78rem' }}>
                            <span style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {f.type.startsWith('video/') ? '🎬 ' : '🖼️ '}{f.name}
                            </span>
                            <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1, padding: 0 }}>×</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

async function uploadFilesDirect(files) {
    const signRes = await fetch('/api/maintenance-tickets/sign-uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            files: files.map(f => ({ name: f.name, type: f.type, size: f.size })),
        }),
    });
    const signData = await signRes.json().catch(() => ({}));
    if (!signRes.ok) throw new Error(signData.error || 'No se pudo preparar la subida.');

    const attachments = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const u = signData.uploads[i];
        const putRes = await fetch(u.signed_url, {
            method: 'PUT',
            headers: { 'Content-Type': file.type, 'x-upsert': 'false' },
            body: file,
        });
        if (!putRes.ok) throw new Error(`No se pudo subir ${file.name}.`);
        attachments.push({
            path: u.path,
            file_name: u.file_name,
            mime_type: u.mime_type,
            size_bytes: u.size_bytes,
        });
    }
    return attachments;
}

function NuevoTicketDrawer({ services, onClose, onDone }) {
    const [serviceId, setServiceId] = useState('');
    const [titulo, setTitulo] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [files, setFiles] = useState([]);
    const [saving, setSaving] = useState(false);

    const canSave = serviceId && titulo.trim() && descripcion.trim() && files.length > 0;

    const submit = async () => {
        setSaving(true);
        try {
            const user = getSessionUser();
            const attachments = await uploadFilesDirect(files);
            const res = await fetch('/api/maintenance-tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service_id: Number(serviceId),
                    titulo: titulo.trim(),
                    descripcion: descripcion.trim(),
                    attachments,
                    reportado_por_id: user?.app_user_id || user?.id || null,
                    reportado_por_nombre: user ? `${user.name || ''} ${user.surname || ''}`.trim() || 'WeWork' : 'WeWork',
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                notify.error(err.error || 'Error al crear ticket');
                return;
            }
            notify.success('Ticket creado correctamente');
            onDone();
        } catch (e) {
            notify.error(e.message || 'Error al crear ticket');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 50 }} />
            <div style={{
                position: 'fixed', top: 0, right: 0, bottom: 0,
                width: 'min(480px, 100vw)',
                background: 'var(--color-surface)',
                boxShadow: '0 0 40px rgba(0,0,0,0.18)',
                zIndex: 51, display: 'flex', flexDirection: 'column',
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mantenimiento</p>
                        <h2 style={{ margin: '0.15rem 0 0', fontSize: '1.05rem', fontWeight: 700 }}>Nuevo ticket</h2>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.4rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0.25rem' }}>×</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Servicio *</label>
                        <SearchableSelect
                            options={services.map(s => ({ value: s.id, label: s.name }))}
                            value={serviceId}
                            onChange={(v) => setServiceId(v)}
                            placeholder="Seleccionar servicio..."
                            searchPlaceholder="Buscar servicio..."
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Título *</label>
                        <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={120} placeholder="Asunto corto del incidente" style={{ width: '100%', padding: '0.55rem 0.7rem', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.9rem', background: 'var(--color-surface)' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Descripción *</label>
                        <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={4} placeholder="Contanos qué está pasando" style={{ width: '100%', padding: '0.55rem 0.7rem', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit' }} />
                    </div>
                    <FileInput files={files} setFiles={setFiles} required label="Foto o video del incidente" />
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Es obligatorio adjuntar al menos una foto o video. Si grabás video, que sea corto (máx ~15-20 seg, hasta 50 MB).
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button onClick={onClose} disabled={saving} style={{ flex: 1, padding: '0.65rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--color-surface)', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>Cancelar</button>
                        <button onClick={submit} disabled={saving || !canSave} style={{ flex: 1, padding: '0.65rem', border: 'none', borderRadius: '6px', background: '#00AEEF', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', opacity: (saving || !canSave) ? 0.5 : 1 }}>
                            {saving ? 'Enviando...' : 'Crear ticket'}
                        </button>
                    </div>
                </div>
            </div>
        </>
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
            <div style={{ background: 'var(--color-surface)', borderRadius: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', width: 'min(640px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
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
                            </div>
                            <div style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap', marginBottom: '0.75rem' }}>{ticket.descripcion}</div>
                            {ticket.attachments?.length > 0 && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <AttachmentThumbs attachments={ticket.attachments} size={80} />
                                </div>
                            )}
                            <MaintenanceTicketComments ticketId={ticket.id} initialComments={ticket.comments || []} />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function WeWorkTicketsPage() {
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState(null);
    const [services, setServices] = useState([]);
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showNew, setShowNew] = useState(false);
    const [selectedTicketId, setSelectedTicketId] = useState(null);
    const [filter, setFilter] = useState('todos');

    useEffect(() => {
        const user = getSessionUser();
        if (!user) { router.push('/login'); return; }
        setCurrentUser(user);
    }, [router]);

    const load = useCallback(async () => {
        if (!currentUser) return;
        setLoading(true);
        try {
            const reporterParam = currentUser.app_user_id || currentUser.id;
            const [svcRes, ticketsRes] = await Promise.all([
                fetch('/api/services'),
                fetch(`/api/maintenance-tickets?reporter_id=${reporterParam}`),
            ]);
            const svcData = await svcRes.json();
            const ticketsData = await ticketsRes.json();
            setServices(Array.isArray(svcData) ? svcData : []);
            setTickets(Array.isArray(ticketsData) ? ticketsData : []);
        } finally {
            setLoading(false);
        }
    }, [currentUser]);

    useEffect(() => { load(); }, [load]);

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

    return (
        <MainLayout>
            <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem 1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Tickets de mantenimiento</h1>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
                            Reportá un incidente y seguí su estado.
                        </p>
                    </div>
                    <button
                        onClick={() => setShowNew(true)}
                        style={{ background: '#00AEEF', color: '#fff', border: 'none', padding: '0.65rem 1.1rem', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
                    >
                        + Nuevo ticket
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '1.25rem 0 1rem' }}>
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

                {loading ? (
                    <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Cargando...</div>
                ) : filtered.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: 'var(--text-muted)' }}>
                        {tickets.length === 0
                            ? 'Todavía no creaste ningún ticket. Apretá "+ Nuevo ticket" para empezar.'
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
                                    <span>{t.service_name || 'Sin servicio'}</span>
                                    <span>{formatArgentinaDate(t.created_at)}</span>
                                    {t.comment_count > 0 && <span>💬 {t.comment_count}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showNew && (
                <NuevoTicketDrawer
                    services={services}
                    onClose={() => setShowNew(false)}
                    onDone={() => { setShowNew(false); load(); }}
                />
            )}
            {selectedTicketId && (
                <DetalleModal
                    ticketId={selectedTicketId}
                    onClose={() => { setSelectedTicketId(null); load(); }}
                />
            )}
        </MainLayout>
    );
}
