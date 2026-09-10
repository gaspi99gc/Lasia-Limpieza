'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { getSessionUser } from '@/lib/session';
import { notify } from '@/lib/toast';

// Stock de uniformes.
//
// Lo primero que se ve es lo que falta comprar: las prendas por debajo del
// mínimo van arriba de todo. El resto del stock es consulta; ese número es el
// único sobre el que se puede actuar.
//
// Las prendas se agrupan por nombre con los talles adentro. Plano serían 40-50
// filas iguales y no se encontraría nada.

const ROLES_CARGA = ['admin', 'rrhh'];

const money = (n) =>
    Number(n || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

export default function UniformesPage() {
    const [role, setRole] = useState(null);
    const [prendas, setPrendas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [abiertas, setAbiertas] = useState(() => new Set());

    // La sesión vive en el navegador: no se puede leer en el primer render.
    useEffect(() => { setRole(getSessionUser()?.role || null); }, []);
    const puedeCargar = ROLES_CARGA.includes(role);

    const cargar = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/uniformes/prendas', { credentials: 'include' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setError(json.error || 'No se pudo cargar el stock.'); return; }
            setPrendas(Array.isArray(json) ? json : []);
        } catch {
            setError('Error de red. Probá recargar la página.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    // Agrupado por prenda, con los talles adentro.
    const grupos = useMemo(() => {
        const map = new Map();
        for (const p of prendas) {
            if (!map.has(p.prenda)) map.set(p.prenda, []);
            map.get(p.prenda).push(p);
        }
        const salida = [...map.entries()].map(([nombre, talles]) => ({
            nombre,
            talles,
            nuevo: talles.reduce((a, t) => a + (t.stock_nuevo || 0), 0),
            usado: talles.reduce((a, t) => a + (t.stock_usado || 0), 0),
            total: talles.reduce((a, t) => a + (t.stock_total || 0), 0),
            enRotacion: talles.reduce((a, t) => a + (t.en_rotacion || 0), 0),
            faltan: talles.filter((t) => t.falta).length,
        }));
        // Lo que falta primero: es lo accionable.
        // Las prendas de un mismo cliente van juntas: alfabético dejaba "Buzo
        // WeWork" y "Remera WeWork" separados por Camisa y Pantalón, y son el
        // mismo uniforme.
        const grupoDe = (n) => (/wework/i.test(n) ? 1 : 0);
        salida.sort((a, b) =>
            (b.faltan - a.faltan)
            || (grupoDe(a.nombre) - grupoDe(b.nombre))
            || a.nombre.localeCompare(b.nombre)
        );
        return salida;
    }, [prendas]);

    const resumen = useMemo(() => ({
        enArmario: prendas.reduce((a, p) => a + (p.stock_total || 0), 0),
        enCalle: prendas.reduce((a, p) => a + (p.en_rotacion || 0), 0),
        faltantes: prendas.filter((p) => p.falta).length,
        valorizado: prendas.reduce((a, p) => a + (p.stock_total || 0) * Number(p.precio || 0), 0),
    }), [prendas]);

    const toggle = (nombre) => {
        setAbiertas((prev) => {
            const next = new Set(prev);
            if (next.has(nombre)) next.delete(nombre); else next.add(nombre);
            return next;
        });
    };

    const num = (n, resaltar) => (
        <span style={{
            fontVariantNumeric: 'tabular-nums',
            fontWeight: resaltar ? 700 : 500,
            color: n < 0 ? 'var(--error)' : resaltar ? 'var(--text-main)' : 'var(--text-muted)',
        }}>
            {n}
        </span>
    );

    return (
        <MainLayout>
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                <header style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                    <div style={{ flex: 1, minWidth: '240px' }}>
                        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Uniformes</h1>
                        <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                            Qué hay en el armario, qué está en la calle y cuánto cuesta reponerlo.
                        </p>
                    </div>
                </header>

                {error && (
                    <div className="card" style={{ padding: '1.25rem', color: 'var(--error)', marginBottom: '1rem' }}>{error}</div>
                )}

                {!loading && !error && (
                    <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1 }}>{resumen.enArmario}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>en el armario</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1 }}>{resumen.enCalle}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>en la calle</div>
                        </div>
                        <div>
                            <div style={{
                                fontSize: '1.7rem', fontWeight: 800, lineHeight: 1,
                                color: resumen.faltantes ? '#B45309' : 'var(--text-muted)',
                            }}>
                                {resumen.faltantes}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {resumen.faltantes === 1 ? 'talle por debajo del mínimo' : 'talles por debajo del mínimo'}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1 }}>{money(resumen.valorizado)}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>valor del armario</div>
                        </div>
                    </div>
                )}

                {loading && (
                    <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>
                )}

                {/* Estado vacío: el módulo arranca sin nada y hay que decir qué
                    hacer, no mostrar una tabla vacía. */}
                {!loading && !error && !prendas.length && (
                    <div className="card" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>👕</div>
                        <strong style={{ display: 'block', fontSize: '1.05rem', marginBottom: '0.4rem' }}>
                            Todavía no hay prendas cargadas
                        </strong>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                            {puedeCargar
                                ? 'Empezá cargando las prendas con sus talles, y después el conteo de lo que hay hoy en el armario.'
                                : 'RRHH todavía no cargó el catálogo de uniformes.'}
                        </p>
                    </div>
                )}

                {!loading && !error && grupos.map((g) => {
                    const abierta = abiertas.has(g.nombre);
                    return (
                        <div key={g.nombre} className="card" style={{ padding: 0, marginBottom: '0.75rem', overflow: 'hidden' }}>
                            <button
                                onClick={() => toggle(g.nombre)}
                                style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    padding: '0.9rem 1.1rem', border: 'none', background: 'none',
                                    cursor: 'pointer', color: 'inherit', font: 'inherit', textAlign: 'left',
                                }}
                            >
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', width: '0.8rem' }}>
                                    {abierta ? '▾' : '▸'}
                                </span>
                                <span style={{ fontWeight: 700, flex: 1 }}>
                                    {g.nombre}
                                    <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.85rem' }}>
                                        {' '}· {g.talles.length} {g.talles.length === 1 ? 'talle' : 'talles'}
                                    </span>
                                </span>
                                {g.faltan > 0 && (
                                    <span style={{
                                        fontSize: '0.75rem', fontWeight: 700, color: '#B45309',
                                        background: 'rgba(180,83,9,0.12)', padding: '0.15rem 0.5rem', borderRadius: '999px',
                                    }}>
                                        faltan {g.faltan}
                                    </span>
                                )}
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    armario {num(g.total, true)} · calle {num(g.enRotacion)}
                                </span>
                            </button>

                            {abierta && (
                                <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border-color)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--color-muted-surface)' }}>
                                                {['Talle', 'Nuevo', 'Usado', 'En armario', 'En la calle', 'Mínimo', 'Precio'].map((h, i) => (
                                                    <th key={h} style={{
                                                        padding: '0.5rem 0.75rem', textAlign: i === 0 ? 'left' : 'right',
                                                        fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap',
                                                    }}>
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {g.talles.map((t) => (
                                                <tr key={t.id} style={{
                                                    borderTop: '1px solid var(--border-color)',
                                                    background: t.falta ? 'rgba(180,83,9,0.07)' : 'transparent',
                                                }}>
                                                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>
                                                        {t.talle}
                                                        {!t.activo && (
                                                            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · inactiva</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{num(t.stock_nuevo)}</td>
                                                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{num(t.stock_usado)}</td>
                                                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{num(t.stock_total, true)}</td>
                                                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{num(t.en_rotacion)}</td>
                                                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                                                        {t.stock_minimo || '—'}
                                                    </td>
                                                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        {Number(t.precio) > 0
                                                            ? money(t.precio)
                                                            : <span style={{ color: 'var(--text-muted)' }}>sin precio</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Mientras no haya movimientos cargados, "en la calle" es 0 y eso
                    NO quiere decir que nadie tenga uniforme: quiere decir que
                    todavía no se registró. Decirlo evita leer mal el número. */}
                {!loading && !error && prendas.length > 0 && resumen.enCalle === 0 && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.83rem', marginTop: '1rem' }}>
                        &quot;En la calle&quot; arranca en cero porque todavía no se registraron entregas. No
                        significa que nadie tenga uniforme: se va a ir llenando a medida que se carguen.
                    </p>
                )}
            </div>
        </MainLayout>
    );
}
