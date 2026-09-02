'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { notify } from '@/lib/toast';
import { normalizeText } from '@/lib/search';
import { downloadWorkbook } from '@/lib/xlsx-download';

// Antecedentes penales primero (es la prioridad de RRHH); si cambia el id, ajustar.
const TIPO_PRIORITARIO = 'antecedentes';
const esPrioritario = (nombre) => normalizeText(nombre).includes(TIPO_PRIORITARIO);

export default function DocFaltantesView() {
    const router = useRouter();
    const searchParams = useSearchParams();
    // El dashboard linkea con ?falta=domicilio|emergencia|servicio para abrir
    // directo esa lista en vez de la de antecedentes.
    const faltaParam = searchParams.get('falta');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    // La selección puede ser un documento o un dato del legajo.
    const [sel, setSel] = useState(null); // { grupo: 'doc'|'dato', id }
    const [search, setSearch] = useState('');

    // Abre el legajo del empleado para cargarle la documentación que falta.
    const irAlLegajo = (empId) => router.push(`/rrhh?tab=personal&empleado=${empId}`);

    useEffect(() => {
        let cancel = false;
        (async () => {
            setLoading(true);
            setError('');
            try {
                const res = await fetch('/api/employee-documents/faltantes', { credentials: 'include' });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'No se pudo cargar la estadística.');
                if (cancel) return;
                setData(json);
                // Si el dashboard pidió un dato puntual, se abre ese; si no, el
                // documento prioritario (antecedentes).
                const dato = faltaParam && json.porDato?.find(d => d.dato_key === faltaParam);
                if (dato) {
                    setSel({ grupo: 'dato', id: dato.dato_key });
                } else {
                    const prio = json.porTipo?.find(t => esPrioritario(t.nombre)) || json.porTipo?.[0];
                    setSel(prio ? { grupo: 'doc', id: prio.tipo_id } : null);
                }
            } catch (e) {
                if (!cancel) setError(e.message || 'Error de red');
            } finally {
                if (!cancel) setLoading(false);
            }
        })();
        return () => { cancel = true; };
    }, [faltaParam]);

    const tipoActual = useMemo(() => {
        if (!sel) return null;
        return sel.grupo === 'doc'
            ? data?.porTipo?.find(t => t.tipo_id === sel.id) || null
            : data?.porDato?.find(d => d.dato_key === sel.id) || null;
    }, [data, sel]);

    const faltantesFiltrados = useMemo(() => {
        if (!tipoActual) return [];
        const q = normalizeText(search);
        return tipoActual.faltantes.filter(e =>
            !q || normalizeText(`${e.apellido} ${e.nombre} ${e.legajo} ${e.servicio || ''}`).includes(q)
        );
    }, [tipoActual, search]);

    const exportarExcel = async () => {
        if (!tipoActual || !tipoActual.faltantes.length) { notify.error('No hay faltantes para exportar.'); return; }
        const XLSX = await import('xlsx');
        const rows = tipoActual.faltantes.map(e => ({
            Apellido: e.apellido,
            Nombre: e.nombre,
            Legajo: e.legajo,
            Servicio: e.servicio || '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ width: 22 }, { width: 22 }, { width: 10 }, { width: 40 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Faltantes');
        const nombreArch = tipoActual.nombre.replace(/[^a-zA-Z0-9]+/g, '_');
        downloadWorkbook(XLSX, wb, `Faltan_${nombreArch}.xlsx`);
    };

    if (loading) return <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>;
    if (error) return <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--error)' }}>{error}</div>;
    if (!data) return null;

    return (
        <div>
            <header className="page-header" style={{ marginBottom: '1.5rem' }}>
                <div>
                    <h1>Documentación faltante</h1>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Sobre {data.totalActivos} empleados activos. Elegí un documento para ver quiénes lo tienen sin cargar.
                    </p>
                </div>
            </header>

            {/* Datos del legajo (domicilio, contacto de emergencia, servicio).
                Van primero porque son el relevamiento en curso. */}
            {data.porDato?.length > 0 && (
                <>
                    <h3 style={{ margin: '0 0 0.6rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                        Datos del legajo
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
                        {data.porDato.map(d => {
                            const activo = sel?.grupo === 'dato' && sel.id === d.dato_key;
                            const pctFalta = data.totalActivos ? Math.round((d.faltan / data.totalActivos) * 100) : 0;
                            return (
                                <button
                                    key={d.dato_key}
                                    onClick={() => { setSel({ grupo: 'dato', id: d.dato_key }); setSearch(''); }}
                                    className="card"
                                    style={{
                                        textAlign: 'left', cursor: 'pointer',
                                        border: activo ? '2px solid var(--color-primary, #3b82f6)' : '1px solid var(--border-color)',
                                        padding: '1rem 1.1rem',
                                    }}
                                >
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                        {d.nombre}
                                    </div>
                                    <div style={{ fontSize: '1.9rem', fontWeight: 800, color: d.faltan > 0 ? '#EF4444' : '#10B981', lineHeight: 1 }}>{d.faltan}</div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                        sin cargar ({pctFalta}%) · {d.tienen} al día
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            {/* Tarjetas por documento. La prioritaria (antecedentes) se resalta. */}
            <h3 style={{ margin: '0 0 0.6rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                Documentación
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {data.porTipo.map(t => {
                    const prio = esPrioritario(t.nombre);
                    const activo = sel?.grupo === 'doc' && sel.id === t.tipo_id;
                    const pctFalta = data.totalActivos ? Math.round((t.faltan / data.totalActivos) * 100) : 0;
                    return (
                        <button
                            key={t.tipo_id}
                            onClick={() => { setSel({ grupo: 'doc', id: t.tipo_id }); setSearch(''); }}
                            className="card"
                            style={{
                                textAlign: 'left', cursor: 'pointer',
                                border: activo ? '2px solid var(--color-primary, #3b82f6)' : prio ? '2px solid #F59E0B' : '1px solid var(--border-color)',
                                padding: '1rem 1.1rem',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 700, color: prio ? '#B45309' : 'var(--text-muted)', marginBottom: '0.4rem' }}>
                                {prio && <span aria-hidden="true">⚠️</span>}
                                <span style={{ textTransform: 'uppercase', letterSpacing: '0.02em' }}>{t.nombre}</span>
                            </div>
                            <div style={{ fontSize: '1.9rem', fontWeight: 800, color: t.faltan > 0 ? '#EF4444' : '#10B981', lineHeight: 1 }}>{t.faltan}</div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                sin cargar ({pctFalta}%) · {t.tienen} al día
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Lista de faltantes del documento seleccionado */}
            {tipoActual && (
                <div className="card" style={{ padding: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
                        <h3 style={{ margin: 0 }}>
                            {sel?.grupo === 'dato' ? 'Sin' : 'Faltan'} <strong>{tipoActual.nombre}</strong>: {faltantesFiltrados.length}{search ? ` de ${tipoActual.faltan}` : ''}
                        </h3>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <input
                                type="text"
                                placeholder="🔍 Buscar…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{ padding: '0.4rem 0.7rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg, transparent)', color: 'var(--text-main)', fontSize: '0.88rem' }}
                            />
                            <button className="btn btn-secondary" onClick={exportarExcel}>📤 Excel</button>
                        </div>
                    </div>
                    <div className="table-container">
                        <table className="table mobile-cards-table">
                            <thead>
                                <tr>
                                    <th>Empleado</th>
                                    <th>Legajo</th>
                                    <th>Servicio</th>
                                    <th style={{ textAlign: 'right' }}>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {faltantesFiltrados.map(e => (
                                    <tr
                                        key={e.id}
                                        onClick={() => irAlLegajo(e.id)}
                                        style={{ cursor: 'pointer' }}
                                        title="Abrir legajo para cargar lo que falta"
                                    >
                                        <td data-label="Empleado" style={{ fontWeight: 600 }}>{e.apellido}, {e.nombre}</td>
                                        <td data-label="Legajo">{e.legajo || '—'}</td>
                                        <td data-label="Servicio">{e.servicio || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                                        <td data-label="Acción" className="mobile-hide-label" style={{ textAlign: 'right' }}>
                                            <span className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem' }}>Abrir legajo →</span>
                                        </td>
                                    </tr>
                                ))}
                                {faltantesFiltrados.length === 0 && (
                                    <tr>
                                        <td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                                            {search ? 'Ningún empleado coincide con la búsqueda.' : '¡No falta nadie en esta categoría! 🎉'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
