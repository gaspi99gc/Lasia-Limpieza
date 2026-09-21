'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
    const anio = new Date().getFullYear();
    // Por defecto solo los de 21 y 28: es lo que se pidió ver.
    const [soloLargas, setSoloLargas] = useState(true);
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
        let f = data?.filas || [];
        if (soloLargas) f = f.filter(x => x.dias >= 21);
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
    }, [data, soloLargas, busqueda, orden]);

    // Tocar la misma columna invierte; cambiar de columna arranca en el orden
    // más útil para esa columna (los nombres de la A, los números de mayor a menor).
    const ordenarPor = (col) => {
        setOrden(prev => prev.col === col
            ? { col, desc: !prev.desc }
            : { col, desc: col === 'anios' || col === 'dias' });
    };

    const totalDias = filas.reduce((a, f) => a + f.dias, 0);

    const exportar = async () => {
        if (!filas.length) { notify.error('No hay nada para exportar.'); return; }
        const XLSX = await import('xlsx');
        const ws = XLSX.utils.json_to_sheet(filas.map(f => ({
            Legajo: f.legajo || '',
            Operario: f.nombre,
            'Fecha de ingreso': fmtFecha(f.fecha_ingreso),
            Antigüedad: f.anios,
            'Días': f.dias,
            Servicio: f.servicio || '',
        })));
        ws['!cols'] = [{ wch: 9 }, { wch: 34 }, { wch: 15 }, { wch: 11 }, { wch: 7 }, { wch: 32 }];
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
                            {[28, 21, 14].map(d => (
                                <div key={d} className="card" style={{ padding: '0.9rem 1.15rem', flex: '1 1 150px' }}>
                                    <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1, color: COLOR_TRAMO[d] }}>
                                        {data.porTramo[d] || 0}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                        con {d} días
                                        <span style={{ display: 'block', fontSize: '0.72rem' }}>
                                            {d === 28 ? '10 años o más' : d === 21 ? '5 a 9 años' : '1 a 4 años'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            <div className="card" style={{ padding: '0.9rem 1.15rem', flex: '1 1 150px' }}>
                                <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1 }}>{totalDias}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                    días en total
                                    <span style={{ display: 'block', fontSize: '0.72rem' }}>de los que se están viendo</span>
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: '0.85rem 1.1rem', marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                                className={`btn ${soloLargas ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ fontSize: '0.85rem' }}
                                onClick={() => setSoloLargas(v => !v)}
                            >
                                {soloLargas ? 'Viendo 21 y 28 días' : 'Viendo a todos'}
                            </button>
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
                                                { col: 'dias', label: 'Días', der: true },
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
                                            <tr key={f.employee_id}>
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
                                                <td data-label="Días" style={{ textAlign: 'right', fontWeight: 800, color: COLOR_TRAMO[f.dias], fontVariantNumeric: 'tabular-nums' }}>
                                                    {f.dias}
                                                </td>
                                                <td data-label="Servicio" style={{ color: f.servicio ? 'inherit' : 'var(--text-muted)' }}>
                                                    {f.servicio || 'sin asignar'}
                                                </td>
                                            </tr>
                                        ))}
                                        {!filas.length && (
                                            <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                                                No hay nadie que cumpla ese filtro.
                                            </td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
                            Se calcula sobre los {data.activos} operarios activos, contando la antigüedad al 31 de
                            diciembre (art. 150 LCT): 14 días de 1 a 4 años, 21 de 5 a 9, 28 de 10 a 19 y 35 de 20 en
                            adelante. Muestra lo que <strong>corresponde</strong>, no lo que ya se tomó.
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
