'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

// KPI de ausentismo: cuánto trabajo se pierde por faltas y en quiénes se
// concentra.
//
// Solo cuenta gente que hoy trabaja acá. Las faltas de quien ya se fue sirven
// para estudiar rotación, no para gestionar ausentismo: a esa persona no se la
// puede llamar, y dejarla adentro infla el promedio de un problema que ya no
// existe.

const nf = (n) => Math.round(Number(n) || 0).toLocaleString('es-AR');

function mesLabel(ym) {
    const [a, m] = String(ym || '').split('-').map(Number);
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return meses[m - 1] ? `${meses[m - 1]} ${String(a).slice(2)}` : ym;
}

function Tarjeta({ valor, etiqueta, detalle, color }) {
    return (
        <div className="card" style={{ padding: '1rem 1.25rem', flex: '1 1 180px', minWidth: '160px' }}>
            <div style={{ fontSize: '1.9rem', fontWeight: 800, lineHeight: 1.1, color: color || 'var(--text-main)' }}>
                {valor}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{etiqueta}</div>
            {detalle && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>{detalle}</div>
            )}
        </div>
    );
}

export default function AusentismoTab() {
    const [meses, setMeses] = useState(6);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const cargar = useCallback(async (m) => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/kpis/ausentismo?meses=${m}`, { credentials: 'include' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setError(json.error || 'No se pudo cargar el ausentismo.'); return; }
            setData(json);
        } catch {
            setError('Error de red.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { cargar(meses); }, [meses, cargar]);

    const maxHoras = useMemo(
        () => Math.max(1, ...(data?.porMes || []).map(m => m.horas)),
        [data]
    );

    if (loading) {
        return <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>;
    }
    if (error) {
        return <div className="card" style={{ padding: '1.25rem', color: 'var(--error)' }}>{error}</div>;
    }

    const r = data.resumen;

    return (
        <div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>Período</span>
                {[3, 6, 12].map(m => (
                    <button
                        key={m}
                        className={`btn ${meses === m ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.35rem 0.8rem', fontSize: '0.85rem' }}
                        onClick={() => setMeses(m)}
                    >
                        {m} meses
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                {/* El número que se entiende sin traducir: las horas sueltas no
                    dicen nada, "97 jornadas" sí. */}
                <Tarjeta
                    valor={nf(r.jornadasPromedioMes)}
                    etiqueta="jornadas perdidas por mes"
                    detalle={`${nf(r.horasPromedioMes)} horas mensuales`}
                    color="#B45309"
                />
                <Tarjeta valor={nf(r.horas)} etiqueta="horas en el período" detalle={`${nf(r.faltas)} faltas`} />
                <Tarjeta
                    valor={`${nf(r.pctPersonalConFaltas)}%`}
                    etiqueta="del personal faltó al menos una vez"
                    detalle={`${r.personas} de ${r.activos} activos`}
                />
                <Tarjeta
                    valor={`${nf(r.pctHorasTop10)}%`}
                    etiqueta="de las horas las explican 10 personas"
                    detalle="cuanto más alto, más concentrado el problema"
                    color="#B45309"
                />
            </div>

            <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: '0 0 0.85rem', fontSize: '1rem' }}>Horas perdidas por mes</h3>
                {data.porMes.map(m => (
                    <div key={m.mes} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.45rem' }}>
                        <span style={{ width: '4rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{mesLabel(m.mes)}</span>
                        <div style={{ flex: 1, background: 'var(--color-muted-surface)', borderRadius: '4px', height: '1.4rem', position: 'relative' }}>
                            <div style={{ width: `${(m.horas / maxHoras) * 100}%`, background: '#B45309', height: '100%', borderRadius: '4px' }} />
                        </div>
                        <span style={{ width: '9rem', fontSize: '0.82rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            <strong>{nf(m.horas)} hs</strong>
                            <span style={{ color: 'var(--text-muted)' }}> · {m.personas} personas</span>
                        </span>
                    </div>
                ))}
            </div>

            <div className="card" style={{ padding: 0 }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>Quiénes faltan más</h3>
                    {/* Por horas y no por cantidad: una falta de 8 horas no pesa
                        lo mismo que una de 2. */}
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Ordenado por horas perdidas, no por cantidad de faltas.
                    </p>
                </div>
                <div className="table-container">
                    <table className="mobile-cards-table">
                        <thead>
                            <tr>
                                <th>Operario</th>
                                <th style={{ textAlign: 'right' }}>Faltas</th>
                                <th style={{ textAlign: 'right' }}>Horas</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.ranking.map(p => (
                                <tr key={p.employee_id}>
                                    <td data-label="Operario">
                                        {p.nombre}
                                        {p.legajo && (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> · leg {p.legajo}</span>
                                        )}
                                    </td>
                                    <td data-label="Faltas" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.faltas}</td>
                                    <td data-label="Horas" style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{nf(p.horas)}</td>
                                </tr>
                            ))}
                            {!data.ranking.length && (
                                <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Sin faltas en el período.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
                Cuenta solo personal activo: las faltas de quienes ya no trabajan acá quedan afuera
                porque no se pueden gestionar. Todavía no se corta por servicio — la mayoría de las
                faltas vienen de la planilla histórica, que no lo registra.
            </p>
        </div>
    );
}
