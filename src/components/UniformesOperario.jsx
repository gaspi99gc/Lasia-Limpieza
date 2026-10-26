'use client';

import { useEffect, useMemo, useState } from 'react';
import { calcularACargo, renovacionesDe } from '@/lib/uniformes';
import { getSessionUser } from '@/lib/session';
import { notify } from '@/lib/toast';

const hoyAR = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

// Los uniformes de un operario dentro de su legajo: qué tiene a su nombre y
// desde cuándo. Es la base para saber cuándo le toca renovar.
//
// Entregar y devolver se hace desde /uniformes. Acá solo se corrige cuánto
// tiene de cada prenda (RRHH y admin), y la corrección arregla también el
// stock. Si quien mira no tiene acceso a uniformes (el servidor devuelve 403),
// la tarjeta no aparece.

const fmt = (ymd) => (ymd ? String(ymd).slice(0, 10).split('-').reverse().join('/') : '—');

const TIPO = {
    entrega: { label: 'Entrega', color: '#0369A1' },
    devolucion: { label: 'Devolución', color: '#15803D' },
};

export default function UniformesOperario({ empleadoId }) {
    const [movs, setMovs] = useState(null);
    // El catálogo trae el plazo de renovación de cada prenda.
    const [prendas, setPrendas] = useState([]);
    const [recarga, setRecarga] = useState(0);
    const [puedeEditar, setPuedeEditar] = useState(false);
    // Prenda que se está corrigiendo y el número escrito.
    const [editando, setEditando] = useState(null);
    const [valor, setValor] = useState('');
    const [guardando, setGuardando] = useState(false);

    // La sesión vive en el navegador: no se puede leer en el primer render.
    useEffect(() => { setPuedeEditar(['admin', 'rrhh'].includes(getSessionUser()?.role)); }, []);

    useEffect(() => {
        if (!empleadoId) return;
        let vivo = true;
        fetch(`/api/uniformes/movimientos?employee_id=${empleadoId}`, { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => { if (vivo) setMovs(Array.isArray(j) ? j : null); })
            .catch(() => {});
        fetch('/api/uniformes/prendas', { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : []))
            .then((j) => { if (vivo) setPrendas(Array.isArray(j) ? j : []); })
            .catch(() => {});
        return () => { vivo = false; };
    }, [empleadoId, recarga]);

    const guardar = async (prendaId) => {
        const n = Number(valor);
        if (valor === '' || !Number.isInteger(n) || n < 0) { notify.error('Poné un número entero, 0 o más.'); return; }
        setGuardando(true);
        try {
            const res = await fetch('/api/uniformes/movimientos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ employee_id: Number(empleadoId), prenda_id: prendaId, cantidad: n }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(j.error || 'No se pudo corregir.'); return; }
            if (!j.sinCambios) notify.success('Corregido. El stock también se ajustó.');
            setEditando(null);
            setRecarga((r) => r + 1);
        } catch {
            notify.error('Error de red al corregir.');
        } finally {
            setGuardando(false);
        }
    };

    const { tiene, historial } = useMemo(() => {
        const lista = (movs || []).filter((m) => m.tipo === 'entrega' || m.tipo === 'devolucion');
        const nombres = new Map(lista.map((m) => [m.prenda_id, `${m.prenda} ${m.talle}`]));
        const aCargo = calcularACargo(lista).get(Number(empleadoId)) || new Map();
        // Cuándo renueva: va en la fila de la última entrega de esa prenda.
        const renueva = new Map(renovacionesDe(aCargo, prendas).map((r) => [r.prenda_id, r.vence]));
        return {
            tiene: [...aCargo].map(([id, a]) => ({ id, nombre: nombres.get(id) || `prenda ${id}`, vence: renueva.get(id) || null, ...a }))
                .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')),
            historial: lista,   // ya viene de lo más nuevo a lo más viejo
        };
    }, [movs, empleadoId, prendas]);

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
                            {editando === t.id ? (
                                <span style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                    ×
                                    <input
                                        type="number" min="0" step="1"
                                        value={valor}
                                        onChange={(e) => setValor(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') guardar(t.id); if (e.key === 'Escape') setEditando(null); }}
                                        autoFocus
                                        style={{ width: '4rem', padding: '0.2rem 0.4rem' }}
                                    />
                                    <button className="btn btn-primary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }} onClick={() => guardar(t.id)} disabled={guardando}>
                                        {guardando ? '…' : 'Guardar'}
                                    </button>
                                    <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }} onClick={() => setEditando(null)} disabled={guardando}>
                                        ✕
                                    </button>
                                </span>
                            ) : (
                                <span style={{ display: 'flex', gap: '0.35rem', alignItems: 'baseline' }}>
                                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>× {t.cantidad}</span>
                                    {puedeEditar && (
                                        <button
                                            type="button"
                                            title="Corregir cantidad"
                                            onClick={() => { setEditando(t.id); setValor(String(t.cantidad)); }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.85rem', opacity: 0.6 }}
                                        >
                                            ✏️
                                        </button>
                                    )}
                                </span>
                            )}
                            <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                entregado el {fmt(t.ultimaEntrega)}
                            </span>
                            {t.vence && (
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: t.vence < hoyAR() ? 'var(--error)' : 'var(--text-main)' }}>
                                    {t.vence < hoyAR() ? `renovación vencida (${fmt(t.vence)})` : `renueva el ${fmt(t.vence)}`}
                                </span>
                            )}
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
