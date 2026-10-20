'use client';

import { useMemo, useState } from 'react';
import { notify } from '@/lib/toast';

// Elegir y sumar prendas: prenda → talle → cantidad → Agregar, y lo agregado
// queda en una lista corta que se puede sacar.
//
// Lo usan los movimientos de uniformes (entregar, devolver, comprar, corregir)
// y el alta de personal. Antes se mostraban las 24 combinaciones a la vez con
// un casillero cada una; mostrar solo lo que se carga es menos ruido.

const inputEstilo = {
    padding: '0.5rem 0.65rem', borderRadius: '8px',
    border: '1px solid var(--border-color)', background: 'var(--color-surface)',
    color: 'var(--text-main)', fontSize: '0.9rem',
};

/**
 * @param {Array}    prendas           catálogo con stock (de /api/uniformes/prendas)
 * @param {string}   estado            'nuevo' | 'usado': qué stock se muestra al lado del talle
 * @param {Array}    lineas            [{ prenda_id, cantidad }]
 * @param {function} onChange          recibe las líneas nuevas
 * @param {boolean}  permitirNegativo  solo para corregir el conteo
 * @param {function} avisoLinea        (prenda, linea) => texto de aviso o null
 */
export default function UniformeLineas({ prendas, estado, lineas, onChange, permitirNegativo = false, avisoLinea }) {
    const [selPrenda, setSelPrenda] = useState('');
    const [selTalle, setSelTalle] = useState('');
    const [selCantidad, setSelCantidad] = useState('1');

    const activas = useMemo(() => prendas.filter((p) => p.activo), [prendas]);
    const porId = useMemo(() => new Map(activas.map((p) => [p.id, p])), [activas]);
    const nombresPrenda = useMemo(() => [...new Set(activas.map((p) => p.prenda))], [activas]);
    const tallesDisponibles = useMemo(() => activas.filter((p) => p.prenda === selPrenda), [activas, selPrenda]);
    const disponible = (p) => (estado === 'usado' ? p.stock_usado : p.stock_nuevo);

    const agregar = () => {
        const prendaId = Number(selTalle);
        const n = Math.trunc(Number(selCantidad));
        if (!prendaId) { notify.error('Elegí la prenda y el talle.'); return; }
        if (!Number.isFinite(n) || n === 0) { notify.error('Poné una cantidad.'); return; }
        if (n < 0 && !permitirNegativo) { notify.error('La cantidad tiene que ser positiva.'); return; }

        // Si esa prenda ya está en la lista, se suma en vez de duplicar el
        // renglón: cargarla dos veces es un error de tipeo, no dos entregas.
        const i = lineas.findIndex((l) => l.prenda_id === prendaId);
        if (i === -1) onChange([...lineas, { prenda_id: prendaId, cantidad: n }]);
        else onChange(lineas.map((l, j) => (j === i ? { ...l, cantidad: l.cantidad + n } : l)));
        // El talle se limpia pero la prenda queda: cargar varios talles de la
        // misma prenda es lo más común.
        setSelTalle('');
        setSelCantidad('1');
    };

    return (
        <>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
                <div style={{ flex: 2, minWidth: '150px' }}>
                    <select
                        value={selPrenda}
                        onChange={(e) => { setSelPrenda(e.target.value); setSelTalle(''); }}
                        style={{ ...inputEstilo, width: '100%' }}
                    >
                        <option value="">Prenda…</option>
                        {nombresPrenda.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                </div>
                <div style={{ flex: 1, minWidth: '110px' }}>
                    <select
                        value={selTalle}
                        onChange={(e) => setSelTalle(e.target.value)}
                        disabled={!selPrenda}
                        style={{ ...inputEstilo, width: '100%' }}
                    >
                        <option value="">Talle…</option>
                        {tallesDisponibles.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.talle} (hay {disponible(p)})
                            </option>
                        ))}
                    </select>
                </div>
                <input
                    type="number"
                    step="1"
                    value={selCantidad}
                    onChange={(e) => setSelCantidad(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }}
                    style={{ ...inputEstilo, width: '4.5rem', textAlign: 'right' }}
                />
                <button type="button" className="btn btn-secondary" onClick={agregar} disabled={!selTalle}>
                    Agregar
                </button>
            </div>

            <div style={{
                border: '1px solid var(--border-color)', borderRadius: '8px',
                marginBottom: '1rem', maxHeight: '220px', overflowY: 'auto',
            }}>
                {!lineas.length && (
                    <p style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)', margin: 0, fontSize: '0.88rem' }}>
                        {activas.length ? 'Elegí una prenda arriba y tocá Agregar.' : 'No hay prendas cargadas todavía.'}
                    </p>
                )}
                {lineas.map((l, i) => {
                    const p = porId.get(l.prenda_id);
                    if (!p) return null;
                    const aviso = avisoLinea?.(p, l);
                    return (
                        <div
                            key={l.prenda_id}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.75rem',
                                padding: '0.5rem 0.75rem',
                                borderTop: i === 0 ? 'none' : '1px solid var(--border-color)',
                            }}
                        >
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                {p.prenda} <span style={{ color: 'var(--text-muted)' }}>·</span> {p.talle}
                            </span>
                            {aviso && (
                                <span style={{ fontSize: '0.78rem', color: '#B45309', fontWeight: 600 }}>{aviso}</span>
                            )}
                            <span style={{ marginLeft: 'auto', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                {l.cantidad}
                            </span>
                            <button
                                type="button"
                                onClick={() => onChange(lineas.filter((x) => x.prenda_id !== l.prenda_id))}
                                title="Sacar de la lista"
                                style={{
                                    border: 'none', background: 'none', cursor: 'pointer',
                                    color: 'var(--text-muted)', fontSize: '1.05rem', lineHeight: 1, padding: '0 0.15rem',
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
