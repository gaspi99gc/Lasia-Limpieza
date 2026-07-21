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

    // Gasto de cada servicio según el mes seleccionado (o total si 'todos').
    const rows = useMemo(() => {
        const list = servicios.map(s => ({
            ...s,
            gasto: mesSel === 'todos' ? s.total : (s.porMes?.[mesSel] || 0),
        }));
        const filtered = search.trim()
            ? list.filter(s => (s.service_name || '').toLowerCase().includes(search.trim().toLowerCase()))
            : list;
        return filtered.filter(s => s.gasto > 0).sort((a, b) => b.gasto - a.gasto);
    }, [servicios, mesSel, search]);

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
                            Costo de los insumos pedidos (pedidos cerrados), por servicio y por mes.
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
                        style={{ ...selectStyle, cursor: 'text', minWidth: '220px' }}
                    />
                    <div style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {rows.length} servicios · <strong style={{ color: 'var(--text-main)' }}>{money(totalGeneral)}</strong> total
                    </div>
                </div>

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
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.length === 0 ? (
                                        <tr><td colSpan={3} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Sin datos de gasto para este filtro.</td></tr>
                                    ) : rows.map((s, i) => (
                                        <tr key={s.service_id}>
                                            <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{i + 1}</td>
                                            <td style={{ fontWeight: 600 }}>{s.service_name}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(s.gasto)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </MainLayout>
    );
}
