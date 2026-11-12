'use client';

import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { matchesSearch } from '@/lib/search';

// Insumos para Ventas: solo los nombres, de solo lectura (pedido del usuario,
// 2026-11-12). El servidor ya le manda a Ventas nada más que id y nombre de
// los activos (/api/supplies), así que acá no hay precio ni proveedor que
// esconder. La gestión completa sigue en /compras/insumos.
export default function InsumosVentasPage() {
    const [insumos, setInsumos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [busqueda, setBusqueda] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/supplies', { credentials: 'include' });
                const data = await res.json().catch(() => null);
                if (!res.ok || !Array.isArray(data)) { setError('No se pudo cargar la lista de insumos.'); return; }
                setInsumos(data);
            } catch {
                setError('Error de red. Recargá la página.');
            } finally {
                setCargando(false);
            }
        })();
    }, []);

    const q = busqueda.trim();
    const visibles = useMemo(
        () => (q ? insumos.filter(i => matchesSearch(q, [i.nombre])) : insumos),
        [insumos, q]
    );

    return (
        <MainLayout>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <div style={{ marginBottom: '1.25rem' }}>
                    <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 0.2rem' }}>Insumos</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', margin: 0 }}>
                        {cargando ? 'Cargando…' : `${insumos.length} insumos`}
                    </p>
                </div>

                <input
                    type="text"
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar insumo…"
                    style={{
                        width: '100%', maxWidth: '320px', marginBottom: '1rem',
                        padding: '0.55rem 0.85rem', border: '1px solid var(--border-color)', borderRadius: '8px',
                        fontSize: '0.9rem', background: 'var(--color-surface)', color: 'var(--text-main)', outline: 'none',
                    }}
                />

                {error ? (
                    <div className="card" style={{ padding: '1.25rem', color: 'var(--error)' }}>{error}</div>
                ) : cargando ? (
                    <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>
                ) : !visibles.length ? (
                    <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        {q ? 'Ningún insumo coincide con la búsqueda.' : 'No hay insumos cargados.'}
                    </div>
                ) : (
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        {/* En columnas: son ~140 nombres cortos y en una sola
                            columna había que bajar mucho para recorrerlos. */}
                        <ul style={{
                            listStyle: 'none', margin: 0, padding: '0.35rem 0',
                            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                        }}>
                            {visibles.map(i => (
                                <li key={i.id} style={{ padding: '0.6rem 1.25rem', fontSize: '0.92rem', fontWeight: 500, borderBottom: '1px solid var(--border-color)' }}>
                                    {i.nombre}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </MainLayout>
    );
}
