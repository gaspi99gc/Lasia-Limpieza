'use client';

import { useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { useCatalog } from '@/lib/CatalogContext';

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

    const filteredSupervisors = supervisors.filter(s => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return `${s.surname} ${s.name}`.toLowerCase().includes(q) || String(s.dni || '').includes(q);
    });

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
                                La fecha "desde" debe ser anterior o igual a la fecha "hasta".
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
            </div>
        </MainLayout>
    );
}
