'use client';

import { useEffect, useState } from 'react';

/**
 * Modal viewer para fotos/videos adjuntos.
 *
 * Props:
 *  - attachments: array de { id, file_name, mime_type, url }
 *  - initialIndex: índice inicial a mostrar
 *  - onClose: callback al cerrar
 */
export function AttachmentLightbox({ attachments, initialIndex = 0, onClose }) {
    const [index, setIndex] = useState(initialIndex);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1));
            if (e.key === 'ArrowRight') setIndex(i => Math.min(attachments.length - 1, i + 1));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [attachments.length, onClose]);

    const [downloading, setDownloading] = useState(false);

    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (!attachments?.length) return null;
    const att = attachments[index];
    const isVideo = att.mime_type?.startsWith('video/');

    const handleDownload = async (e) => {
        e.stopPropagation();
        // En celular la descarga vía blob no es confiable (sobre todo iOS).
        // Abrimos el archivo a pantalla completa para que el usuario use "Guardar" nativo.
        if (isMobile) {
            window.open(att.url, '_blank');
            return;
        }
        if (downloading) return;
        setDownloading(true);
        try {
            const res = await fetch(att.url);
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = att.file_name || 'archivo';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
        } catch (_) {
            window.open(att.url, '_blank');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
                zIndex: 100, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', padding: '2rem',
            }}
        >
            <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                style={{
                    position: 'absolute', top: '1rem', right: '1rem',
                    border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff',
                    width: '40px', height: '40px', borderRadius: '50%',
                    fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1,
                }}
                aria-label="Cerrar"
            >×</button>

            {attachments.length > 1 && (
                <>
                    <button
                        onClick={(e) => { e.stopPropagation(); setIndex(i => Math.max(0, i - 1)); }}
                        disabled={index === 0}
                        style={{
                            position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)',
                            border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff',
                            width: '48px', height: '48px', borderRadius: '50%',
                            fontSize: '1.5rem', cursor: index === 0 ? 'not-allowed' : 'pointer',
                            opacity: index === 0 ? 0.3 : 1,
                        }}
                        aria-label="Anterior"
                    >‹</button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setIndex(i => Math.min(attachments.length - 1, i + 1)); }}
                        disabled={index === attachments.length - 1}
                        style={{
                            position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)',
                            border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff',
                            width: '48px', height: '48px', borderRadius: '50%',
                            fontSize: '1.5rem', cursor: index === attachments.length - 1 ? 'not-allowed' : 'pointer',
                            opacity: index === attachments.length - 1 ? 0.3 : 1,
                        }}
                        aria-label="Siguiente"
                    >›</button>
                </>
            )}

            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    maxWidth: '90vw', maxHeight: '80vh',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >
                {isVideo ? (
                    <video
                        src={att.url}
                        controls
                        autoPlay
                        style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '8px', background: '#000' }}
                    />
                ) : (
                    <img
                        src={att.url}
                        alt={att.file_name}
                        style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px' }}
                    />
                )}
            </div>

            <div style={{ marginTop: '1rem', color: '#fff', fontSize: '0.85rem', textAlign: 'center' }}>
                <div style={{ fontWeight: 600 }}>{att.file_name}</div>
                {attachments.length > 1 && (
                    <div style={{ opacity: 0.7, marginTop: '0.2rem' }}>
                        {index + 1} / {attachments.length}
                    </div>
                )}
                <button
                    type="button"
                    onClick={handleDownload}
                    disabled={downloading}
                    style={{ display: 'inline-block', marginTop: '0.5rem', background: 'none', border: 'none', color: '#60A5FA', fontSize: '0.82rem', textDecoration: 'underline', cursor: downloading ? 'wait' : 'pointer', padding: 0 }}
                >
                    {downloading ? 'Descargando...' : isMobile ? 'Abrir para guardar' : 'Descargar'}
                </button>
            </div>
        </div>
    );
}

/**
 * Grilla de miniaturas que abren el lightbox.
 *
 * Props:
 *  - attachments: array de { id, file_name, mime_type, url }
 *  - size: tamaño de cada miniatura (px), default 64
 */
export function AttachmentThumbs({ attachments, size = 64 }) {
    const [openIdx, setOpenIdx] = useState(null);
    if (!attachments?.length) return null;
    return (
        <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {attachments.map((att, i) => (
                    <button
                        key={att.id}
                        onClick={(e) => { e.stopPropagation(); setOpenIdx(i); }}
                        title={att.file_name}
                        style={{
                            width: `${size}px`, height: `${size}px`,
                            borderRadius: '6px', overflow: 'hidden',
                            border: '1px solid var(--border-color)',
                            background: '#000', padding: 0, cursor: 'pointer',
                            position: 'relative',
                        }}
                    >
                        {att.mime_type?.startsWith('image/') ? (
                            <img src={att.url} alt={att.file_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: `${size * 0.4}px` }}>🎬</div>
                        )}
                    </button>
                ))}
            </div>
            {openIdx !== null && (
                <AttachmentLightbox
                    attachments={attachments}
                    initialIndex={openIdx}
                    onClose={() => setOpenIdx(null)}
                />
            )}
        </>
    );
}
