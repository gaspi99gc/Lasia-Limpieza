'use client';

import { useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { useCatalog } from '@/lib/CatalogContext';
import { matchesSearch } from '@/lib/search';

const todayAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const addDaysStr = (ymd, n) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};
const firstOfMonthStr = (ymd) => { const [y, m] = ymd.split('-'); return `${y}-${m}-01`; };
const fmtYMD = (ymd) => { if (!ymd) return ''; const [y, m, d] = ymd.split('-'); return `${d}/${m}/${y}`; };

export default function InformeFichadaPage() {
    const { supervisors } = useCatalog();
    const [downloadingExcelId, setDownloadingExcelId] = useState(null);
    const [downloadingPdfId, setDownloadingPdfId] = useState(null);
    const [viewerSupervisor, setViewerSupervisor] = useState(null);
    const [viewerData, setViewerData] = useState(null);
    const [viewerLoading, setViewerLoading] = useState(false);
    const [viewerError, setViewerError] = useState('');

    const [step, setStep] = useState(1);
    const [dateFrom, setDateFrom] = useState(() => addDaysStr(todayAR(), -6));
    const [dateTo, setDateTo] = useState(() => todayAR());
    const [activePreset, setActivePreset] = useState('7d');
    const [search, setSearch] = useState('');

    const applyPreset = (preset) => {
        const t = todayAR();
        setActivePreset(preset);
        if (preset === 'hoy') { setDateFrom(t); setDateTo(t); }
        else if (preset === '7d') { setDateFrom(addDaysStr(t, -6)); setDateTo(t); }
        else if (preset === 'mes') { setDateFrom(firstOfMonthStr(t)); setDateTo(t); }
    };

    const downloadReport = async (supervisor, kind) => {
        const { default: Swal } = await import('sweetalert2');
        const setId = kind === 'excel' ? setDownloadingExcelId : setDownloadingPdfId;
        const endpoint = kind === 'excel' ? 'weekly-excel' : 'weekly-pdf';
        const ext = kind === 'excel' ? 'xlsx' : 'pdf';
        try {
            setId(supervisor.id);
            const url = `/api/reports/${endpoint}?supervisor_id=${supervisor.id}&date_from=${dateFrom}&date_to=${dateTo}`;
            const response = await fetch(url);

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Error del servidor (${response.status})`);
            }

            const blob = await response.blob();
            const filename = response.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1]
                ?? `Informe_Fichada_${supervisor.surname}_${supervisor.name}.${ext}`;

            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
        } catch (error) {
            console.error('Error descargando informe:', error);
            await Swal.fire({
                title: 'Error',
                text: error.message || 'No se pudo descargar el informe.',
                icon: 'error',
                confirmButtonColor: '#ef4444',
            });
        } finally {
            setId(null);
        }
    };

    const openViewer = async (supervisor) => {
        setViewerSupervisor(supervisor);
        setViewerData(null);
        setViewerError('');
        setViewerLoading(true);
        try {
            const res = await fetch(`/api/reports/weekly-json?supervisor_id=${supervisor.id}&date_from=${dateFrom}&date_to=${dateTo}`);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Error del servidor (${res.status})`);
            }
            setViewerData(await res.json());
        } catch (e) {
            setViewerError(e.message || 'No se pudo cargar el informe.');
        } finally {
            setViewerLoading(false);
        }
    };

    const openDayDetail = async (day, sup) => {
        if (!day.visitas.length) return;
        const { default: Swal } = await import('sweetalert2');
        const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const filas = day.visitas.map(v => `
            <li class="swal-fichada-visit">
                <div class="swal-fichada-visit-main">
                    <strong>${esc(v.service_name)}</strong>
                    <span>${esc(v.ingresoHora)} → ${esc(v.egresoHora || '—')}</span>
                </div>
                <div class="swal-fichada-visit-meta">
                    ${v.duracion ? `<span class="swal-fichada-dur">${esc(v.duracion)}</span>` : ''}
                    ${v.ongoing ? `<span class="swal-fichada-badge is-ongoing">⏵ En curso</span>` : ''}
                    ${v.lejos ? `<span class="swal-fichada-badge is-lejos">⚠ Lejos${v.distanciaMetros ? ` (${v.distanciaMetros} m)` : ''}</span>` : ''}
                    ${Number.isFinite(v.gpsAccuracy) ? `<span class="swal-fichada-badge is-gps">GPS ±${v.gpsAccuracy}m</span>` : ''}
                </div>
            </li>
        `).join('');
        await Swal.fire({
            title: day.label,
            html: `
                <div class="swal-fichada-subtitle">${esc(sup ? `${sup.surname || ''}, ${sup.name || ''}` : '')}</div>
                <ul class="swal-fichada-visits">${filas}</ul>
            `,
            width: 560,
            showConfirmButton: true,
            confirmButtonText: 'Cerrar',
            confirmButtonColor: '#00AEEF',
        });
    };

    const closeViewer = () => {
        setViewerSupervisor(null);
        setViewerData(null);
        setViewerError('');
    };

    const presetBtn = (key, label) => (
        <button
            type="button"
            className={`btn ${activePreset === key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => applyPreset(key)}
            style={{ fontSize: '0.85rem' }}
        >
            {label}
        </button>
    );

    const filteredSupervisors = supervisors.filter(s =>
        matchesSearch(search, [s.surname, s.name, s.dni])
    );

    const rangeInvalid = !dateFrom || !dateTo || dateFrom > dateTo;

    return (
        <MainLayout>
            <div>
                <header className="page-header" style={{ marginBottom: '1.5rem' }}>
                    <h1>Informe de Fichada</h1>
                </header>

                {step === 1 ? (
                    <div className="card" style={{ maxWidth: '640px' }}>
                        <h3 style={{ marginTop: 0 }}>📅 Seleccionar período</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '-0.5rem' }}>
                            Elegí el rango de fechas del informe. Luego vas a poder descargar el PDF o Excel de cada supervisor.
                        </p>

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                            {presetBtn('hoy', 'Hoy')}
                            {presetBtn('7d', 'Últimos 7 días')}
                            {presetBtn('mes', 'Este mes')}
                            {presetBtn('custom', 'Personalizado')}
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                            <div style={{ flex: 1, minWidth: '160px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>Desde</label>
                                <input
                                    type="date"
                                    className="card"
                                    style={{ margin: 0, width: '100%' }}
                                    value={dateFrom}
                                    max={dateTo || undefined}
                                    onChange={e => { setDateFrom(e.target.value); setActivePreset('custom'); }}
                                />
                            </div>
                            <div style={{ flex: 1, minWidth: '160px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>Hasta</label>
                                <input
                                    type="date"
                                    className="card"
                                    style={{ margin: 0, width: '100%' }}
                                    value={dateTo}
                                    min={dateFrom || undefined}
                                    onChange={e => { setDateTo(e.target.value); setActivePreset('custom'); }}
                                />
                            </div>
                        </div>

                        {rangeInvalid && (
                            <div style={{ color: 'var(--error)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                                La fecha «desde» debe ser anterior o igual a la fecha «hasta».
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                className="btn btn-primary"
                                disabled={rangeInvalid}
                                onClick={() => setStep(2)}
                            >
                                Ver supervisores →
                            </button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setStep(1)} style={{ fontSize: '0.85rem' }}>
                                ← Cambiar fechas
                            </button>
                            <span style={{
                                fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)',
                                background: 'var(--color-muted-surface)', border: '1px solid var(--border-color)',
                                padding: '0.3rem 0.75rem', borderRadius: '6px',
                            }}>
                                Período: {fmtYMD(dateFrom)} al {fmtYMD(dateTo)}
                            </span>
                        </div>

                        <div className="card" style={{ padding: 0 }}>
                            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                                <input
                                    type="text"
                                    className="card"
                                    placeholder="Buscar supervisor por nombre o DNI..."
                                    style={{ margin: 0, width: '100%', maxWidth: '360px' }}
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                            </div>
                            <div className="table-container">
                                <table className="table mobile-cards-table">
                                    <thead>
                                        <tr>
                                            <th>Nombre Completo</th>
                                            <th>DNI</th>
                                            <th style={{ textAlign: 'right' }}>Descargar</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredSupervisors.length === 0 ? (
                                            <tr><td colSpan={3} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No se encontraron supervisores.</td></tr>
                                        ) : filteredSupervisors.map(sup => (
                                            <tr key={sup.id}>
                                                <td data-label="Nombre Completo"><strong>{sup.surname}, {sup.name}</strong></td>
                                                <td data-label="DNI">{sup.dni}</td>
                                                <td data-label="Descargar" className="mobile-hide-label" style={{ textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                                                        <button
                                                            type="button"
                                                            className="btn btn-primary"
                                                            onClick={() => openViewer(sup)}
                                                            disabled={!sup.id}
                                                        >
                                                            👁 Ver
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary"
                                                            onClick={() => downloadReport(sup, 'pdf')}
                                                            disabled={!sup.id || downloadingPdfId === sup.id}
                                                        >
                                                            {sup.id && downloadingPdfId === sup.id ? '...' : '📄 PDF'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary"
                                                            onClick={() => downloadReport(sup, 'excel')}
                                                            disabled={!sup.id || downloadingExcelId === sup.id}
                                                        >
                                                            {sup.id && downloadingExcelId === sup.id ? '...' : '📥 Excel'}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {viewerSupervisor && (
                    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeViewer(); }}>
                        <div className="modal-content fichada-viewer-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="fichada-viewer-header">
                                <div>
                                    <h2 style={{ margin: 0 }}>{viewerSupervisor.surname}, {viewerSupervisor.name}</h2>
                                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                                        Fichadas del {fmtYMD(dateFrom)} al {fmtYMD(dateTo)}
                                    </p>
                                </div>
                                <button className="btn btn-secondary" onClick={closeViewer}>Cerrar</button>
                            </div>

                            {viewerLoading && (
                                <p style={{ color: 'var(--text-muted)', padding: '2rem 0', textAlign: 'center' }}>Cargando…</p>
                            )}

                            {viewerError && (
                                <div style={{ padding: '0.85rem 1rem', background: '#FEE2E2', color: '#991B1B', borderRadius: '8px', marginTop: '1rem' }}>
                                    {viewerError}
                                </div>
                            )}

                            {viewerData && !viewerLoading && (
                                <>
                                    <div className="fichada-viewer-summary">
                                        <div>
                                            <span className="fichada-viewer-summary-label">Total horas</span>
                                            <span className="fichada-viewer-summary-value">{viewerData.totales.hsTotal}</span>
                                        </div>
                                        <div>
                                            <span className="fichada-viewer-summary-label">Días con fichada</span>
                                            <span className="fichada-viewer-summary-value">{viewerData.totales.diasConFichada}</span>
                                        </div>
                                        <div>
                                            <span className="fichada-viewer-summary-label">Servicios visitados</span>
                                            <span className="fichada-viewer-summary-value">{viewerData.totales.serviciosVisitados}</span>
                                        </div>
                                    </div>

                                    <ul className="fichada-viewer-day-list">
                                        {viewerData.days.map(day => {
                                            const cantidad = day.visitas.length;
                                            const totalMin = day.visitas.reduce((acc, v) => {
                                                if (!v.duracion) return acc;
                                                const [hh, mm, ss] = v.duracion.split(':').map(Number);
                                                return acc + (hh * 60) + mm + (ss / 60);
                                            }, 0);
                                            const totalLabel = totalMin > 0
                                                ? `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(Math.round(totalMin % 60)).padStart(2, '0')}`
                                                : '—';
                                            return (
                                                <li key={day.date}>
                                                    <button
                                                        type="button"
                                                        className="fichada-viewer-day-row"
                                                        onClick={() => openDayDetail(day, viewerSupervisor)}
                                                        disabled={cantidad === 0}
                                                    >
                                                        <span className="fichada-viewer-day-row-label">{day.label}</span>
                                                        <span className="fichada-viewer-day-row-meta">
                                                            {cantidad === 0
                                                                ? <span className="fichada-viewer-day-row-empty">Sin fichadas</span>
                                                                : (
                                                                    <>
                                                                        <span className="fichada-viewer-day-row-count">{cantidad}</span>
                                                                        <span className="fichada-viewer-day-row-total">{totalLabel}</span>
                                                                        <span className="fichada-viewer-day-row-arrow">›</span>
                                                                    </>
                                                                )}
                                                        </span>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </MainLayout>
    );
}
