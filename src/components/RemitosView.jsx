'use client';

import { useState } from 'react';
import { formatArgentinaDateTime, getArgentinaDateStamp } from '@/lib/datetime';

async function loadImageDataUrl(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('No se pudo preparar el logo.')); return; }
            ctx.drawImage(image, 0, 0);
            resolve({ dataUrl: canvas.toDataURL('image/png'), width: image.naturalWidth, height: image.naturalHeight });
        };
        image.onerror = () => reject(new Error('No se pudo cargar el logo.'));
        image.src = src;
    });
}

function fmtYMD(ymd) {
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
}

function periodoLabel(dateFrom, dateTo) {
    return dateFrom === dateTo ? fmtYMD(dateFrom) : `${fmtYMD(dateFrom)} al ${fmtYMD(dateTo)}`;
}

function periodoStamp(dateFrom, dateTo) {
    return dateFrom === dateTo ? dateFrom : `${dateFrom}_a_${dateTo}`;
}

function totals(lineas) {
    return {
        insumos: lineas.length,
        unidades: lineas.reduce((sum, l) => sum + (Number(l.cantidad_total) || 0), 0),
    };
}

async function exportRemitoPdf({ lineas, title, dateFrom, dateTo, totalPedidos, showProvider }) {
    if (!lineas.length) { alert('No hay insumos para este remito.'); return; }
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
    ]);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

    try {
        const logo = await loadImageDataUrl('/branding/logo-lasia-limpieza.png');
        const pageWidth = doc.internal.pageSize.getWidth();
        const targetWidth = 160;
        const targetHeight = Math.max(24, targetWidth * (logo.height / logo.width));
        doc.addImage(logo.dataUrl, 'PNG', (pageWidth - targetWidth) / 2, 14, targetWidth, targetHeight);
    } catch (e) {
        console.warn('No se pudo agregar el logo al PDF:', e);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(title, 40, 84);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Período de carga: ${periodoLabel(dateFrom, dateTo)}`, 40, 104);
    doc.text(`Pedidos incluidos: ${totalPedidos}`, 40, 118);
    doc.text(`Generado: ${formatArgentinaDateTime(new Date())}`, 40, 132);

    const t = totals(lineas);
    const head = showProvider
        ? [['Insumo', 'Proveedor', 'Cantidad', 'Unidad']]
        : [['Insumo', 'Cantidad', 'Unidad']];
    const body = lineas.map(l => showProvider
        ? [l.nombre, l.provider_name, l.cantidad_total, l.unidad]
        : [l.nombre, l.cantidad_total, l.unidad]);

    autoTable(doc, {
        startY: 150,
        head,
        body,
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
        headStyles: { fillColor: [31, 58, 74], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: showProvider
            ? { 2: { halign: 'center', cellWidth: 70 }, 3: { halign: 'center', cellWidth: 70 } }
            : { 1: { halign: 'center', cellWidth: 80 }, 2: { halign: 'center', cellWidth: 80 } },
        margin: { left: 40, right: 40, bottom: 36 },
    });

    const finalY = doc.lastAutoTable.finalY || 150;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Insumos distintos: ${t.insumos}     Total de unidades: ${t.unidades}`, 40, finalY + 22);

    const safe = title.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, '_');
    doc.save(`${safe}_${periodoStamp(dateFrom, dateTo)}.pdf`);
}

async function exportRemitoExcel({ lineas, title, dateFrom, dateTo, showProvider }) {
    if (!lineas.length) { alert('No hay insumos para este remito.'); return; }
    const XLSX = await import('xlsx');
    const rows = lineas.map(l => showProvider
        ? { Insumo: l.nombre, Proveedor: l.provider_name, Cantidad: l.cantidad_total, Unidad: l.unidad }
        : { Insumo: l.nombre, Cantidad: l.cantidad_total, Unidad: l.unidad });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = showProvider
        ? [{ wch: 40 }, { wch: 26 }, { wch: 12 }, { wch: 12 }]
        : [{ wch: 40 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Remito');
    const safe = title.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, '_');
    XLSX.writeFile(wb, `${safe}_${periodoStamp(dateFrom, dateTo)}.xlsx`);
}

// Builds (but does not save) the per-service remito PDF. Logo is preloaded so
// the same call works for one-off downloads and bulk ZIP generation.
function buildServicioPdf({ jsPDF, autoTable, servicio, dateFrom, dateTo, logo }) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

    if (logo) {
        try {
            const pageWidth = doc.internal.pageSize.getWidth();
            const targetWidth = 160;
            const targetHeight = Math.max(24, targetWidth * (logo.height / logo.width));
            doc.addImage(logo.dataUrl, 'PNG', (pageWidth - targetWidth) / 2, 14, targetWidth, targetHeight);
        } catch (e) {
            console.warn('No se pudo agregar el logo al PDF:', e);
        }
    }

    const supervisor = servicio.supervisor_surname
        ? `${servicio.supervisor_surname}, ${servicio.supervisor_name}`
        : servicio.supervisor_name;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(`Remito — ${servicio.service_name}`, 40, 84);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    let y = 104;
    if (servicio.service_address) { doc.text(`Dirección: ${servicio.service_address}`, 40, y); y += 14; }
    if (supervisor) { doc.text(`Supervisor: ${supervisor}`, 40, y); y += 14; }
    doc.text(`Período de carga: ${periodoLabel(dateFrom, dateTo)}`, 40, y); y += 14;
    doc.text(`Generado: ${formatArgentinaDateTime(new Date())}`, 40, y); y += 18;

    autoTable(doc, {
        startY: y,
        head: [['Insumo', 'Cantidad', 'Unidad']],
        body: servicio.lineas.map(l => [l.nombre, l.cantidad_total, l.unidad]),
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
        headStyles: { fillColor: [31, 58, 74], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 1: { halign: 'center', cellWidth: 80 }, 2: { halign: 'center', cellWidth: 80 } },
        margin: { left: 40, right: 40, bottom: 36 },
    });

    return doc;
}

function safeFileName(name) {
    return name.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ _-]+/g, '_').trim() || 'Servicio';
}

async function exportServicioPdf({ servicio, dateFrom, dateTo }) {
    if (!servicio.lineas.length) { alert('Este servicio no tiene insumos.'); return; }
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
    ]);
    let logo = null;
    try { logo = await loadImageDataUrl('/branding/logo-lasia-limpieza.png'); } catch { /* sin logo */ }
    const doc = buildServicioPdf({ jsPDF, autoTable, servicio, dateFrom, dateTo, logo });
    doc.save(`${safeFileName(servicio.service_name)}.pdf`);
}

async function exportAllServiciosZip({ servicios, dateFrom, dateTo }) {
    const conItems = servicios.filter(s => s.lineas.length);
    if (!conItems.length) { alert('No hay servicios con insumos para descargar.'); return; }

    const [{ jsPDF }, { default: autoTable }, { default: JSZip }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
        import('jszip'),
    ]);
    let logo = null;
    try { logo = await loadImageDataUrl('/branding/logo-lasia-limpieza.png'); } catch { /* sin logo */ }

    const zip = new JSZip();
    const usedNames = new Set();
    for (const servicio of conItems) {
        const doc = buildServicioPdf({ jsPDF, autoTable, servicio, dateFrom, dateTo, logo });
        const base = safeFileName(servicio.service_name);
        let name = `${base}.pdf`;
        let i = 2;
        while (usedNames.has(name)) name = `${base} (${i++}).pdf`;
        usedNames.add(name);
        zip.file(name, doc.output('arraybuffer'));
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Remitos_por_servicio_${periodoStamp(dateFrom, dateTo)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
}

async function exportServicioExcel({ servicio, dateFrom, dateTo }) {
    if (!servicio.lineas.length) { alert('Este servicio no tiene insumos.'); return; }
    const XLSX = await import('xlsx');
    const rows = servicio.lineas.map(l => ({ Insumo: l.nombre, Cantidad: l.cantidad_total, Unidad: l.unidad }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 40 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Remito');
    const safe = servicio.service_name.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, '_');
    XLSX.writeFile(wb, `Remito_${safe}_${periodoStamp(dateFrom, dateTo)}.xlsx`);
}

const STEP_LABELS = ['Fecha', 'Remitos'];

function Stepper({ step }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.75rem' }}>
            {STEP_LABELS.map((label, i) => {
                const num = i + 1;
                const done = num < step;
                const active = num === step;
                return (
                    <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                            <div style={{
                                width: '32px', height: '32px', borderRadius: '50%',
                                background: done ? 'var(--success)' : active ? 'var(--color-primary)' : 'var(--border-color)',
                                color: done || active ? '#fff' : 'var(--text-muted)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 700, fontSize: '0.85rem', transition: 'all 0.2s',
                            }}>
                                {done ? '✓' : num}
                            </div>
                            <span style={{
                                fontSize: '0.68rem', letterSpacing: '0.03em',
                                color: active ? 'var(--color-primary)' : done ? 'var(--success)' : 'var(--text-muted)',
                                fontWeight: active ? 700 : 500,
                            }}>
                                {label}
                            </span>
                        </div>
                        {i < STEP_LABELS.length - 1 && (
                            <div style={{
                                width: '48px', height: '2px',
                                background: done ? 'var(--success)' : 'var(--border-color)',
                                margin: '0 6px', marginBottom: '20px', transition: 'background 0.2s',
                            }} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function RemitoListItem({ title, description, lineas, dateFrom, dateTo, totalPedidos, showProvider, emptyText }) {
    const t = totals(lineas);
    const disabled = !lineas.length;
    return (
        <div className="card" style={{ padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{title}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.83rem', margin: '0.15rem 0 0' }}>{description}</div>
                <div style={{ fontSize: '0.83rem', marginTop: '0.4rem' }}>
                    {disabled ? (
                        <span style={{ color: 'var(--text-muted)' }}>{emptyText}</span>
                    ) : (
                        <span>
                            <strong>{t.insumos}</strong> insumo{t.insumos !== 1 ? 's' : ''} · <strong>{t.unidades}</strong> unidad{t.unidades !== 1 ? 'es' : ''}
                        </span>
                    )}
                </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button className="btn btn-primary" disabled={disabled}
                    onClick={() => exportRemitoPdf({ lineas, title, dateFrom, dateTo, totalPedidos, showProvider })}>PDF</button>
                <button className="btn btn-secondary" disabled={disabled}
                    onClick={() => exportRemitoExcel({ lineas, title, dateFrom, dateTo, showProvider })}>Excel</button>
            </div>
        </div>
    );
}

export default function RemitosView() {
    const today = getArgentinaDateStamp();
    const [step, setStep] = useState(1);
    const [dateFrom, setDateFrom] = useState(today);
    const [dateTo, setDateTo] = useState(today);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [servicios, setServicios] = useState(null);
    const [serviciosLoading, setServiciosLoading] = useState(false);
    const [serviceSearch, setServiceSearch] = useState('');
    const [zipLoading, setZipLoading] = useState(false);
    const [limposLoading, setLimposLoading] = useState(false);

    // Loads (and caches) the per-service breakdown for the current range.
    const ensureServicios = async () => {
        if (servicios) return servicios;
        setServiciosLoading(true);
        try {
            const res = await fetch(`/api/remitos?date_from=${dateFrom}&date_to=${dateTo}&group=service`);
            const json = await res.json().catch(() => null);
            if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar los remitos por servicio.');
            const list = json.servicios || [];
            setServicios(list);
            return list;
        } catch (e) {
            setError(e.message || 'Error al cargar.');
            setServicios([]);
            return [];
        } finally {
            setServiciosLoading(false);
        }
    };

    const downloadAllZip = async () => {
        if (!servicios?.length) return;
        setZipLoading(true);
        try {
            await exportAllServiciosZip({ servicios, dateFrom: data.dateFrom, dateTo: data.dateTo });
        } finally {
            setZipLoading(false);
        }
    };

    const downloadLimposExcel = async () => {
        setLimposLoading(true);
        try {
            const res = await fetch(`/api/remitos/limpos-excel?date_from=${data.dateFrom}&date_to=${data.dateTo}`);
            if (!res.ok) {
                const j = await res.json().catch(() => null);
                alert(j?.error || 'No se pudo generar el Excel de Limpos.');
                return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Remito_Limpos_por_servicio_${periodoStamp(data.dateFrom, data.dateTo)}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setLimposLoading(false);
        }
    };

    const loadRemito = async () => {
        if (!dateFrom || !dateTo) { setError('Elegí la fecha de inicio y de fin.'); return; }
        if (dateFrom > dateTo) { setError('La fecha de inicio no puede ser posterior a la de fin.'); return; }
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/remitos?date_from=${dateFrom}&date_to=${dateTo}`);
            const json = await res.json().catch(() => null);
            if (!res.ok) throw new Error(json?.error || 'No se pudo cargar el remito.');
            setData(json);
            setServicios(null); // reset per-service cache for the new range
            setStep(2);
        } catch (e) {
            setError(e.message || 'Error al cargar.');
            setData(null);
        } finally {
            setLoading(false);
        }
    };

    const goToPerService = async () => {
        setStep(3);
        setServiceSearch('');
        await ensureServicios();
    };

    const filteredServicios = (servicios || []).filter(s =>
        s.service_name.toLowerCase().includes(serviceSearch.trim().toLowerCase()));

    const limposProvider = data?.providers.find(p => (p.provider_name || '').toLowerCase().includes('limpos'));
    const limposLineas = limposProvider
        ? data.lineas.filter(l => l.provider_id === limposProvider.provider_id)
        : [];
    const limposTotals = totals(limposLineas);

    return (
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
            <div style={{ marginBottom: '1.25rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Remitos</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0.25rem 0 0' }}>
                    Generá los remitos agregados a partir de los pedidos cargados.
                </p>
            </div>

            <Stepper step={Math.min(step, 2)} />

            {/* ── PASO 1: Fecha ── */}
            {step === 1 && (
                <div className="card" style={{ padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '0.88rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Período de carga de los pedidos
                    </h3>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <div className="form-group" style={{ margin: 0, flex: '1 1 180px' }}>
                            <label>Desde</label>
                            <input type="date" value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)} />
                        </div>
                        <div className="form-group" style={{ margin: 0, flex: '1 1 180px' }}>
                            <label>Hasta</label>
                            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} />
                        </div>
                    </div>
                    {error && (
                        <p style={{ color: 'var(--error)', fontSize: '0.9rem', margin: '0.85rem 0 0' }}>{error}</p>
                    )}
                    <button
                        className="btn btn-primary"
                        style={{ width: '100%', marginTop: '1.25rem', minHeight: '48px', fontWeight: 700 }}
                        onClick={loadRemito}
                        disabled={loading}
                    >
                        {loading ? 'Cargando...' : 'Ver remitos →'}
                    </button>
                </div>
            )}

            {/* ── PASO 2: Lista de remitos ── */}
            {step === 2 && data && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="card" style={{ padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <button
                            className="btn btn-secondary"
                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', flexShrink: 0 }}
                            onClick={() => setStep(1)}
                        >
                            ← Volver
                        </button>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>{periodoLabel(data.dateFrom, data.dateTo)}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {data.totalPedidos} pedido{data.totalPedidos !== 1 ? 's' : ''} de {data.totalServicios} servicio{data.totalServicios !== 1 ? 's' : ''}
                            </div>
                        </div>
                    </div>

                    {data.totalPedidos === 0 ? (
                        <div className="card">
                            <p style={{ color: 'var(--text-muted)', margin: 0 }}>
                                No hay pedidos cargados entre el {periodoLabel(data.dateFrom, data.dateTo)}.
                            </p>
                        </div>
                    ) : (
                        <>
                            <RemitoListItem
                                title="Remito General"
                                description="Todos los insumos del período, sumados (agrupados por proveedor)."
                                lineas={data.lineas}
                                dateFrom={data.dateFrom}
                                dateTo={data.dateTo}
                                totalPedidos={data.totalPedidos}
                                showProvider
                                emptyText="No hay insumos para este período."
                            />
                            <div className="card" style={{ padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>Remito Limpos</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.83rem', margin: '0.15rem 0 0' }}>
                                        Excel con una pestaña por servicio (solo insumos de Limpos).
                                    </div>
                                    <div style={{ fontSize: '0.83rem', marginTop: '0.4rem' }}>
                                        {limposProvider ? (
                                            <span>
                                                <strong>{limposTotals.insumos}</strong> insumo{limposTotals.insumos !== 1 ? 's' : ''} · <strong>{limposTotals.unidades}</strong> unidad{limposTotals.unidades !== 1 ? 'es' : ''} en total
                                            </span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>No se encontró el proveedor &quot;Limpos&quot;.</span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    className="btn btn-primary"
                                    style={{ flexShrink: 0 }}
                                    onClick={downloadLimposExcel}
                                    disabled={limposLoading || !limposProvider || !limposLineas.length}
                                >
                                    {limposLoading ? 'Generando Excel...' : 'Excel por servicio'}
                                </button>
                            </div>
                            <div className="card" style={{ padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>Remitos por servicio</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.83rem', margin: '0.15rem 0 0' }}>
                                        Un remito con el detalle de cada servicio, para las entregas.
                                    </div>
                                    <div style={{ fontSize: '0.83rem', marginTop: '0.4rem' }}>
                                        <strong>{data.totalServicios}</strong> servicio{data.totalServicios !== 1 ? 's' : ''} con pedidos
                                    </div>
                                </div>
                                <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={goToPerService}>
                                    Ver servicios →
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── PASO 3: Remitos por servicio ── */}
            {step === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="card" style={{ padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button
                            className="btn btn-secondary"
                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', flexShrink: 0 }}
                            onClick={() => setStep(2)}
                        >
                            ← Volver
                        </button>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>Remitos por servicio</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {data ? periodoLabel(data.dateFrom, data.dateTo) : ''}
                                {servicios ? ` · ${servicios.length} servicio${servicios.length !== 1 ? 's' : ''}` : ''}
                            </div>
                        </div>
                        <button
                            className="btn btn-primary"
                            style={{ flexShrink: 0 }}
                            onClick={downloadAllZip}
                            disabled={zipLoading || serviciosLoading || !servicios?.length}
                        >
                            {zipLoading ? 'Generando ZIP...' : 'Descargar todos (ZIP)'}
                        </button>
                    </div>

                    {serviciosLoading ? (
                        <div className="card"><p style={{ color: 'var(--text-muted)', margin: 0 }}>Cargando servicios...</p></div>
                    ) : (servicios && servicios.length === 0) ? (
                        <div className="card"><p style={{ color: 'var(--text-muted)', margin: 0 }}>No hay servicios con pedidos en este período.</p></div>
                    ) : (
                        <>
                            <input
                                type="text"
                                value={serviceSearch}
                                onChange={e => setServiceSearch(e.target.value)}
                                placeholder="Buscar servicio..."
                                style={{ width: '100%', padding: '0.6rem 0.9rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.95rem', background: 'var(--color-surface)', color: 'var(--text-main)', outline: 'none' }}
                            />
                            {filteredServicios.length === 0 ? (
                                <div className="card"><p style={{ color: 'var(--text-muted)', margin: 0 }}>Sin resultados para “{serviceSearch}”.</p></div>
                            ) : filteredServicios.map(servicio => {
                                const t = totals(servicio.lineas);
                                const supervisor = servicio.supervisor_surname
                                    ? `${servicio.supervisor_surname}, ${servicio.supervisor_name}`
                                    : servicio.supervisor_name;
                                return (
                                    <div key={servicio.service_id} className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{servicio.service_name}</div>
                                            {supervisor && (
                                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.1rem 0 0' }}>{supervisor}</div>
                                            )}
                                            <div style={{ fontSize: '0.82rem', marginTop: '0.35rem' }}>
                                                <strong>{t.insumos}</strong> insumo{t.insumos !== 1 ? 's' : ''} · <strong>{t.unidades}</strong> unidad{t.unidades !== 1 ? 'es' : ''}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                            <button className="btn btn-primary" onClick={() => exportServicioPdf({ servicio, dateFrom: data.dateFrom, dateTo: data.dateTo })}>PDF</button>
                                            <button className="btn btn-secondary" onClick={() => exportServicioExcel({ servicio, dateFrom: data.dateFrom, dateTo: data.dateTo })}>Excel</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
