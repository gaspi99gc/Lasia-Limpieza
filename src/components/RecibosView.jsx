'use client';

import { useState, useRef, useEffect } from 'react';
import { notify } from '@/lib/toast';
import { candidatesOnText, buildBlacklist, resolveCuil, hashText } from '@/lib/recibos';

function brandColor() {
    if (typeof window === 'undefined') return '#00B4D8';
    return getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#00B4D8';
}

// Procesa el PDF completamente en el navegador: extrae texto por página (pdfjs),
// parte cada página (pdf-lib) nombrándola por CUIL, saltea duplicados idénticos
// y arma un ZIP (jszip). onProgress recibe un porcentaje 0..100.
async function processPdfInBrowser(file, onProgress) {
    const buf = await file.arrayBuffer();

    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) });
    const doc = await loadingTask.promise;
    const numPages = doc.numPages;

    const texts = [];
    try {
        for (let i = 1; i <= numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            texts.push(content.items.map(it => it.str).join(' '));
            onProgress((i / numPages) * 50); // extracción: 0 → 50%
        }
    } finally {
        await loadingTask.destroy();
    }

    const pageCandidates = texts.map(candidatesOnText);
    const blacklist = buildBlacklist(pageCandidates);

    const { PDFDocument } = await import('pdf-lib');
    const JSZip = (await import('jszip')).default;

    const srcDoc = await PDFDocument.load(new Uint8Array(buf.slice(0)));
    const zip = new JSZip();

    const seenHashesByKey = {};
    const usedNames = new Set();
    const stats = { total: numPages, saved: 0, duplicates: 0, sinCuil: 0 };

    for (let i = 0; i < numPages; i++) {
        const cuil = resolveCuil(texts[i], pageCandidates[i], blacklist);

        let filename, key;
        if (cuil) {
            filename = `${cuil}.pdf`;
            key = cuil;
        } else {
            filename = `pagina_${i + 1}.pdf`;
            key = `pagina_${i + 1}`;
            stats.sinCuil++;
        }

        const h = hashText(texts[i]);
        if (!seenHashesByKey[key]) seenHashesByKey[key] = new Set();
        if (seenHashesByKey[key].has(h)) {
            stats.duplicates++;
            onProgress(50 + ((i + 1) / numPages) * 45);
            continue;
        }

        let finalName = filename;
        if (usedNames.has(finalName)) finalName = `${filename.replace(/\.pdf$/i, '')}_p${i + 1}.pdf`;

        const single = await PDFDocument.create();
        const [copied] = await single.copyPages(srcDoc, [i]);
        single.addPage(copied);
        zip.file(finalName, await single.save());

        usedNames.add(finalName);
        seenHashesByKey[key].add(h);
        stats.saved++;
        onProgress(50 + ((i + 1) / numPages) * 45); // partido: 50 → 95%
    }

    const blob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE' },
        (meta) => onProgress(95 + meta.percent * 0.05), // zip: 95 → 100%
    );
    onProgress(100);
    return { blob, stats };
}

export default function RecibosView() {
    const [file, setFile] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [result, setResult] = useState(null); // { url, stats }

    const inputRef = useRef(null);

    useEffect(() => () => {
        if (result?.url) URL.revokeObjectURL(result.url);
    }, [result]);

    const resetResult = () => {
        setResult(prev => {
            if (prev?.url) URL.revokeObjectURL(prev.url);
            return null;
        });
    };

    const handleSelect = (f) => {
        if (!f) return;
        if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
            notify.error('El archivo debe ser un PDF.');
            return;
        }
        resetResult();
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
        await Swal.fire({ title: 'No se pudo procesar', text: msg, icon: 'error', confirmButtonColor: '#EF4444' });
    };

    const handleProcess = async () => {
        if (!file || processing) return;
        resetResult();
        setProcessing(true);
        setProgress(0);

        try {
            const { blob, stats } = await processPdfInBrowser(file, (p) => {
                setProgress(prev => (p > prev ? p : prev)); // monótono, nunca retrocede
            });
            const url = URL.createObjectURL(blob);
            setResult({ url, stats });
            showSuccess(stats, url);
        } catch (err) {
            console.error(err);
            setProgress(0);
            showError('No se pudo procesar el PDF. ¿Es un archivo válido?');
        } finally {
            setProcessing(false);
        }
    };

    const clearAll = () => {
        if (processing) return;
        resetResult();
        setFile(null);
        setProgress(0);
        if (inputRef.current) inputRef.current.value = '';
    };

    const onDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        if (processing) return;
        handleSelect(e.dataTransfer.files?.[0]);
    };

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
                        className={`recibos-dropzone${dragging ? ' is-dragging' : ''}${processing ? ' is-disabled' : ''}`}
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
                        {!processing && (
                            <button className="recibos-file-remove" onClick={clearAll} title="Quitar archivo" aria-label="Quitar archivo">×</button>
                        )}
                    </div>
                )}

                <input
                    ref={inputRef}
                    type="file"
                    accept="application/pdf"
                    disabled={processing}
                    onChange={(e) => handleSelect(e.target.files?.[0])}
                    style={{ display: 'none' }}
                />

                {processing && (
                    <div className="recibos-progress">
                        <div className="recibos-progress-head">
                            <span>Procesando recibos…</span>
                            <span className="recibos-progress-pct">{Math.round(progress)}%</span>
                        </div>
                        <div className="recibos-progress-track">
                            <div className="recibos-progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                )}

                {file && !processing && (
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" onClick={handleProcess}>Procesar</button>
                        <button className="btn btn-secondary" onClick={clearAll}>Limpiar</button>
                    </div>
                )}

                {result && !processing && (
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
