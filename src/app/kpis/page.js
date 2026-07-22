'use client';

import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';

const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');

function mesLabel(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    const meses = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${meses[Number(m)] || m} ${y}`;
}

export default function KpisPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [servicios, setServicios] = useState([]);
    const [meses, setMeses] = useState([]);
    const [mesSel, setMesSel] = useState('todos');
    const [search, setSearch] = useState('');
    const [ordenarPor, setOrdenarPor] = useState('gasto'); // 'gasto' | 'operario'

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            try {
                const res = await fetch('/api/kpis/gasto-insumos');
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al cargar el KPI');
                if (cancelled) return;
                setServicios(Array.isArray(data.servicios) ? data.servicios : []);
                setMeses(Array.isArray(data.meses) ? data.meses : []);
            } catch (e) {
                if (!cancelled) setError(e.message || 'Error de red');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Gasto de cada servicio según el mes seleccionado (o total si 'todos'),
    // más el gasto por operario (gasto ÷ dotación equivalente).
    const rows = useMemo(() => {
        const list = servicios.map(s => {
            const gasto = mesSel === 'todos' ? s.total : (s.porMes?.[mesSel] || 0);
            const dot = Number(s.dotacion) > 0 ? Number(s.dotacion) : null;
            const gastoPorOperario = dot ? Math.round(gasto / dot) : null;
            return { ...s, gasto, dot, gastoPorOperario };
        }).filter(s => s.gasto > 0);

        // Mediana del gasto por operario (solo los que tienen dotación) para marcar los que se van de tema.
        const conRatio = list.filter(s => s.gastoPorOperario != null).map(s => s.gastoPorOperario).sort((a, b) => a - b);
        const mediana = conRatio.length ? conRatio[Math.floor(conRatio.length / 2)] : 0;

        const withFlag = list.map(s => ({
            ...s,
            // Rojo si gasta >2× la mediana por operario; amarillo si >1.5×.
            alerta: s.gastoPorOperario != null && mediana > 0
                ? (s.gastoPorOperario > mediana * 2 ? 'alta' : s.gastoPorOperario > mediana * 1.5 ? 'media' : null)
                : null,
        }));

        const filtered = search.trim()
            ? withFlag.filter(s => (s.service_name || '').toLowerCase().includes(search.trim().toLowerCase()))
            : withFlag;

        // Orden: por gasto por operario (desc) si hay dotación, para que los "caros por operario" salten arriba.
        return filtered.sort((a, b) => {
            if (ordenarPor === 'operario') {
                const av = a.gastoPorOperario ?? -1, bv = b.gastoPorOperario ?? -1;
                return bv - av;
            }
            return b.gasto - a.gasto;
        });
    }, [servicios, mesSel, search, ordenarPor]);

    const mediana = useMemo(() => {
        const conRatio = rows.filter(s => s.gastoPorOperario != null).map(s => s.gastoPorOperario).sort((a, b) => a - b);
        return conRatio.length ? conRatio[Math.floor(conRatio.length / 2)] : 0;
    }, [rows]);

    const totalGeneral = useMemo(() => rows.reduce((a, s) => a + s.gasto, 0), [rows]);

    const selectStyle = {
        padding: '0.45rem 0.7rem', border: '1px solid var(--border-color)', borderRadius: '8px',
        fontSize: '0.85rem', background: 'var(--color-surface)', color: 'var(--text-main)', cursor: 'pointer',
    };

    return (
        <MainLayout>
            <div style={{ maxWidth: '1100px' }}>
                <header className="page-header" style={{ marginBottom: '1.5rem' }}>
                    <div>
                        <h1>Gasto de insumos por servicio</h1>
                        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            Costo de los insumos pedidos (pedidos cerrados) por servicio y mes, y gasto por operario (dotación en jornadas equivalentes) para detectar servicios que consumen de más.
                        </p>
                    </div>
                </header>

                {/* Filtros */}
                <div className="card" style={{ padding: '0.9rem 1.25rem', marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Mes</span>
                        <select value={mesSel} onChange={(e) => setMesSel(e.target.value)} style={selectStyle}>
                            <option value="todos">Todos (histórico)</option>
                            {meses.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
                        </select>
                    </div>
                    <input
                        type="text"
                        placeholder="Buscar servicio…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ ...selectStyle, cursor: 'text', minWidth: '200px' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Ordenar por</span>
                        <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value)} style={selectStyle}>
                            <option value="gasto">Gasto total</option>
                            <option value="operario">Gasto por operario</option>
                        </select>
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {rows.length} servicios · <strong style={{ color: 'var(--text-main)' }}>{money(totalGeneral)}</strong> total
                    </div>
                </div>

                {/* Leyenda del análisis por operario */}
                {mediana > 0 && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0.25rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                        <span>Mediana gasto/operario: <strong style={{ color: 'var(--text-main)' }}>{money(mediana)}</strong></span>
                        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#F59E0B', marginRight: 4 }} />&gt;1,5× la mediana</span>
                        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#EF4444', marginRight: 4 }} />&gt;2× la mediana (se va de tema)</span>
                    </div>
                )}

                {loading ? (
                    <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>
                ) : error ? (
                    <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--error)' }}>{error}</div>
                ) : (
                    <div className="card" style={{ padding: 0 }}>
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '3rem', textAlign: 'center' }}>#</th>
                                        <th>Servicio</th>
                                        <th style={{ textAlign: 'right' }}>Gasto {mesSel === 'todos' ? '(histórico)' : `(${mesLabel(mesSel)})`}</th>
                                        <th style={{ textAlign: 'right' }}>Dotación</th>
                                        <th style={{ textAlign: 'right' }}>Gasto / operario</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.length === 0 ? (
                                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Sin datos de gasto para este filtro.</td></tr>
                                    ) : rows.map((s, i) => {
                                        const bg = s.alerta === 'alta' ? 'rgba(239,68,68,0.10)' : s.alerta === 'media' ? 'rgba(245,158,11,0.10)' : undefined;
                                        const ratioColor = s.alerta === 'alta' ? '#EF4444' : s.alerta === 'media' ? '#B45309' : 'var(--text-main)';
                                        return (
                                            <tr key={s.service_id} style={{ background: bg }}>
                                                <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{i + 1}</td>
                                                <td style={{ fontWeight: 600 }}>{s.service_name}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(s.gasto)}</td>
                                                <td style={{ textAlign: 'right', color: s.dot ? 'var(--text-main)' : 'var(--text-muted)' }}>
                                                    {s.dot ? s.dot.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '—'}
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: ratioColor }}>
                                                    {s.gastoPorOperario != null ? money(s.gastoPorOperario) : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>sin dotación</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </MainLayout>
    );
}
