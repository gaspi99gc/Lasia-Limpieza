'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Quién tiene que renovar uniforme: atrasados, este mes y el mes que viene, y
// qué comprar para cubrirlo. Sale de las entregas a nombre de cada operario y
// del plazo de cada prenda.

const fmt = (ymd) => (ymd ? String(ymd).slice(0, 10).split('-').reverse().join('/') : '—');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (ym) => (ym ? MESES[Number(ym.slice(5, 7)) - 1] : '');

const GRUPOS = [
    { id: 'vencida', titulo: 'Atrasados', color: '#DC2626' },
    { id: 'este_mes', titulo: 'Este mes', color: '#B45309' },
    { id: 'proximo_mes', titulo: 'El mes que viene', color: '#0369A1' },
];

export default function UniformesRenovaciones() {
    const router = useRouter();
    const [data, setData] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let vivo = true;
        fetch('/api/uniformes/renovaciones', { credentials: 'include' })
            .then(async (r) => {
                const j = await r.json().catch(() => ({}));
                if (!vivo) return;
                if (!r.ok) setError(j.error || 'No se pudieron calcular las renovaciones.');
                else setData(j);
            })
            .catch(() => { if (vivo) setError('Error de red.'); });
        return () => { vivo = false; };
    }, []);

    if (error) return <div className="card" style={{ padding: '1.25rem', color: 'var(--error)' }}>{error}</div>;
    if (!data) return <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Calculando…</div>;

    if (!data.hayPlazos) {
        return (
            <div className="card" style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Todavía no hay plazos de renovación cargados en las prendas.
            </div>
        );
    }

    const titulo = (g) => (g.id === 'este_mes' ? `Este mes (${nombreMes(data.mesActual)})`
        : g.id === 'proximo_mes' ? `El mes que viene (${nombreMes(data.mesSiguiente)})` : g.titulo);

    return (
        <>
            {data.compra.length > 0 && (
                <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                        Para cubrir de acá a fin de {nombreMes(data.mesSiguiente)}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {data.compra.map((c) => (
                            <span key={`${c.prenda}|${c.talle}`} style={{
                                padding: '0.3rem 0.65rem', borderRadius: '8px', fontSize: '0.88rem',
                                border: '1px solid var(--border-color)', background: 'var(--color-surface)',
                            }}>
                                {c.prenda} {c.talle} <strong>× {c.cantidad}</strong>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {GRUPOS.map((g) => {
                const filas = data.filas.filter((f) => f.estado === g.id);
                return (
                    <div key={g.id} className="card" style={{ padding: 0, marginBottom: '1rem' }}>
                        <div style={{ padding: '0.8rem 1.1rem', display: 'flex', alignItems: 'baseline', gap: '0.6rem', borderBottom: filas.length ? '1px solid var(--border-color)' : 'none' }}>
                            <strong style={{ color: g.color }}>{titulo(g)}</strong>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>· {filas.length}</span>
                        </div>
                        {filas.length > 0 && (
                            <div className="table-container">
                                <table className="mobile-cards-table">
                                    <thead>
                                        <tr>
                                            <th>Operario</th>
                                            <th>Legajo</th>
                                            <th>Servicio</th>
                                            <th>Prenda</th>
                                            <th>Entregada</th>
                                            <th>Renueva</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filas.map((f) => (
                                            <tr
                                                key={`${f.employee_id}|${f.prenda}`}
                                                onClick={() => router.push(`/rrhh?tab=personal&emp=${f.employee_id}`)}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <td data-label="Operario" style={{ fontWeight: 700 }}>{f.nombre}</td>
                                                <td data-label="Legajo">{f.legajo || '—'}</td>
                                                <td data-label="Servicio" style={{ color: f.servicio ? 'inherit' : 'var(--text-muted)' }}>{f.servicio || 'sin servicio'}</td>
                                                <td data-label="Prenda">{f.prenda} {f.talle} × {f.cantidad}</td>
                                                <td data-label="Entregada">{fmt(f.ultimaEntrega)}</td>
                                                <td data-label="Renueva" style={{ fontWeight: 700, color: g.color }}>{fmt(f.vence)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );
}
