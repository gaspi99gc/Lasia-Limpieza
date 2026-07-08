'use client';

import { useState, useEffect } from 'react';
import MainLayout from '@/components/MainLayout';
import { useCatalog } from '@/lib/CatalogContext';
import { matchesSearch } from '@/lib/search';
import { getSessionUser } from '@/lib/session';
import { notify } from '@/lib/toast';

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

    // Edicion de fichada (Tema 2): elegir dia -> servicio -> corregir horas.
    const [editMode, setEditMode] = useState(false);
    const [editDay, setEditDay] = useState('');       // date string del dia elegido
    const [editVisitIdx, setEditVisitIdx] = useState(''); // indice de la visita en el dia
    const [editIngreso, setEditIngreso] = useState('');
    const [editEgreso, setEditEgreso] = useState('');
    const [editSaving, setEditSaving] = useState(false);
    const [canEdit, setCanEdit] = useState(false);
    useEffect(() => {
        setCanEdit(['operaciones', 'admin'].includes(getSessionUser()?.role));
    }, []);

    // Visita cotizada (Tema 3): inspeccion a un posible cliente, sin GPS.
    const [cotizadaOpen, setCotizadaOpen] = useState(false);
    const [cotizadaForm, setCotizadaForm] = useState({ supervisor_id: '', fecha: '', hora_ingreso: '', hora_egreso: '', nota: '' });
    const [cotizadaSaving, setCotizadaSaving] = useState(false);

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

    const loadViewerData = async (supervisor) => {
        const res = await fetch(`/api/reports/weekly-json?supervisor_id=${supervisor.id}&date_from=${dateFrom}&date_to=${dateTo}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Error del servidor (${res.status})`);
        }
        return res.json();
    };

    const openViewer = async (supervisor) => {
        setViewerSupervisor(supervisor);
        setViewerData(null);
        setViewerError('');
        setEditMode(false);
        setViewerLoading(true);
        try {
            setViewerData(await loadViewerData(supervisor));
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
                ${v.cotizada && v.nota ? `<div class="swal-fichada-visit-nota">${esc(v.nota)}</div>` : ''}
                <div class="swal-fichada-visit-meta">
                    ${v.duracion ? `<span class="swal-fichada-dur">${esc(v.duracion)}</span>` : ''}
                    ${v.cotizada ? `<span class="swal-fichada-badge is-cotizada">🔎 Visita cotizada</span>` : ''}
                    ${v.ongoing ? `<span class="swal-fichada-badge is-ongoing">⏵ En curso</span>` : ''}
                    ${v.ingresoLejos ? `<span class="swal-fichada-badge is-lejos">⚠ Lejos en ingreso${v.ingresoDistanciaMetros ? ` (${v.ingresoDistanciaMetros} m)` : ''}</span>` : ''}
                    ${v.salidaLejos ? `<span class="swal-fichada-badge is-lejos">⚠ Lejos en salida${v.salidaDistanciaMetros ? ` (${v.salidaDistanciaMetros} m)` : ''}</span>` : ''}
                    ${Number.isFinite(v.gpsAccuracy) ? `<span class="swal-fichada-badge is-gps">GPS ±${v.gpsAccuracy}m</span>` : ''}
                    ${v.editado ? `<span class="swal-fichada-badge is-gps">✏️ Editada</span>` : ''}
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
        setEditMode(false);
    };

    // --- Edicion de fichada ---
    const diasConFichada = (viewerData?.days || []).filter(d => d.visitas.length > 0);
    const editableVisitas = diasConFichada.find(d => d.date === editDay)?.visitas || [];
    const selectedVisita = editableVisitas[Number(editVisitIdx)] || null;

    const startEdit = () => {
        setEditMode(true);
        setEditDay('');
        setEditVisitIdx('');
        setEditIngreso('');
        setEditEgreso('');
    };

    const cancelEdit = () => setEditMode(false);

    const pickEditVisit = (idx) => {
        setEditVisitIdx(idx);
        const v = editableVisitas[Number(idx)];
        setEditIngreso(v?.ingresoHora || '');
        setEditEgreso(v?.egresoHora || '');
    };

    const saveEdit = async () => {
        if (!selectedVisita) { notify.error('Elegí el día y el servicio a corregir.'); return; }
        const editadoPor = `${getSessionUser()?.name || ''} ${getSessionUser()?.surname || ''}`.trim();

        // Solo mandamos los eventos que cambiaron.
        const cambios = [];
        if (editIngreso && editIngreso !== selectedVisita.ingresoHora && selectedVisita.ingresoId) {
            cambios.push({ id: selectedVisita.ingresoId, hora: editIngreso });
        }
        if (editEgreso && editEgreso !== selectedVisita.egresoHora && selectedVisita.egresoId) {
            cambios.push({ id: selectedVisita.egresoId, hora: editEgreso });
        }
        if (cambios.length === 0) { notify.error('No cambiaste ninguna hora.'); return; }

        setEditSaving(true);
        try {
            for (const c of cambios) {
                const res = await fetch(`/api/presentismo-logs/${c.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hora: c.hora, editado_por: editadoPor }),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || 'No se pudo editar la fichada.');
                }
            }
            notify.success('Fichada actualizada.');
            setEditMode(false);
            setViewerData(await loadViewerData(viewerSupervisor));
        } catch (e) {
            notify.error(e.message || 'Error al guardar.');
        } finally {
            setEditSaving(false);
        }
    };

    // --- Visita cotizada ---
    const openCotizada = () => {
        setCotizadaForm({ supervisor_id: '', fecha: todayAR(), hora_ingreso: '', hora_egreso: '', nota: '' });
        setCotizadaOpen(true);
    };

    const saveCotizada = async () => {
        const f = cotizadaForm;
        if (!f.supervisor_id) { notify.error('Elegí el supervisor.'); return; }
        if (!f.fecha) { notify.error('Elegí la fecha.'); return; }
        if (!f.hora_ingreso || !f.hora_egreso) { notify.error('Ingresá la hora de ingreso y egreso.'); return; }
        if (f.hora_egreso <= f.hora_ingreso) { notify.error('El egreso debe ser posterior al ingreso.'); return; }

        setCotizadaSaving(true);
        try {
            const res = await fetch('/api/presentismo-logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(f),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'No se pudo agregar la visita.');
            }
            notify.success('Visita cotizada agregada.');
            setCotizadaOpen(false);
        } catch (e) {
            notify.error(e.message || 'Error al guardar.');
        } finally {
            setCotizadaSaving(false);
        }
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
                    {canEdit && (
                        <button className="btn btn-primary" onClick={openCotizada}>+ Visita cotizada</button>
                    )}
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
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {canEdit && viewerData && !viewerLoading && !editMode && (
                                        <button className="btn btn-primary" onClick={startEdit}>✏️ Editar fichada</button>
                                    )}
                                    <button className="btn btn-secondary" onClick={closeViewer}>Cerrar</button>
                                </div>
                            </div>

                            {viewerLoading && (
                                <p style={{ color: 'var(--text-muted)', padding: '2rem 0', textAlign: 'center' }}>Cargando…</p>
                            )}

                            {viewerError && (
                                <div style={{ padding: '0.85rem 1rem', background: '#FEE2E2', color: '#991B1B', borderRadius: '8px', marginTop: '1rem' }}>
                                    {viewerError}
                                </div>
                            )}

                            {/* Panel de edicion de fichada */}
                            {editMode && viewerData && !viewerLoading && (
                                <div className="card" style={{ marginTop: '1rem', padding: '1.25rem' }}>
                                    <h3 style={{ margin: '0 0 1rem' }}>Editar fichada</h3>

                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.75rem' }}>
                                        Día a corregir
                                        <select
                                            className="card"
                                            style={{ margin: 0, fontWeight: 'normal' }}
                                            value={editDay}
                                            onChange={(e) => { setEditDay(e.target.value); setEditVisitIdx(''); setEditIngreso(''); setEditEgreso(''); }}
                                        >
                                            <option value="">Elegí un día…</option>
                                            {diasConFichada.map(d => (
                                                <option key={d.date} value={d.date}>{d.label}</option>
                                            ))}
                                        </select>
                                    </label>

                                    {editDay && (
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.75rem' }}>
                                            Servicio a corregir
                                            <select
                                                className="card"
                                                style={{ margin: 0, fontWeight: 'normal' }}
                                                value={editVisitIdx}
                                                onChange={(e) => pickEditVisit(e.target.value)}
                                            >
                                                <option value="">Elegí un servicio…</option>
                                                {editableVisitas.map((v, i) => (
                                                    <option key={i} value={i}>
                                                        {v.service_name} ({v.ingresoHora} → {v.egresoHora || '—'})
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    )}

                                    {selectedVisita && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                Hora de ingreso
                                                <input
                                                    type="time"
                                                    className="card"
                                                    style={{ margin: 0, fontWeight: 'normal' }}
                                                    value={editIngreso}
                                                    onChange={(e) => setEditIngreso(e.target.value)}
                                                />
                                            </label>
                                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                Hora de egreso
                                                <input
                                                    type="time"
                                                    className="card"
                                                    style={{ margin: 0, fontWeight: 'normal' }}
                                                    value={editEgreso}
                                                    onChange={(e) => setEditEgreso(e.target.value)}
                                                    disabled={!selectedVisita.egresoId}
                                                />
                                            </label>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                        <button className="btn btn-secondary" onClick={cancelEdit} disabled={editSaving}>Cancelar</button>
                                        <button className="btn btn-primary" onClick={saveEdit} disabled={editSaving || !selectedVisita}>
                                            {editSaving ? 'Guardando…' : 'Guardar cambios'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {viewerData && !viewerLoading && !editMode && (
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

                {/* Modal: agregar visita cotizada (Tema 3) */}
                {cotizadaOpen && (
                    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setCotizadaOpen(false); }}>
                        <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                            <h2 style={{ margin: 0 }}>Agregar visita cotizada</h2>
                            <p style={{ margin: '0.35rem 0 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                Visita a un posible cliente (sin GPS). Queda registrada en el informe del supervisor como “Visita cotizada”.
                            </p>

                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.75rem' }}>
                                Supervisor
                                <select
                                    className="card"
                                    style={{ margin: 0, fontWeight: 'normal' }}
                                    value={cotizadaForm.supervisor_id}
                                    onChange={(e) => setCotizadaForm(f => ({ ...f, supervisor_id: e.target.value }))}
                                >
                                    <option value="">Elegí un supervisor…</option>
                                    {[...supervisors].sort((a, b) => `${a.surname} ${a.name}`.localeCompare(`${b.surname} ${b.name}`)).map(s => (
                                        <option key={s.id} value={s.id}>{s.surname}, {s.name}</option>
                                    ))}
                                </select>
                            </label>

                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.75rem' }}>
                                Fecha
                                <input
                                    type="date"
                                    className="card"
                                    style={{ margin: 0, fontWeight: 'normal' }}
                                    value={cotizadaForm.fecha}
                                    onChange={(e) => setCotizadaForm(f => ({ ...f, fecha: e.target.value }))}
                                />
                            </label>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                    Hora de ingreso
                                    <input
                                        type="time"
                                        className="card"
                                        style={{ margin: 0, fontWeight: 'normal' }}
                                        value={cotizadaForm.hora_ingreso}
                                        onChange={(e) => setCotizadaForm(f => ({ ...f, hora_ingreso: e.target.value }))}
                                    />
                                </label>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                    Hora de egreso
                                    <input
                                        type="time"
                                        className="card"
                                        style={{ margin: 0, fontWeight: 'normal' }}
                                        value={cotizadaForm.hora_egreso}
                                        onChange={(e) => setCotizadaForm(f => ({ ...f, hora_egreso: e.target.value }))}
                                    />
                                </label>
                            </div>

                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '1rem' }}>
                                Nota / observación (opcional)
                                <textarea
                                    className="card"
                                    style={{ margin: 0, fontWeight: 'normal', minHeight: '70px', resize: 'vertical' }}
                                    placeholder="Ej. Cotización edificio Av. Cabildo 1200, se dejó presupuesto."
                                    value={cotizadaForm.nota}
                                    onChange={(e) => setCotizadaForm(f => ({ ...f, nota: e.target.value }))}
                                />
                            </label>

                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                <button className="btn btn-secondary" onClick={() => setCotizadaOpen(false)} disabled={cotizadaSaving}>Cancelar</button>
                                <button className="btn btn-primary" onClick={saveCotizada} disabled={cotizadaSaving}>
                                    {cotizadaSaving ? 'Guardando…' : 'Agregar visita'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </MainLayout>
    );
}
