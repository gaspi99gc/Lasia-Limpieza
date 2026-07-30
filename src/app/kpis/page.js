'use client';

import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import useIsMobile from '@/hooks/useIsMobile';

const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');

function mesLabel(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    const meses = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${meses[Number(m)] || m} ${y}`;
}

function GastoInsumosTab() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [servicios, setServicios] = useState([]);
    const [meses, setMeses] = useState([]);
    const [mesSel, setMesSel] = useState('todos');
    const [search, setSearch] = useState('');
    const [ordenarPor, setOrdenarPor] = useState('gasto'); // 'gasto' | 'operario'
    const isMobile = useIsMobile();

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
            <div>
                <p style={{ margin: '0 0 1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Costo de los insumos pedidos (pedidos cerrados) por servicio y mes, y gasto por operario (dotación en jornadas equivalentes) para detectar servicios que consumen de más.
                </p>

                {/* Filtros */}
                <div className="card" style={{ padding: isMobile ? '0.75rem 0.9rem' : '0.9rem 1.25rem', marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', width: isMobile ? '100%' : undefined }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', flexShrink: 0 }}>Mes</span>
                        <select value={mesSel} onChange={(e) => setMesSel(e.target.value)} style={{ ...selectStyle, flex: isMobile ? 1 : undefined }}>
                            <option value="todos">Todos (histórico)</option>
                            {meses.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
                        </select>
                    </div>
                    <input
                        type="text"
                        placeholder="Buscar servicio…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ ...selectStyle, cursor: 'text', minWidth: isMobile ? '0' : '200px', width: isMobile ? '100%' : undefined }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', width: isMobile ? '100%' : undefined }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', flexShrink: 0 }}>Ordenar por</span>
                        <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value)} style={{ ...selectStyle, flex: isMobile ? 1 : undefined }}>
                            <option value="gasto">Gasto total</option>
                            <option value="operario">Gasto por operario</option>
                        </select>
                    </div>
                    <div style={{ marginLeft: isMobile ? 0 : 'auto', fontSize: '0.85rem', color: 'var(--text-muted)', width: isMobile ? '100%' : undefined, textAlign: isMobile ? 'center' : undefined, borderTop: isMobile ? '1px solid var(--border-color)' : undefined, paddingTop: isMobile ? '0.6rem' : undefined }}>
                        {rows.length} servicios · <strong style={{ color: 'var(--text-main)' }}>{money(totalGeneral)}</strong> total
                    </div>
                </div>

                {/* Leyenda del análisis por operario */}
                {mediana > 0 && (
                    <div style={{ fontSize: isMobile ? '0.74rem' : '0.8rem', color: 'var(--text-muted)', margin: '0 0.25rem 1rem', display: 'flex', flexWrap: 'wrap', gap: isMobile ? '0.5rem 0.85rem' : '1rem', alignItems: 'center' }}>
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
                            <table className="table mobile-cards-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '3rem', textAlign: 'center' }} className="kpi-col-rank">#</th>
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
                                                <td data-label="#" className="kpi-col-rank mobile-hide-label" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{i + 1}</td>
                                                <td data-label="Servicio" style={{ fontWeight: 600 }}>{s.service_name}</td>
                                                <td data-label={`Gasto ${mesSel === 'todos' ? '(histórico)' : `(${mesLabel(mesSel)})`}`} style={{ fontWeight: 600 }}>{money(s.gasto)}</td>
                                                <td data-label="Dotación" style={{ color: s.dot ? 'var(--text-main)' : 'var(--text-muted)' }}>
                                                    {s.dot ? s.dot.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '—'}
                                                </td>
                                                <td data-label="Gasto / operario" style={{ fontWeight: 700, color: ratioColor }}>
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
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rotación de personal
// ─────────────────────────────────────────────────────────────────────────────

const MOTIVO_LABEL = (m) => (m || '').charAt(0).toUpperCase() + (m || '').slice(1);

function StatCard({ valor, label, sub, color }) {
    return (
        <div className="card" style={{ padding: '1rem 1.1rem', margin: 0 }}>
            <div style={{ fontSize: '1.9rem', fontWeight: 800, lineHeight: 1, color: color || 'var(--text-main)' }}>{valor}</div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '0.35rem' }}>{label}</div>
            {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{sub}</div>}
        </div>
    );
}

// Barras horizontales simples (SVG-free, con divs) para rankings.
function BarList({ items, max, color = '#3b82f6', fmt = (v) => v }) {
    const tope = max || Math.max(...items.map(i => i.valor), 1);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {items.map((it, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ width: '42%', fontSize: '0.8rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={it.label}>{it.label}</div>
                    <div style={{ flex: 1, background: 'var(--color-muted-surface)', borderRadius: '4px', height: '18px', position: 'relative' }}>
                        <div style={{ width: `${(it.valor / tope) * 100}%`, background: it.color || color, height: '100%', borderRadius: '4px', minWidth: it.valor > 0 ? '2px' : 0 }} />
                    </div>
                    <div style={{ width: '48px', textAlign: 'right', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>{fmt(it.valor)}</div>
                </div>
            ))}
        </div>
    );
}

function RotacionTab() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState(null);
    const [periodo, setPeriodo] = useState('todos');
    const [periodosDisponibles, setPeriodosDisponibles] = useState([]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true); setError('');
            try {
                const qs = periodo && periodo !== 'todos' ? `?periodo=${encodeURIComponent(periodo)}` : '';
                const res = await fetch(`/api/kpis/rotacion${qs}`);
                const d = await res.json();
                if (!res.ok) throw new Error(d.error || 'Error al cargar la rotación');
                if (!cancelled) {
                    setData(d);
                    if (Array.isArray(d.periodos)) setPeriodosDisponibles(d.periodos);
                }
            } catch (e) {
                if (!cancelled) setError(e.message || 'Error de red');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [periodo]);

    // Filtro de período con chips (etiquetas redondeadas clickeables).
    const chip = (val, label) => (
        <button
            key={val}
            onClick={() => setPeriodo(val)}
            style={{
                padding: '0.4rem 1rem', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                border: periodo === val ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                background: periodo === val ? 'var(--color-primary)' : 'var(--color-surface)',
                color: periodo === val ? '#fff' : 'var(--text-main)',
                transition: 'all 0.12s',
            }}
        >{label}</button>
    );
    const selectPeriodo = (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            {chip('todos', 'Todos')}
            {periodosDisponibles.map(p => chip(p, p))}
        </div>
    );

    if (loading) return <div>{selectPeriodo}<div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div></div>;
    if (error) return <div>{selectPeriodo}<div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--error)' }}>{error}</div></div>;
    if (!data) return selectPeriodo;

    const { curva, servicios, meses, motivos, totalReal, conActividad, sinInicioEfectivo, pctMenos30, pctMenos90 } = data;
    const topServicios = servicios.slice(0, 10);
    const maxServicio = Math.max(...topServicios.map(s => s.cantidad), 1);
    const maxMes = Math.max(...meses.map(m => m.cantidad), 1);
    const maxMotivo = Math.max(...motivos.map(m => m.cantidad), 1);

    return (
        <div>
            <p style={{ margin: '0 0 1.25rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Análisis de bajas del personal. La mayoría se va en los primeros meses: eso apunta a la selección e inducción, no a la retención de largo plazo.
            </p>
            {selectPeriodo}

            {/* Embudo del ingreso — qué pasó con cada persona contratada */}
            <div className="card" style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ margin: '0 0 0.35rem' }}>Qué pasa con cada contratación</h3>
                <p style={{ margin: '0 0 1.25rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    De cada 100 personas contratadas, cuántas nunca iniciaron y cuánto duraron las que sí. Suma 100% (sobre {curva.base} contrataciones).
                </p>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', justifyContent: 'space-around', flexWrap: 'wrap' }}>
                    {(() => {
                        const maxPct = Math.max(...curva.tramos.map(t => t.pct), 1);
                        // Nunca inició = gris oscuro (categoría propia). Tramos: rojo->amarillo (más rápido = más rojo), +90 gris claro.
                        const colorDe = (t, i) => {
                            if (t.nuncaInicio) return '#475569';
                            if (i === curva.tramos.length - 1) return '#64748B';
                            const idx = i - 1; // 0 = 1-15 días
                            return idx === 0 ? '#EF4444' : idx === 1 ? '#F97316' : idx === 2 ? '#F59E0B' : '#FCD34D';
                        };
                        return curva.tramos.map((t, i) => {
                            const color = colorDe(t, i);
                            const alturaRel = (t.pct / maxPct) * 100; // escala visual al tramo más grande
                            return (
                                <div key={i} style={{ flex: '1 1 90px', textAlign: 'center' }}>
                                    <div style={{ height: '160px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
                                        <span style={{ color, fontWeight: 800, fontSize: '0.95rem', marginBottom: '0.2rem' }}>{t.pct}%</span>
                                        <div style={{ width: '46px', maxWidth: '80%', height: `${alturaRel}%`, background: color, borderRadius: '6px 6px 0 0', minHeight: '4px', transition: 'height 0.3s' }} />
                                    </div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: '0.5rem', color: 'var(--text-main)' }}>{t.label}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t.cant} personas</div>
                                </div>
                            );
                        });
                    })()}
                </div>
            </div>

            {/* Tarjetas resumen */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <StatCard valor={totalReal} label="Bajas totales" sub={`${conActividad} con actividad · ${sinInicioEfectivo} anuladas`} />
                <StatCard valor={`${pctMenos30}%`} label="Se fueron antes de 30 días" sub="del total de bajas" color="#EF4444" />
                <StatCard valor={`${pctMenos90}%`} label="Se fueron antes de 90 días" sub="del total de bajas" color="#F59E0B" />
                <StatCard valor={sinInicioEfectivo} label="Altas anuladas" sub="alta pero nunca inició" color="#64748B" />
            </div>

            {/* Servicios que más bajas tienen */}
            <div className="card" style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ margin: '0 0 0.35rem' }}>Servicios con más bajas</h3>
                <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Dónde se concentra la rotación.</p>
                <BarList items={topServicios.map(s => ({ label: s.servicio, valor: s.cantidad, color: '#EF4444' }))} max={maxServicio} />
            </div>

            {/* Índice de rotación mensual (bajas / nómina reconstruida) */}
            {meses.length > 0 && (() => {
                const maxRot = Math.max(...meses.map(m => m.rotacion), 1);
                return (
                    <div className="card" style={{ marginBottom: '1.25rem' }}>
                        <h3 style={{ margin: '0 0 0.35rem' }}>Índice de rotación mensual</h3>
                        <p style={{ margin: '0 0 1.25rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            Bajas del mes sobre el total del plantel. Cuanto más alto, más gente se fue ese mes en proporción.
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', justifyContent: 'space-around', flexWrap: 'wrap' }}>
                            {meses.map((m, i) => {
                                const color = m.rotacion >= 12 ? '#EF4444' : m.rotacion >= 8 ? '#F59E0B' : '#10B981';
                                return (
                                    <div key={i} style={{ flex: '1 1 70px', textAlign: 'center' }}>
                                        <div style={{ height: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
                                            <span style={{ color, fontWeight: 800, fontSize: '0.95rem', marginBottom: '0.2rem' }}>{m.rotacion}%</span>
                                            <div style={{ width: '40px', maxWidth: '80%', height: `${(m.rotacion / maxRot) * 100}%`, background: color, borderRadius: '5px 5px 0 0', minHeight: '4px', transition: 'height 0.3s' }} />
                                        </div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 600, marginTop: '0.4rem', color: 'var(--text-main)' }}>{mesLabel(m.mes).split(' ')[0].slice(0, 3)}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.cantidad}/{m.nomina}</div>
                                    </div>
                                );
                            })}
                        </div>
                        <p style={{ margin: '1rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Nómina estimada (reconstruida a partir de altas y bajas): usar como referencia de tendencia, no como valor exacto.
                        </p>
                    </div>
                );
            })()}

            {/* Tendencia mensual + Motivos, lado a lado */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
                <div className="card">
                    <h3 style={{ margin: '0 0 1rem' }}>Bajas por mes (cantidad)</h3>
                    <BarList items={meses.map(m => ({ label: mesLabel(m.mes), valor: m.cantidad, color: '#3b82f6' }))} max={maxMes} />
                </div>
                <div className="card">
                    <h3 style={{ margin: '0 0 1rem' }}>Motivos de baja</h3>
                    {motivos.length ? (
                        <BarList items={motivos.slice(0, 8).map(m => ({ label: MOTIVO_LABEL(m.motivo), valor: m.cantidad, color: '#8B5CF6' }))} max={maxMotivo} />
                    ) : (
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Los motivos se cargan al dar de baja un empleado en el sistema.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página con pestañas
// ─────────────────────────────────────────────────────────────────────────────

export default function KpisPage() {
    const [tab, setTab] = useState('gasto');

    const tabs = [
        { key: 'gasto', label: 'Gasto de insumos' },
        { key: 'rotacion', label: 'Rotación de personal' },
    ];

    return (
        <MainLayout>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <header className="page-header" style={{ marginBottom: '1rem' }}>
                    <h1>KPIs</h1>
                </header>

                <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '2px solid var(--border-color)' }}>
                    {tabs.map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: '0.6rem 1.1rem', fontSize: '0.9rem',
                            borderBottom: tab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent',
                            marginBottom: '-2px',
                            color: tab === t.key ? 'var(--color-primary)' : 'var(--text-muted)',
                            fontWeight: tab === t.key ? 700 : 500,
                        }}>{t.label}</button>
                    ))}
                </div>

                {tab === 'gasto' && <GastoInsumosTab />}
                {tab === 'rotacion' && <RotacionTab />}
            </div>
        </MainLayout>
    );
}
