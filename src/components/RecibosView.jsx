'use client';

import { useState, useRef, useEffect } from 'react';
import { notify } from '@/lib/toast';

function brandColor() {
    if (typeof window === 'undefined') return '#00B4D8';
    return getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#00B4D8';
}

export default function RecibosView() {
    const [file, setFile] = useState(null);
    const [phase, setPhase] = useState('idle'); // idle | uploading | processing | done
    const [progress, setProgress] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [result, setResult] = useState(null); // { url, stats }

    const inputRef = useRef(null);
    const xhrRef = useRef(null);
    const animRef = useRef(null);

    const busy = phase === 'uploading' || phase === 'processing';

    useEffect(() => () => {
        if (animRef.current) clearInterval(animRef.current);
        if (xhrRef.current) xhrRef.current.abort();
        if (result?.url) URL.revokeObjectURL(result.url);
    }, [result]);

    const resetResult = () => {
        setResult(prev => {
            if (prev?.url) URL.revokeObjectURL(prev.url);
            return null;
        });
    };

    const stopAnim = () => {
        if (animRef.current) { clearInterval(animRef.current); animRef.current = null; }
    };

    // Fase de procesamiento: la barra avanza suave hacia ~92% mientras el server trabaja.
    const startProcessingAnim = () => {
        setPhase('processing');
        stopAnim();
        animRef.current = setInterval(() => {
            setProgress(p => (p >= 92 ? 92 : p + Math.max(0.6, (92 - p) * 0.05)));
        }, 180);
    };

    const handleSelect = (f) => {
        if (!f) return;
        if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
            notify.error('El archivo debe ser un PDF.');
            return;
        }
        resetResult();
        setPhase('idle');
        setProgress(0);
        setFile(f);
    };

    const triggerDownload = (url) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'recibos-lasia.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    const showSuccess = async (stats, url) => {
        const { default: Swal } = await import('sweetalert2');
        const lines = [
            `<b>${stats?.saved ?? '?'}</b> recibo(s) generado(s) de <b>${stats?.total ?? '?'}</b> página(s).`,
        ];
        if (stats?.duplicates > 0) lines.push(`${stats.duplicates} duplicado(s) omitido(s).`);
        if (stats?.sinCuil > 0) lines.push(`${stats.sinCuil} página(s) sin CUIL (guardadas como <i>pagina_N.pdf</i>).`);

        const res = await Swal.fire({
            title: '¡Recibos procesados!',
            html: lines.join('<br>'),
            icon: 'success',
            confirmButtonText: '⬇️ Descargar carpeta (.zip)',
            confirmButtonColor: brandColor(),
            showCancelButton: true,
            cancelButtonText: 'Cerrar',
        });
        if (res.isConfirmed) triggerDownload(url);
    };

    const showError = async (msg) => {
        const { default: Swal } = await import('sweetalert2');
        await Swal.fire({
            title: 'No se pudo procesar',
            text: msg,
            icon: 'error',
            confirmButtonColor: '#EF4444',
        });
    };

    const handleProcess = () => {
        if (!file || busy) return;
        resetResult();
        setPhase('uploading');
        setProgress(0);

        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open('POST', '/api/recibos/split');
        xhr.responseType = 'blob';

        // Progreso real de subida: 0 → 40%.
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setProgress(Math.min(40, Math.round((e.loaded / e.total) * 40)));
        };
        xhr.upload.onload = () => startProcessingAnim();

        xhr.onload = async () => {
            stopAnim();
            xhrRef.current = null;

            if (xhr.status === 200) {
                let stats = null;
                const raw = xhr.getResponseHeader('X-Recibos-Summary');
                if (raw) { try { stats = JSON.parse(decodeURIComponent(raw)); } catch { /* ignore */ } }

                const url = URL.createObjectURL(xhr.response);
                setProgress(100);
                setPhase('done');
                setResult({ url, stats });
                showSuccess(stats, url);
            } else {
                let msg = 'No se pudo procesar el PDF.';
                try { msg = JSON.parse(await xhr.response.text())?.error || msg; } catch { /* no-JSON */ }
                setPhase('idle');
                setProgress(0);
                showError(msg);
            }
        };

        xhr.onerror = () => {
            stopAnim();
            xhrRef.current = null;
            setPhase('idle');
            setProgress(0);
            showError('Error de conexión al procesar el PDF.');
        };

        xhr.send(formData);
    };

    const clearAll = () => {
        if (busy) return;
        resetResult();
        setFile(null);
        setPhase('idle');
        setProgress(0);
        if (inputRef.current) inputRef.current.value = '';
    };

    const onDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        if (busy) return;
        handleSelect(e.dataTransfer.files?.[0]);
    };

    const progressLabel = phase === 'uploading' ? 'Subiendo archivo…' : phase === 'processing' ? 'Procesando recibos…' : 'Listo';

    return (
        <div className="recibos-view">
            <header className="page-header" style={{ marginBottom: '2rem' }}>
                <div>
                    <h1>Recibos</h1>
                    <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
                        Subí el PDF con todos los recibos y descargá cada uno separado por CUIL.
                    </p>
                </div>
            </header>

            <div className="card recibos-card">
                {!file ? (
                    <div
                        className={`recibos-dropzone${dragging ? ' is-dragging' : ''}${busy ? ' is-disabled' : ''}`}
                        onClick={() => inputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={onDrop}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
                    >
                        <div className="recibos-dz-icon">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                        </div>
                        <div className="recibos-dz-title">Arrastrá el PDF acá o hacé clic para elegirlo</div>
                        <div className="recibos-dz-hint">Un único PDF con todos los recibos (uno por página)</div>
                    </div>
                ) : (
                    <div className="recibos-file-chip">
                        <div className="recibos-file-icon">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                            </svg>
                        </div>
                        <div className="recibos-file-meta">
                            <div className="recibos-file-name">{file.name}</div>
                            <div className="recibos-file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                        </div>
                        {!busy && (
                            <button className="recibos-file-remove" onClick={clearAll} title="Quitar archivo" aria-label="Quitar archivo">×</button>
                        )}
                    </div>
                )}

                <input
                    ref={inputRef}
                    type="file"
                    accept="application/pdf"
                    disabled={busy}
                    onChange={(e) => handleSelect(e.target.files?.[0])}
                    style={{ display: 'none' }}
                />

                {busy && (
                    <div className="recibos-progress">
                        <div className="recibos-progress-head">
                            <span>{progressLabel}</span>
                            <span className="recibos-progress-pct">{Math.round(progress)}%</span>
                        </div>
                        <div className="recibos-progress-track">
                            <div className="recibos-progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                )}

                {file && !busy && (
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" onClick={handleProcess}>Procesar</button>
                        <button className="btn btn-secondary" onClick={clearAll}>Limpiar</button>
                    </div>
                )}

                {result && !busy && (
                    <div className="recibos-result">
                        <a className="btn btn-primary" href={result.url} download="recibos-lasia.zip">
                            ⬇️ Descargar carpeta (.zip)
                        </a>
                        {result.stats && (
                            <div className="recibos-stats">
                                <div>✅ Recibos generados: <span className="recibos-stat-strong">{result.stats.saved}</span> de {result.stats.total} páginas</div>
                                {result.stats.duplicates > 0 && <div>➡️ Duplicados omitidos: {result.stats.duplicates}</div>}
                                {result.stats.sinCuil > 0 && <div>⚠️ Páginas sin CUIL: {result.stats.sinCuil} (guardadas como <em>pagina_N.pdf</em>)</div>}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
