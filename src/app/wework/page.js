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

const WEWORK_SERVICE_NAMES = [
    'WEWORK CORRIENTES',
    'WEWORK VTE LOPEZ',
    'WEWORK BUTTY',
    'WEWORK BLAS PARERA',
];

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');
const norm = (s) => (s || '').toString().toUpperCase().normalize('NFD').replace(COMBINING_MARKS, '').replace(/\s+/g, ' ').trim();
const WEWORK_SET = new Set(WEWORK_SERVICE_NAMES.map(norm));

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

// Sin capture="environment": el OS decide y muestra "Cámara / Galería / Archivos"
// como en /mi-panel/maquinas. Multiple deja sumar varios en una sola seleccion.
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
            <button type="button" onClick={() => inputRef.current?.click()} style={{ width: '100%', padding: '0.85rem', border: '1px solid #00AEEF', borderRadius: '10px', background: 'transparent', color: '#00AEEF', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>
                📎 Agregar fotos o videos
            </button>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Tu celu te va a preguntar si querés tomar la foto en el momento o elegirla de la galería.
            </p>
            {error && <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem', color: '#B91C1C' }}>{error}</p>}
            {files.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.6rem' }}>
                    {files.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.65rem', background: 'var(--color-muted-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.82rem' }}>
                            <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {f.type.startsWith('video/') ? '🎬 ' : '🖼️ '}{f.name}
                            </span>
                            <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: 1, padding: 0 }}>×</button>
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

// Drawer mobile-first: en celu va full-screen, en desktop a la derecha 480px.
function NuevoTicketSheet({ service, onClose, onDone }) {
    const [titulo, setTitulo] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [files, setFiles] = useState([]);
    const [saving, setSaving] = useState(false);

    const canSave = titulo.trim() && descripcion.trim() && files.length > 0;

    const submit = async () => {
        setSaving(true);
        try {
            const user = getSessionUser();
            const attachments = await uploadFilesDirect(files);
            const res = await fetch('/api/maintenance-tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service_id: Number(service.id),
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
            <div
                onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex' }}
            >
                <div className="wework-sheet">
                    <div className="wework-sheet-header">
                        <div style={{ minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nuevo ticket</p>
                            <h2 style={{ margin: '0.15rem 0 0', fontSize: '1.05rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{service.name}</h2>
                        </div>
                        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.5rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0.25rem' }}>×</button>
                    </div>
                    <div className="wework-sheet-body">
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Título *</label>
                            <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={120} placeholder="Asunto corto del incidente" style={{ width: '100%', padding: '0.75rem 0.85rem', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '1rem', background: 'var(--color-surface)' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Descripción *</label>
                            <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={4} placeholder="Contanos qué está pasando" style={{ width: '100%', padding: '0.75rem 0.85rem', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '1rem', resize: 'vertical', fontFamily: 'inherit', minHeight: '110px' }} />
                        </div>
                        <FileInput files={files} setFiles={setFiles} required label="Foto o video del incidente" />
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Es obligatorio adjuntar al menos una foto o video. Si grabás video, que sea corto (máx ~15-20 seg, hasta 50 MB).
                        </p>
                    </div>
                    <div className="wework-sheet-footer">
                        <button onClick={onClose} disabled={saving} style={{ flex: 1, padding: '0.85rem', border: '1px solid var(--border-color)', borderRadius: '10px', background: 'var(--color-surface)', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>Cancelar</button>
                        <button onClick={submit} disabled={saving || !canSave} style={{ flex: 2, padding: '0.85rem', border: 'none', borderRadius: '10px', background: '#00AEEF', color: '#fff', cursor: (saving || !canSave) ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.95rem', opacity: (saving || !canSave) ? 0.5 : 1 }}>
                            {saving ? 'Enviando...' : 'Crear ticket'}
                        </button>
                    </div>
                </div>
            </div>
            <style jsx>{`
                .wework-sheet {
                    margin-left: auto;
                    width: min(480px, 100vw);
                    background: var(--color-surface);
                    box-shadow: 0 0 40px rgba(0,0,0,0.18);
                    display: flex;
                    flex-direction: column;
                    height: 100dvh;
                }
                .wework-sheet-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    padding: 1rem 1.25rem;
                    border-bottom: 1px solid var(--border-color);
                    gap: 0.5rem;
                }
                .wework-sheet-body {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1rem 1.25rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                .wework-sheet-footer {
                    display: flex;
                    gap: 0.6rem;
                    padding: 0.85rem 1.25rem calc(0.85rem + env(safe-area-inset-bottom));
                    border-top: 1px solid var(--border-color);
                    background: var(--color-surface);
                }
                @media (max-width: 600px) {
                    .wework-sheet {
                        width: 100vw;
                    }
                }
            `}</style>
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
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 0 }}
        >
            <div className="wework-detail-card">
                <div className="wework-detail-header">
                    <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Ticket #{ticketId}</h2>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.5rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0.25rem' }}>×</button>
                </div>
                <div className="wework-detail-body">
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
                            <div style={{ fontSize: '0.95rem', whiteSpace: 'pre-wrap', marginBottom: '0.75rem' }}>{ticket.descripcion}</div>
                            {ticket.attachments?.length > 0 && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <AttachmentThumbs attachments={ticket.attachments} size={84} />
                                </div>
                            )}
                            <MaintenanceTicketComments ticketId={ticket.id} initialComments={ticket.comments || []} />
                        </>
                    )}
                </div>
            </div>
            <style jsx>{`
                .wework-detail-card {
                    background: var(--color-surface);
                    border-radius: 16px 16px 0 0;
                    box-shadow: 0 -8px 30px rgba(0,0,0,0.25);
                    width: 100%;
                    max-width: 640px;
                    max-height: 92dvh;
                    display: flex;
                    flex-direction: column;
                }
                .wework-detail-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 1rem 1.25rem;
                    border-bottom: 1px solid var(--border-color);
                }
                .wework-detail-body {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1rem 1.25rem calc(1rem + env(safe-area-inset-bottom));
                }
                @media (min-width: 720px) {
                    .wework-detail-card {
                        border-radius: 16px;
                        max-height: 88dvh;
                        margin-bottom: 4dvh;
                    }
                }
            `}</style>
        </div>
    );
}

export default function WeWorkTicketsPage() {
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState(null);
    const [services, setServices] = useState([]);
    const [tickets, setTickets] = useState([]);
    const [loadingSvc, setLoadingSvc] = useState(true);
    const [loadingTickets, setLoadingTickets] = useState(false);

    const [step, setStep] = useState(1);
    const [serviceId, setServiceId] = useState('');
    const [showNew, setShowNew] = useState(false);
    const [selectedTicketId, setSelectedTicketId] = useState(null);
    const [filter, setFilter] = useState('todos');

    useEffect(() => {
        const user = getSessionUser();
        if (!user) { router.push('/login'); return; }
        setCurrentUser(user);
    }, [router]);

    // Cargar servicios al entrar
    useEffect(() => {
        if (!currentUser) return;
        (async () => {
            setLoadingSvc(true);
            try {
                const res = await fetch('/api/services');
                const data = await res.json();
                const all = Array.isArray(data) ? data : [];
                setServices(all.filter(s => WEWORK_SET.has(norm(s.name))));
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

    const goToStep2 = () => {
        if (!serviceId) {
            notify.error('Elegí un servicio primero');
            return;
        }
        setStep(2);
    };

    const changeService = () => {
        setStep(1);
    };

    return (
        <MainLayout>
            <div className="wework-page">
                {step === 1 && (
                    <div className="wework-step-card">
                        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.4rem' }}>Tickets de mantenimiento</h1>
                        <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: '0 0 1.5rem' }}>
                            Elegí el servicio sobre el que querés ver o cargar tickets.
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
                            Continuar
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
                            style={{ background: 'none', border: 'none', color: '#00AEEF', fontSize: '0.82rem', cursor: 'pointer', padding: 0, fontWeight: 600, marginBottom: '1rem' }}
                        >
                            Cambiar servicio
                        </button>

                        <button
                            onClick={() => setShowNew(true)}
                            style={{ width: '100%', background: '#00AEEF', color: '#fff', border: 'none', padding: '0.9rem 1.1rem', borderRadius: '10px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', marginBottom: '1.25rem' }}
                        >
                            + Nuevo ticket
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
                                    ? 'Todavía no hay tickets para este servicio. Apretá "+ Nuevo ticket" para crear el primero.'
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

            {showNew && selectedService && (
                <NuevoTicketSheet
                    service={selectedService}
                    onClose={() => setShowNew(false)}
                    onDone={() => { setShowNew(false); loadTickets(); }}
                />
            )}
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
