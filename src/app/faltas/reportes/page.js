'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import { notify } from '@/lib/toast';
import { downloadWorkbook } from '@/lib/xlsx-download';

// Reportes de faltas: cuántas y cuántas horas, por período. Sirve para ver
// dónde se concentran las ausencias y con quiénes.
//
// A propósito no cruza con liquidación ni facturación: eso queda para más
// adelante, si la herramienta demuestra que sirve para lo simple.

const todayAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const addDaysStr = (ymd, n) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};
const primeroDelMes = (ymd) => `${ymd.slice(0, 7)}-01`;
const mesAnterior = (ymd) => {
    const [y, m] = ymd.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
const ultimoDiaDelMes = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};
const fmtYMD = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : '');
const fmtHs = (n) => String(Math.round(Number(n) * 100) / 100).replace('.', ',');

const MOTIVO_LABEL = {
    enfermedad: 'Enfermedad', personal: 'Tema personal', accidente: 'Accidente',
    sin_aviso: 'No avisó', sin_especificar: 'Sin motivo',
};

// Barras horizontales, mismo patrón que el ranking de KPIs.
function Ranking({ items, unidad }) {
    if (!items.length) return <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>Sin datos en el período.</p>;
    const tope = Math.max(...items.map(i => i.valor), 1);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {items.map((it, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ width: '44%', fontSize: '0.83rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={it.label}>
                        {it.label}
                    </div>
                    <div style={{ flex: 1, background: 'var(--color-muted-surface)', borderRadius: '4px', height: '16px' }}>
                        <div style={{ width: `${(it.valor / tope) * 100}%`, background: '#EF4444', height: '100%', borderRadius: '4px', minWidth: it.valor > 0 ? '2px' : 0 }} />
                    </div>
                    <div style={{ width: '68px', textAlign: 'right', fontSize: '0.83rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {it.valor} {unidad}
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function ReportesFaltasPage() {
    const hoy = todayAR();
    const [desde, setDesde] = useState(() => primeroDelMes(hoy));
    const [hasta, setHasta] = useState(hoy);
    const [preset, setPreset] = useState('mes');
    const [faltas, setFaltas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    // Por defecto se mide por horas: una falta de 8 horas no pesa lo mismo que
    // una de 2, y el ranking por cantidad las trata igual.
    const [medida, setMedida] = useState('horas');

    const cargar = useCallback(async (d, h) => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/operativo/faltas?desde=${d}&hasta=${h}&historial=0`, { credentials: 'include' });
            const json = await res.json().catch(() => []);
            if (!res.ok) { setError(json.error || 'No se pudieron cargar las faltas.'); setFaltas([]); return; }
            setFaltas(Array.isArray(json) ? json : []);
        } catch {
            setError('Error de red.');
            setFaltas([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { cargar(desde, hasta); }, [desde, hasta, cargar]);

    const aplicarPreset = (p) => {
        setPreset(p);
        const t = todayAR();
        if (p === 'mes') { setDesde(primeroDelMes(t)); setHasta(t); }
        else if (p === 'mesPasado') { const m = mesAnterior(t); setDesde(`${m}-01`); setHasta(ultimoDiaDelMes(m)); }
        else if (p === '30d') { setDesde(addDaysStr(t, -29)); setHasta(t); }
        else if (p === '90d') { setDesde(addDaysStr(t, -89)); setHasta(t); }
    };

    const resumen = useMemo(() => {
        const personas = new Set(faltas.map(f => (f.employee_id ? `e${f.employee_id}` : `n${f.nombre}`)));
        const horas = faltas.reduce((a, f) => a + (Number(f.horas) || 0), 0);
        const dias = new Set(faltas.map(f => f.fecha));
        return { turnos: faltas.length, horas, personas: personas.size, dias: dias.size };
    }, [faltas]);

    // Agrupador reusable: devuelve el ranking ordenado por la medida elegida.
    const agrupar = useCallback((claveFn, etiquetaFn) => {
        const map = new Map();
        for (const f of faltas) {
            const k = claveFn(f);
            if (!k) continue;
            if (!map.has(k)) map.set(k, { label: etiquetaFn(f), turnos: 0, horas: 0 });
            const e = map.get(k);
            e.turnos += 1;
            e.horas += Number(f.horas) || 0;
        }
        return [...map.values()]
            .map(e => ({ ...e, horas: Math.round(e.horas * 100) / 100 }))
            .sort((a, b) => (medida === 'horas' ? b.horas - a.horas : b.turnos - a.turnos));
    }, [faltas, medida]);

    const porPersona = useMemo(
        () => agrupar(f => (f.employee_id ? `e${f.employee_id}` : `n${f.nombre}`), f => f.nombre),
        [agrupar]
    );
    const porServicio = useMemo(
        () => agrupar(f => f.servicio || 'Sin servicio', f => f.servicio || 'Sin servicio'),
        [agrupar]
    );
    const porMotivo = useMemo(
        () => agrupar(f => f.motivo, f => MOTIVO_LABEL[f.motivo] || f.motivo),
        [agrupar]
    );

    const aRanking = (lista, n) => lista.slice(0, n).map(e => ({
        label: e.label,
        valor: medida === 'horas' ? e.horas : e.turnos,
    }));
    const unidad = medida === 'horas' ? 'hs' : '';

    const exportar = async () => {
        if (!faltas.length) { notify.error('No hay faltas para exportar.'); return; }
        const XLSX = await import('xlsx');
        const wb = XLSX.utils.book_new();

        const hoja = (nombre, filas, anchos) => {
            const ws = XLSX.utils.json_to_sheet(filas);
            ws['!cols'] = anchos.map(w => ({ width: w }));
            XLSX.utils.book_append_sheet(wb, ws, nombre);
        };

        hoja('Detalle', faltas.map(f => ({
            Fecha: fmtYMD(f.fecha),
            Operario: f.nombre,
            Legajo: f.legajo || '',
            Servicio: f.servicio || '',
            Horas: f.horas ?? '',
            Motivo: MOTIVO_LABEL[f.motivo] || f.motivo,
            Nota: f.nota || '',
            'Cargó': f.registrado_por || '',
        })), [12, 30, 10, 34, 8, 16, 30, 20]);

        hoja('Por operario', porPersona.map(e => ({ Operario: e.label, Turnos: e.turnos, Horas: e.horas })), [30, 10, 10]);
        hoja('Por servicio', porServicio.map(e => ({ Servicio: e.label, Turnos: e.turnos, Horas: e.horas })), [40, 10, 10]);
        hoja('Por motivo', porMotivo.map(e => ({ Motivo: e.label, Turnos: e.turnos, Horas: e.horas })), [20, 10, 10]);

        downloadWorkbook(XLSX, wb, `Faltas_${desde}_a_${hasta}.xlsx`);
    };

    const inputEstilo = { padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--color-surface)', color: 'var(--text-main)' };

    return (
        <MainLayout>
            <div style={{ maxWidth: '980px', margin: '0 auto' }}>
                <header className="page-header" style={{ marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                        <Link href="/faltas" className="btn btn-secondary">← Faltas</Link>
                        <div>
                            <h1 style={{ margin: 0 }}>Reportes de faltas</h1>
                            <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                                Cuántas faltas y cuántas horas, y dónde se concentran.
                            </p>
                        </div>
                    </div>
                </header>

                {/* Período */}
                <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.3rem' }}>Desde</label>
                        <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPreset(''); }} style={inputEstilo} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.3rem' }}>Hasta</label>
                        <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPreset(''); }} style={inputEstilo} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {[['mes', 'Este mes'], ['mesPasado', 'Mes pasado'], ['30d', '30 días'], ['90d', '90 días']].map(([k, l]) => (
                            <button key={k} className={`btn ${preset === k ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }} onClick={() => aplicarPreset(k)}>
                                {l}
                            </button>
                        ))}
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Ordenar por</span>
                        <select value={medida} onChange={e => setMedida(e.target.value)} style={inputEstilo}>
                            <option value="horas">Horas perdidas</option>
                            <option value="turnos">Cantidad de faltas</option>
                        </select>
                        {faltas.length > 0 && <button className="btn btn-secondary" onClick={exportar}>📤 Excel</button>}
                    </div>
                </div>

                {error && <div className="card" style={{ padding: '1.25rem', color: 'var(--error)' }}>{error}</div>}

                {loading ? (
                    <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>
                ) : faltas.length === 0 ? (
                    <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>✅</div>
                        <div style={{ fontWeight: 600 }}>No hay faltas registradas en este período</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginTop: '0.25rem' }}>
                            Del {fmtYMD(desde)} al {fmtYMD(hasta)}.
                        </div>
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                            {[
                                { v: fmtHs(resumen.horas), l: 'horas perdidas', c: '#B45309' },
                                { v: resumen.turnos, l: resumen.turnos === 1 ? 'falta' : 'faltas' },
                                { v: resumen.personas, l: resumen.personas === 1 ? 'persona distinta' : 'personas distintas' },
                                { v: resumen.dias, l: resumen.dias === 1 ? 'día con faltas' : 'días con faltas' },
                            ].map(({ v, l, c }) => (
                                <div key={l} className="card" style={{ padding: '1rem 1.1rem', margin: 0 }}>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1, color: c || 'var(--text-main)' }}>{v}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>{l}</div>
                                </div>
                            ))}
                        </div>

                        <div className="card" style={{ marginBottom: '1.25rem' }}>
                            <h3 style={{ margin: '0 0 0.3rem' }}>Servicios con más faltas</h3>
                            <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Dónde se concentran las ausencias.</p>
                            <Ranking items={aRanking(porServicio, 12)} unidad={unidad} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
                            <div className="card">
                                <h3 style={{ margin: '0 0 0.3rem' }}>Quiénes faltan más</h3>
                                <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Los 12 primeros del período.</p>
                                <Ranking items={aRanking(porPersona, 12)} unidad={unidad} />
                            </div>
                            <div className="card">
                                <h3 style={{ margin: '0 0 0.3rem' }}>Por qué faltan</h3>
                                <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Motivo que se registró al cargar.</p>
                                <Ranking items={aRanking(porMotivo, 8)} unidad={unidad} />
                            </div>
                        </div>

                        <p style={{ margin: '1rem 0.25rem 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Del {fmtYMD(desde)} al {fmtYMD(hasta)}. No incluye las faltas anuladas.
                            El Excel trae el detalle completo más un resumen por operario, por servicio y por motivo.
                        </p>
                    </>
                )}
            </div>
        </MainLayout>
    );
}
