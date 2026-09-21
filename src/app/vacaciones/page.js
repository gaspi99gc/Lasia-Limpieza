'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { downloadWorkbook } from '@/lib/xlsx-download';
import { notify } from '@/lib/toast';

// Días de vacaciones por antigüedad.
//
// Arranca mostrando los de 21 y 28 días, que son los que hay que planificar: son
// 64 personas sobre 334, y son las ausencias largas que hay que cubrir sí o sí.
// El resto está a un clic, para que el total cierre.
//
// La antigüedad se cuenta al 31 de diciembre y no al día de hoy: así lo fija la
// ley y evita que el número cambie solo según cuándo se abra la pantalla.

const fmtFecha = (ymd) => {
    if (!ymd) return '—';
    const [a, m, d] = String(ymd).slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
};

const COLOR_TRAMO = { 35: '#7C3AED', 28: '#B45309', 21: '#0369A1', 14: '#4B5563', 0: '#9CA3AF' };

export default function VacacionesPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const router = useRouter();
    const anio = new Date().getFullYear();
    const [busqueda, setBusqueda] = useState('');
    // Orden de la tabla. Arranca por antigüedad porque es lo que se viene a ver;
    // se cambia tocando el encabezado de cualquier columna.
    const [orden, setOrden] = useState({ col: 'anios', desc: true });

    const cargar = useCallback(async (a) => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/vacaciones?anio=${a}`, { credentials: 'include' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setError(json.error || 'No se pudo cargar.'); return; }
            setData(json);
        } catch {
            setError('Error de red.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { cargar(anio); }, [anio, cargar]);

    const filas = useMemo(() => {
        // Solo 21 y 28 días. La pantalla es para PLANIFICAR las ausencias largas,
        // que son las que hay que cubrir sí o sí; los de 14 días son 168 personas
        // y tapaban lo que se viene a mirar.
        let f = (data?.filas || []).filter(x => x.dias >= 21);
        const q = busqueda.trim().toLowerCase();
        if (q) f = f.filter(x => `${x.nombre} ${x.legajo || ''} ${x.servicio || ''}`.toLowerCase().includes(q));

        const { col, desc } = orden;
        const signo = desc ? -1 : 1;
        return [...f].sort((a, b) => {
            let r;
            if (col === 'nombre' || col === 'servicio') {
                // Los que no tienen servicio van siempre al final, ordene como ordene:
                // no aportan nada arriba de la lista.
                const va = a[col] || '';
                const vb = b[col] || '';
                if (col === 'servicio' && !va !== !vb) return va ? -1 : 1;
                r = va.localeCompare(vb, 'es');
            } else if (col === 'fecha_ingreso') {
                r = String(a.fecha_ingreso).localeCompare(String(b.fecha_ingreso));
            } else {
                r = (a[col] || 0) - (b[col] || 0);
            }
            // A igualdad, por nombre: así el orden es estable y no baila al
            // volver a tocar la misma columna.
            return r * signo || a.nombre.localeCompare(b.nombre, 'es');
        });
    }, [data, busqueda, orden]);

    // Tocar la misma columna invierte; cambiar de columna arranca en el orden
    // más útil para esa columna (los nombres de la A, los números de mayor a menor).
    const ordenarPor = (col) => {
        setOrden(prev => prev.col === col
            ? { col, desc: !prev.desc }
            : { col, desc: col === 'anios' || col === 'dias' });
    };

    // Lo que queda por otorgar es el número accionable: son los días que alguien
    // va a tener que cubrir en algún momento del año.
    const totalPendiente = filas.reduce((a, f) => a + Math.max(0, f.saldo), 0);

    const exportar = async () => {
        if (!filas.length) { notify.error('No hay nada para exportar.'); return; }
        const XLSX = await import('xlsx');
        const ws = XLSX.utils.json_to_sheet(filas.map(f => ({
            Legajo: f.legajo || '',
            Operario: f.nombre,
            'Fecha de ingreso': fmtFecha(f.fecha_ingreso),
            Antigüedad: f.anios,
            Corresponden: f.dias, Usó: f.usados, 'Le quedan': f.saldo,
            Servicio: f.servicio || '',
        })));
        ws['!cols'] = [{ wch: 9 }, { wch: 34 }, { wch: 15 }, { wch: 11 }, { wch: 13 }, { wch: 7 }, { wch: 11 }, { wch: 32 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Vacaciones');
        downloadWorkbook(XLSX, wb, `Vacaciones_${data.anio}.xlsx`);
    };

    return (
        <MainLayout>
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                <header style={{ marginBottom: '1.25rem' }}>
                    <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Vacaciones por antigüedad</h1>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                        Cuántos días le corresponden a cada uno, contando la antigüedad al{' '}
                        <strong>31 de diciembre de {data?.anio || anio}</strong>.
                    </p>
                </header>

                {error && <div className="card" style={{ padding: '1.25rem', color: 'var(--error)' }}>{error}</div>}
                {loading && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Calculando…</div>}

                {!loading && !error && data && (
                    <>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                            {[28, 21].map(d => (
                                <div key={d} className="card" style={{ padding: '0.9rem 1.15rem', flex: '1 1 150px' }}>
                                    <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1, color: COLOR_TRAMO[d] }}>
                                        {data.porTramo[d] || 0}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                        con {d} días
                                        <span style={{ display: 'block', fontSize: '0.72rem' }}>
                                            {d === 28 ? '10 años o más' : '5 a 9 años'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            <div className="card" style={{ padding: '0.9rem 1.15rem', flex: '1 1 150px' }}>
                                <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1 }}>
                                    {(data.porTramo[28] || 0) + (data.porTramo[21] || 0)}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                    personas a planificar
                                    <span style={{ display: 'block', fontSize: '0.72rem' }}>sobre {data.activos} activos</span>
                                </div>
                            </div>
                            <div className="card" style={{ padding: '0.9rem 1.15rem', flex: '1 1 150px' }}>
                                <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1, color: '#15803D' }}>{totalPendiente}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                    días pendientes
                                    <span style={{ display: 'block', fontSize: '0.72rem' }}>todavía sin otorgar</span>
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: '0.85rem 1.1rem', marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <input
                                type="text"
                                value={busqueda}
                                onChange={e => setBusqueda(e.target.value)}
                                placeholder="Buscar por nombre, legajo o servicio…"
                                style={{ flex: 1, minWidth: '180px', padding: '0.45rem 0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--color-surface)', color: 'var(--text-main)' }}
                            />
                            <button className="btn btn-secondary" style={{ fontSize: '0.85rem' }} onClick={exportar}>
                                Excel
                            </button>
                        </div>

                        <div className="card" style={{ padding: 0 }}>
                            <div className="table-container">
                                <table className="mobile-cards-table">
                                    <thead>
                                        <tr>
                                            {[
                                                { col: 'nombre', label: 'Operario' },
                                                { col: 'fecha_ingreso', label: 'Ingreso' },
                                                { col: 'anios', label: 'Antigüedad', der: true },
                                                { col: 'dias', label: 'Corresponden', der: true },
                                                { col: 'usados', label: 'Usó', der: true },
                                                { col: 'saldo', label: 'Le quedan', der: true },
                                                { col: 'servicio', label: 'Servicio' },
                                            ].map(h => (
                                                <th
                                                    key={h.col}
                                                    onClick={() => ordenarPor(h.col)}
                                                    title="Ordenar por esta columna"
                                                    style={{ textAlign: h.der ? 'right' : 'left', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                                                >
                                                    {h.label}
                                                    <span style={{ marginLeft: '0.3rem', opacity: orden.col === h.col ? 1 : 0.25 }}>
                                                        {orden.col === h.col ? (orden.desc ? '▼' : '▲') : '▽'}
                                                    </span>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filas.map(f => (
                                            <tr key={f.employee_id} onClick={() => router.push(`/vacaciones/${f.employee_id}`)} style={{ cursor: "pointer" }} title="Ver el detalle y cargar días">
                                                <td data-label="Operario">
                                                    {f.nombre}
                                                    {f.legajo && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> · leg {f.legajo}</span>}
                                                    {/* Quien cambia de tramo este año: hoy le tocan
                                                        menos días de los que va a tener en diciembre. */}
                                                    {f.sube_este_anio && (
                                                        <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', fontWeight: 700, color: '#B45309', background: 'rgba(180,83,9,0.12)', padding: '0.1rem 0.4rem', borderRadius: '999px' }}>
                                                            sube este año
                                                        </span>
                                                    )}
                                                </td>
                                                <td data-label="Ingreso" style={{ whiteSpace: 'nowrap' }}>{fmtFecha(f.fecha_ingreso)}</td>
                                                <td data-label="Antigüedad" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                    {f.anios} año{f.anios === 1 ? '' : 's'}
                                                </td>
                                                <td data-label="Corresponden" style={{ textAlign: 'right', fontWeight: 700, color: COLOR_TRAMO[f.dias], fontVariantNumeric: 'tabular-nums' }}>
                                                    {f.dias}
                                                    {f.arrastre > 0 && (
                                                        <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.78rem' }}>
                                                            {' '}+{f.arrastre}
                                                        </span>
                                                    )}
                                                </td>
                                                <td data-label="Usó" style={{ textAlign: 'right', color: f.usados ? 'inherit' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                                    {f.usados || '—'}
                                                </td>
                                                {/* El número que se viene a mirar: rojo si quedó
                                                    negativo (se cargó de más), gris si ya usó todo. */}
                                                <td data-label="Le quedan" style={{
                                                    textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                                                    color: f.saldo < 0 ? 'var(--error)' : f.saldo === 0 ? 'var(--text-muted)' : '#15803D',
                                                }}>
                                                    {f.saldo}
                                                </td>
                                                <td data-label="Servicio" style={{ color: f.servicio ? 'inherit' : 'var(--text-muted)' }}>
                                                    {f.servicio || 'sin asignar'}
                                                </td>
                                            </tr>
                                        ))}
                                        {!filas.length && (
                                            <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                                                No hay nadie que cumpla ese filtro.
                                            </td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
                            Solo los de <strong>21 y 28 días</strong>, que son las ausencias largas a planificar.
                            La antigüedad se cuenta al 31 de diciembre (art. 150 LCT): 21 días de 5 a 9 años y 28 de
                            10 en adelante. Muestra lo que <strong>corresponde</strong>, no lo que ya se tomó.
                            {data.sinFecha?.length > 0 && (
                                <> Quedan afuera {data.sinFecha.length} sin fecha de ingreso cargada.</>
                            )}
                        </p>
                    </>
                )}
            </div>
        </MainLayout>
    );
}
