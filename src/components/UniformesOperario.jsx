'use client';

import { useEffect, useMemo, useState } from 'react';
import { calcularACargo } from '@/lib/uniformes';

// Los uniformes de un operario dentro de su legajo: qué tiene a su nombre y
// desde cuándo. Es la base para saber cuándo le toca renovar.
//
// Solo lectura: entregar y devolver se hace desde /uniformes. Si quien mira no
// tiene acceso a uniformes (el servidor devuelve 403), la tarjeta no aparece.

const fmt = (ymd) => (ymd ? String(ymd).slice(0, 10).split('-').reverse().join('/') : '—');

const TIPO = {
    entrega: { label: 'Entrega', color: '#0369A1' },
    devolucion: { label: 'Devolución', color: '#15803D' },
};

export default function UniformesOperario({ empleadoId }) {
    const [movs, setMovs] = useState(null);

    useEffect(() => {
        if (!empleadoId) return;
        let vivo = true;
        fetch(`/api/uniformes/movimientos?employee_id=${empleadoId}`, { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => { if (vivo) setMovs(Array.isArray(j) ? j : null); })
            .catch(() => {});
        return () => { vivo = false; };
    }, [empleadoId]);

    const { tiene, historial } = useMemo(() => {
        const lista = (movs || []).filter((m) => m.tipo === 'entrega' || m.tipo === 'devolucion');
        const nombres = new Map(lista.map((m) => [m.prenda_id, `${m.prenda} ${m.talle}`]));
        const aCargo = calcularACargo(lista).get(Number(empleadoId)) || new Map();
        return {
            tiene: [...aCargo].map(([id, a]) => ({ id, nombre: nombres.get(id) || `prenda ${id}`, ...a }))
                .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')),
            historial: lista,   // ya viene de lo más nuevo a lo más viejo
        };
    }, [movs, empleadoId]);

    if (!movs) return null;

    return (
        <div className="card" style={{ padding: '1rem 1.25rem', marginTop: '1rem' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                Uniformes
            </div>

            {!tiene.length && !historial.length && (
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                    Todavía no tiene uniformes registrados a su nombre.
                </p>
            )}

            {tiene.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: historial.length ? '0.75rem' : 0 }}>
                    {tiene.map((t) => (
                        <div key={t.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', fontSize: '0.9rem' }}>
                            <span style={{ fontWeight: 700 }}>{t.nombre}</span>
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>× {t.cantidad}</span>
                            <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                entregado el {fmt(t.ultimaEntrega)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
            {!tiene.length && historial.length > 0 && (
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                    No tiene nada a su nombre: devolvió todo lo que se le entregó.
                </p>
            )}

            {historial.length > 0 && (
                <details>
                    <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Historial ({historial.length})
                    </summary>
                    <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        {historial.map((m) => (
                            <div key={m.id} style={{ fontSize: '0.82rem', display: 'flex', gap: '0.6rem' }}>
                                <span style={{ color: 'var(--text-muted)', minWidth: '5.5rem' }}>{fmt(m.fecha)}</span>
                                <span style={{ color: TIPO[m.tipo].color, fontWeight: 600, minWidth: '5.5rem' }}>{TIPO[m.tipo].label}</span>
                                <span>{m.prenda} {m.talle} × {Math.abs(m.cantidad)}</span>
                                <span style={{ color: 'var(--text-muted)' }}>{m.estado === 'usado' ? 'usada' : 'nueva'}</span>
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </div>
    );
}
