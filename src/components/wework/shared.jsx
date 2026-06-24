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

const ROLE_LABELS = {
    wework: 'WeWork',
    supervisor_tecnico: 'Supervisor Técnico',
    mantenimiento: 'Mantenimiento',
    admin: 'Admin',
};

function escHtml(s) {
    return (s ?? '').toString()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Abre el detalle de un ticket en un SweetAlert (read-only): titulo, estado,
// descripcion, miniaturas que se abren al tocar, y comentarios sin poder escribir.
export async function openTicketSweetAlert(ticketId) {
    const { default: Swal } = await import('sweetalert2');

    Swal.fire({
        title: `Ticket #${ticketId}`,
        html: '<p style="color:#6b7280;font-size:14px;margin:8px 0;">Cargando...</p>',
        showConfirmButton: false,
        showCloseButton: true,
        width: 560,
        didOpen: () => Swal.showLoading(),
    });

    let ticket;
    try {
        const res = await fetch(`/api/maintenance-tickets/${ticketId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('No se pudo cargar el ticket.');
        ticket = await res.json();
    } catch (e) {
        Swal.update({ html: `<p style="color:#dc2626;font-size:14px;">${escHtml(e.message)}</p>` });
        Swal.hideLoading();
        return;
    }

    const info = ESTADO_STYLE[ticket.estado] || ESTADO_STYLE.abierto;
    const badge = `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;background:${info.bg};color:${info.fg};border:1px solid ${info.border};">${info.label}</span>`;

    const meta = `Creado el ${formatArgentinaDate(ticket.created_at)} · ${escHtml(ticket.service_name || 'Sin servicio')}`;

    // Cuando esta resuelto, mostramos cuando (updated_at hace de fecha de resolucion).
    const resueltoBlock = ticket.estado === 'resuelto'
        ? `<div style="display:inline-flex;align-items:center;gap:6px;margin:0 0 10px;padding:5px 10px;border-radius:8px;background:#ECFDF5;border:1px solid #6EE7B7;font-size:12.5px;font-weight:600;color:#065F46;">✓ Resuelto el ${formatArgentinaDate(ticket.updated_at || ticket.created_at)}</div>`
        : '';

    const attachments = ticket.attachments || [];
    const adjuntos = attachments.map((a, i) => {
        const isVideo = (a.mime_type || '').startsWith('video/');
        const inner = isVideo
            ? `<div style="width:72px;height:72px;display:flex;align-items:center;justify-content:center;font-size:26px;background:#000;color:#fff;border-radius:8px;">🎬</div>`
            : `<img src="${escHtml(a.url)}" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:8px;display:block;" />`;
        // data-att abre el visor dentro del mismo popup (sin pestaña nueva).
        return `<button type="button" data-att="${i}" style="padding:0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;cursor:pointer;background:none;line-height:0;">${inner}</button>`;
    }).join('');
    const adjuntosBlock = adjuntos
        ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px;">${adjuntos}</div>`
        : '';

    const comments = (ticket.comments || []);
    const commentsBlock = comments.length
        ? `<div style="border-top:1px solid #e5e7eb;margin-top:12px;padding-top:10px;">
                <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">Conversación</div>
                ${comments.map(c => `
                    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin-bottom:6px;background:#fafafa;">
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px;">
                            <span style="font-size:13px;font-weight:700;color:#111827;">${escHtml(c.author_name || 'Usuario')}</span>
                            <span style="font-size:10px;font-weight:700;color:#6b7280;background:#eef2ff;border:1px solid #c7d2fe;border-radius:999px;padding:1px 6px;">${escHtml(ROLE_LABELS[c.author_role] || c.author_role || '')}</span>
                            <span style="font-size:11px;color:#9ca3af;margin-left:auto;">${formatArgentinaDate(c.created_at)}</span>
                        </div>
                        <div style="font-size:13px;color:#374151;white-space:pre-wrap;">${escHtml(c.body)}</div>
                    </div>
                `).join('')}
           </div>`
        : `<div style="border-top:1px solid #e5e7eb;margin-top:12px;padding-top:10px;font-size:13px;color:#9ca3af;">Todavía no hay mensajes en la conversación.</div>`;

    const detailHtml = `
        <div style="text-align:left;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
                <strong style="font-size:16px;color:#111827;overflow-wrap:anywhere;">${escHtml(ticket.titulo)}</strong>
                ${badge}
            </div>
            <div style="font-size:12px;color:#6b7280;margin-bottom:10px;">${meta}</div>
            ${resueltoBlock}
            <div style="font-size:14px;color:#374151;white-space:pre-wrap;overflow-wrap:anywhere;">${escHtml(ticket.descripcion)}</div>
            ${adjuntosBlock}
            ${commentsBlock}
        </div>
    `;

    // Visor de un adjunto dentro del mismo popup, con boton para volver al detalle.
    const viewerHtml = (att) => {
        const isVideo = (att.mime_type || '').startsWith('video/');
        const media = isVideo
            ? `<video src="${escHtml(att.url)}" controls autoplay playsinline style="max-width:100%;max-height:70vh;border-radius:8px;background:#000;"></video>`
            : `<img src="${escHtml(att.url)}" alt="" style="max-width:100%;max-height:70vh;object-fit:contain;border-radius:8px;" />`;
        return `
            <div style="text-align:left;">
                <button type="button" data-back="1" style="display:inline-flex;align-items:center;gap:6px;background:none;border:none;color:#00AEEF;font-weight:700;font-size:14px;cursor:pointer;padding:0;margin-bottom:10px;">← Volver al ticket</button>
                <div style="display:flex;align-items:center;justify-content:center;">${media}</div>
            </div>
        `;
    };

    const renderDetail = () => {
        Swal.update({
            html: detailHtml,
            showCloseButton: true,
            showConfirmButton: true,
            confirmButtonText: 'Cerrar',
            confirmButtonColor: '#00AEEF',
        });
        Swal.hideLoading();
        bindHandlers();
    };

    const renderViewer = (idx) => {
        Swal.update({
            html: viewerHtml(attachments[idx]),
            showCloseButton: true,
            showConfirmButton: false,
        });
        bindHandlers();
    };

    // Re-engancha los listeners cada vez que cambia el contenido del popup.
    function bindHandlers() {
        const container = Swal.getHtmlContainer();
        if (!container) return;
        container.querySelectorAll('[data-att]').forEach(btn => {
            btn.addEventListener('click', () => renderViewer(Number(btn.getAttribute('data-att'))));
        });
        const back = container.querySelector('[data-back]');
        if (back) back.addEventListener('click', renderDetail);
    }

    renderDetail();
}

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
