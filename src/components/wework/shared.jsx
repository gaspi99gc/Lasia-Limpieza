'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { AttachmentThumbs } from '@/components/AttachmentViewer';
import MaintenanceTicketComments from '@/components/MaintenanceTicketComments';
import { formatArgentinaDate } from '@/lib/datetime';

export const ESTADO_STYLE = {
    abierto: { label: 'Abierto', bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
    en_proceso: { label: 'En proceso', bg: '#FFFBEB', fg: '#B45309', border: '#FCD34D' },
    resuelto: { label: 'Resuelto', bg: '#ECFDF5', fg: '#065F46', border: '#6EE7B7' },
};

export function EstadoBadge({ estado }) {
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
export function FileInput({ files, setFiles, required, label }) {
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

// Sube cada archivo DIRECTO a Storage con signed URL (saltea el limite de body de Vercel).
export async function uploadFilesDirect(files) {
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

// Detalle del ticket como bottom-sheet en mobile / centrado en desktop.
// canAdd controla si se puede responder en el hilo (cliente sí, admin no).
export function DetalleModal({ ticketId, onClose, canComment = true }) {
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
                            <MaintenanceTicketComments ticketId={ticket.id} initialComments={ticket.comments || []} canAdd={canComment} />
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
