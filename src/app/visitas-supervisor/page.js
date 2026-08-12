'use client';

import { useState, useEffect } from 'react';
import MainLayout from '@/components/MainLayout';
import SearchableSelect from '@/components/SearchableSelect';
import { notify } from '@/lib/toast';
import { downloadWorkbook } from '@/lib/xlsx-download';

const todayAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const addDaysStr = (ymd, n) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};
const firstOfMonthStr = (ymd) => { const [y, m] = ymd.split('-'); return `${y}-${m}-01`; };
const fmtYMD = (ymd) => { if (!ymd) return ''; const [y, m, d] = ymd.split('-'); return `${d}/${m}/${y}`; };

export default function VisitasSupervisorPage() {
    const [supervisors, setSupervisors] = useState([]);
    const [supervisorId, setSupervisorId] = useState('');
    const [dateFrom, setDateFrom] = useState(() => firstOfMonthStr(todayAR()));
    const [dateTo, setDateTo] = useState(() => todayAR());
    const [activePreset, setActivePreset] = useState('mes');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Lista de supervisores (con credentials para que viaje la sesión).
    useEffect(() => {
        fetch('/api/supervisors?activeOnly=true', { credentials: 'include' })
            .then(r => r.ok ? r.json() : [])
            .then(list => setSupervisors(Array.isArray(list) ? list : []))
            .catch(() => setSupervisors([]));
    }, []);

    const supOptions = supervisors.map(s => ({
        value: String(s.id),
        label: `${s.surname || ''}, ${s.name || ''}`.trim().replace(/^,\s*/, ''),
    }));

    const applyPreset = (preset) => {
        const t = todayAR();
        setActivePreset(preset);
        if (preset === 'mes') { setDateFrom(firstOfMonthStr(t)); setDateTo(t); }
        else if (preset === '30d') { setDateFrom(addDaysStr(t, -29)); setDateTo(t); }
        else if (preset === '90d') { setDateFrom(addDaysStr(t, -89)); setDateTo(t); }
    };

    const buscar = async () => {
        if (!supervisorId) { notify.error('Elegí un supervisor.'); return; }
        if (dateFrom > dateTo) { notify.error('La fecha de inicio no puede ser posterior a la de fin.'); return; }
        setLoading(true);
        setError('');
        setData(null);
        try {
            const res = await fetch(`/api/visitas-supervisor?supervisor_id=${supervisorId}&date_from=${dateFrom}&date_to=${dateTo}`, { credentials: 'include' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setError(json.error || 'No se pudieron cargar las visitas.'); return; }
            setData(json);
        } catch {
            setError('Error de red al cargar las visitas.');
        } finally {
            setLoading(false);
        }
    };

    const exportarExcel = async () => {
        if (!data || !data.servicios.length) { notify.error('No hay visitas para exportar.'); return; }
        const XLSX = await import('xlsx');
        const rows = data.servicios.map((s, i) => ({
            '#': i + 1,
            Servicio: s.service_name,
            Visitas: s.visitas,
        }));
        rows.push({ '#': '', Servicio: 'TOTAL', Visitas: data.totalVisitas });
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ width: 5 }, { width: 48 }, { width: 10 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Visitas');
        const nombreArch = (data.supervisor?.nombre || 'supervisor').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, '_');
        downloadWorkbook(XLSX, wb, `Visitas_${nombreArch}_${dateFrom}_a_${dateTo}.xlsx`);
    };

    const maxVisitas = data && data.servicios.length ? data.servicios[0].visitas : 1;

    return (
        <MainLayout>
            <div className="config-view">
                <header className="page-header" style={{ marginBottom: '1.5rem' }}>
                    <div>
                        <h1>Visitas por Supervisor</h1>
                        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            Cuántas veces visitó cada servicio un supervisor, según sus fichadas.
                        </p>
                    </div>
                </header>

                {/* Filtros */}
                <div className="card" style={{ marginBottom: '1.25rem', padding: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 260px', minWidth: '220px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>Supervisor</label>
                        <SearchableSelect
                            options={supOptions}
                            value={supervisorId}
                            onChange={setSupervisorId}
                            placeholder="Elegí un supervisor"
                            searchPlaceholder="Buscar supervisor..."
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>Desde</label>
                        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePreset(''); }} style={{ padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg, transparent)', color: 'var(--text-main)' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>Hasta</label>
                        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePreset(''); }} style={{ padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg, transparent)', color: 'var(--text-main)' }} />
                    </div>
                    <button className="btn btn-primary" onClick={buscar} disabled={loading} style={{ height: 'fit-content' }}>
                        {loading ? 'Buscando…' : 'Ver visitas'}
                    </button>
                </div>

                {/* Presets de rango rápido */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                    {[['mes', 'Este mes'], ['30d', 'Últimos 30 días'], ['90d', 'Últimos 90 días']].map(([key, label]) => (
                        <button key={key} className={`btn ${activePreset === key ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.35rem 0.8rem', fontSize: '0.82rem' }} onClick={() => applyPreset(key)}>
                            {label}
                        </button>
                    ))}
                </div>

                {error && (
                    <div className="card" style={{ padding: '1rem', color: 'var(--error)', marginBottom: '1.25rem' }}>{error}</div>
                )}

                {/* Resultado */}
                {data && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total de visitas</div>
                                    <div style={{ fontWeight: 800, fontSize: '1.4rem' }}>{data.totalVisitas}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Servicios distintos</div>
                                    <div style={{ fontWeight: 800, fontSize: '1.4rem' }}>{data.serviciosDistintos}</div>
                                </div>
                            </div>
                            {data.servicios.length > 0 && (
                                <button className="btn btn-secondary" onClick={exportarExcel}>📤 Exportar Excel</button>
                            )}
                        </div>
                        <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            <strong>{data.supervisor?.nombre}</strong> · {fmtYMD(data.dateFrom)} al {fmtYMD(data.dateTo)}
                        </p>

                        {data.servicios.length === 0 ? (
                            <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                Este supervisor no registró visitas a servicios en el período elegido.
                            </div>
                        ) : (
                            <div className="card" style={{ padding: '1.25rem' }}>
                                {data.servicios.map((s, i) => (
                                    <div key={s.service_id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', borderBottom: i < data.servicios.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                                        <span style={{ width: '1.5rem', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{i + 1}</span>
                                        <span style={{ flex: 1, fontSize: '0.9rem' }}>{s.service_name}</span>
                                        <div style={{ flex: '0 0 40%', maxWidth: '260px', background: 'var(--surface-2, rgba(148,163,184,0.15))', borderRadius: '6px', overflow: 'hidden', height: '10px' }}>
                                            <div style={{ width: `${(s.visitas / maxVisitas) * 100}%`, height: '100%', background: '#2563eb', borderRadius: '6px' }} />
                                        </div>
                                        <span style={{ width: '3rem', textAlign: 'right', fontWeight: 700 }}>{s.visitas}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </MainLayout>
    );
}
