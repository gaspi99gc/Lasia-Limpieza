'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { matchesSearch } from '@/lib/search';
import { downloadWorkbook } from '@/lib/xlsx-download';
import { notify } from '@/lib/toast';
import {
    quincenasConFin, describirPeriodo, fmtFecha, fmtConDia, vuelveEl, hoyAR,
} from '@/lib/quincenas-vacaciones';

// Las vacaciones ya aprobadas, una quincena por vez.
//
// Son ~300 personas en 9 quincenas: mezclar dos quincenas en la misma lista es
// la forma de confundirse. Por eso se ve una sola, y las fechas van UNA vez en
// el encabezado (todos los de la quincena salen y vuelven el mismo día). Una
// fila muestra fechas propias solo cuando NO coinciden con la quincena exacta,
// y en negrita: es justo lo que no se puede pasar por alto.
//
// Quien está afuera dos quincenas (28 días seguidos, o una fecha libre que
// cruza el corte) aparece en las dos: la pregunta es "quién falta esta
// quincena". El Excel, en cambio, tiene una fila por vacación.

const fmtCorto = (ymd) => fmtFecha(ymd).slice(0, 5);

const COLORES = {
    ambar: ['#B45309', 'rgba(180,83,9,0.14)'],
    azul: ['#0369A1', 'rgba(3,105,161,0.14)'],
    rojo: ['#DC2626', 'rgba(220,38,38,0.14)'],
    violeta: ['#7C3AED', 'rgba(124,58,237,0.14)'],
};

const marca = (texto, tono, key) => (
    <span key={key} style={{
        fontSize: '0.72rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: '999px',
        color: COLORES[tono][0], background: COLORES[tono][1], whiteSpace: 'nowrap',
    }}>
        {texto}
    </span>
);

export default function VacacionesAprobadas({ periodo }) {
    const router = useRouter();
    const [aprobadas, setAprobadas] = useState([]);
    const [pendientes, setPendientes] = useState([]);
    const [cobros, setCobros] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [elegida, setElegida] = useState(null);   // desde de la quincena, u 'otras'
    const [busqueda, setBusqueda] = useState('');

    const cargar = useCallback(async () => {
        try {
            const base = `/api/vacaciones/movimientos?tipo=tomado&periodo=${periodo}`;
            const [rA, rP, rC] = await Promise.all([
                fetch(`${base}&estado=aprobado`, { credentials: 'include' }),
                fetch(`${base}&estado=pendiente`, { credentials: 'include' }),
                fetch(`/api/vacaciones/movimientos?tipo=pagado&periodo=${periodo}`, { credentials: 'include' }),
            ]);
            const c = await rC.json().catch(() => null);
            setCobros(Array.isArray(c) ? c : []);
            const a = await rA.json().catch(() => null);
            const p = await rP.json().catch(() => null);
            if (!rA.ok || !Array.isArray(a)) { setError(a?.error || 'No se pudieron cargar las aprobadas.'); return; }
            setError('');
            // Sin fecha no hay dónde ubicarla; un tomado siempre la tiene.
            setAprobadas(a.filter(m => m.fecha_desde && m.fecha_hasta));
            setPendientes(Array.isArray(p) ? p.filter(m => m.fecha_desde) : []);
        } catch {
            setError('Error de red.');
        } finally {
            setCargando(false);
        }
    }, [periodo]);

    // Se vuelve a pedir al volver a la pestaña del navegador: la jefa puede
    // haber aprobado algo mientras tanto.
    useEffect(() => {
        cargar();
        const alVolver = () => { if (document.visibilityState === 'visible') cargar(); };
        document.addEventListener('visibilitychange', alVolver);
        return () => document.removeEventListener('visibilitychange', alVolver);
    }, [cargar]);

    const quincenas = useMemo(() => quincenasConFin(periodo), [periodo]);

    const tocaA = (m, q) => m.fecha_desde <= q.hasta && m.fecha_hasta >= q.desde;

    // Cada quincena con su gente. Lo que no toca ninguna va a "Otras fechas".
    const grupos = useMemo(() => {
        const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es')
            || String(a.legajo).localeCompare(String(b.legajo)) || a.fecha_desde.localeCompare(b.fecha_desde);
        const lista = quincenas.map(q => ({
            ...q,
            filas: aprobadas.filter(m => tocaA(m, q)).sort(porNombre),
            sinAprobar: pendientes.filter(m => m.fecha_hasta && tocaA(m, q)).length,
        }));
        const otras = aprobadas.filter(m => !quincenas.some(q => tocaA(m, q))).sort(porNombre);
        return { lista, otras };
    }, [quincenas, aprobadas, pendientes]);

    // Al abrir: la quincena en curso o la próxima. Si ya pasaron todas, la última.
    useEffect(() => {
        if (elegida || !quincenas.length) return;
        const hoy = hoyAR();
        setElegida((quincenas.find(q => q.hasta >= hoy) || quincenas[quincenas.length - 1]).desde);
    }, [elegida, quincenas]);

    const nombreQuincena = (desde) => quincenas.find(q => q.desde === desde)?.nombre;

    // "pidió 1° de diciembre": salió en otra fecha que la que pidió (2ª opción
    // o la movió la jefa). Para RRHH es lo mismo: hay que avisarle la nueva.
    const pidio = (m) => m.fecha_desde_original
        ? (nombreQuincena(m.fecha_desde_original) || fmtFecha(m.fecha_desde_original))
        : null;

    // Lo que cobra en la misma carga: se guarda aparte (no es ausencia), pero
    // entra en el mismo envío, así que comparte persona y hora de carga.
    const cobraCon = (m) => cobros
        .filter(c => c.employee_id === m.employee_id && c.created_at === m.created_at)
        .reduce((a, c) => a + (Number(c.cantidad) || 0), 0);

    // Las otras vacaciones aprobadas de la misma persona, para que dos filas
    // suyas en dos quincenas no parezcan un duplicado.
    const tambien = (m) => aprobadas
        .filter(o => o.employee_id === m.employee_id && o.id !== m.id)
        .map(o => describirPeriodo(o.fecha_desde, o.cantidad));

    // Las fechas de la fila, solo si no son exactamente las de la quincena.
    const fechasPropias = (m, q) => {
        if (q && m.fecha_desde === q.desde && m.fecha_hasta === q.hasta) return null;
        if (q && m.fecha_desde < q.desde) {
            return `sigue desde ${nombreQuincena(m.fecha_desde) || fmtFecha(m.fecha_desde)} · vuelve ${fmtConDia(vuelveEl(m.fecha_hasta))}`;
        }
        return `${fmtFecha(m.fecha_desde)} al ${fmtFecha(m.fecha_hasta)} · vuelve ${fmtConDia(vuelveEl(m.fecha_hasta))}`;
    };

    // Los que cobran días en vez de tomárselos. Para liquidación: no son una
    // ausencia, así que no caen en ninguna quincena, y sin esta lista había que
    // entrar al detalle de cada persona para saber a quién pagarle.
    // Si en la misma carga también se toma días, se muestra cuántos.
    const seTomaCon = (c) => {
        const t = [...aprobadas, ...pendientes].find(m => m.employee_id === c.employee_id && m.created_at === c.created_at);
        return t ? { dias: t.cantidad, sinAprobar: t.estado === 'pendiente' } : null;
    };
    const cobrosOrdenados = useMemo(
        () => [...cobros].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es')),
        [cobros]
    );
    const personasQueCobran = new Set(cobros.map(c => c.employee_id)).size;
    const diasQueSeCobran = cobros.reduce((a, c) => a + (Number(c.cantidad) || 0), 0);

    const q = busqueda.trim();
    const resultados = useMemo(() => {
        if (!q) return [];
        return aprobadas
            .filter(m => matchesSearch(q, [m.nombre, m.legajo, m.servicio]))
            .sort((a, b) => a.fecha_desde.localeCompare(b.fecha_desde) || a.nombre.localeCompare(b.nombre, 'es'));
    }, [aprobadas, q]);

    const exportar = async () => {
        if (!aprobadas.length && !cobros.length) { notify.error('Todavía no hay vacaciones aprobadas.'); return; }
        const XLSX = await import('xlsx');
        const filas = [...aprobadas]
            .sort((a, b) => a.fecha_desde.localeCompare(b.fecha_desde) || a.nombre.localeCompare(b.nombre, 'es'))
            .map(m => ({
                Quincena: describirPeriodo(m.fecha_desde, m.cantidad),
                Operario: m.nombre,
                Legajo: m.legajo || '',
                Servicio: m.servicio || '',
                Días: m.cantidad,
                Sale: fmtFecha(m.fecha_desde),
                Hasta: fmtFecha(m.fecha_hasta),
                Vuelve: fmtFecha(vuelveEl(m.fecha_hasta)),
                Cobra: cobraCon(m) || '',
                'Había pedido': pidio(m) || '',
                'De baja': m.de_baja ? 'Sí' : '',
            }));
        const ws = XLSX.utils.json_to_sheet(filas);
        ws['!cols'] = [{ wch: 30 }, { wch: 34 }, { wch: 8 }, { wch: 32 }, { wch: 6 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 7 }, { wch: 20 }, { wch: 8 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Aprobadas');
        // Hoja aparte para liquidación: a quién se le pagan días.
        const wsC = XLSX.utils.json_to_sheet(cobrosOrdenados.map(c => {
            const t = seTomaCon(c);
            return {
                Operario: c.nombre,
                Legajo: c.legajo || '',
                Servicio: c.servicio || '',
                'Días que cobra': c.cantidad,
                'Cuándo (nota)': c.nota || '',
                'Además se toma': t ? `${t.dias} días${t.sinAprobar ? ' (sin aprobar)' : ''}` : '',
                'Cargado el': fmtFecha(String(c.created_at).slice(0, 10)),
                'De baja': c.de_baja ? 'Sí' : '',
            };
        }));
        wsC['!cols'] = [{ wch: 34 }, { wch: 8 }, { wch: 32 }, { wch: 14 }, { wch: 40 }, { wch: 22 }, { wch: 11 }, { wch: 8 }];
        XLSX.utils.book_append_sheet(wb, wsC, 'Cobran');
        downloadWorkbook(XLSX, wb, `Vacaciones_aprobadas_${periodo}.xlsx`);
    };

    // Una fila. `q` es la quincena que se está mirando (null en la búsqueda).
    const fila = (m, quincena) => {
        const propias = fechasPropias(m, quincena);
        const otras = tambien(m);
        const pedido = pidio(m);
        const cobra = cobraCon(m);
        return (
            <tr
                key={`${m.id}-${quincena?.desde || 'b'}`}
                onClick={m.de_baja ? undefined : () => router.push(`/vacaciones/${m.employee_id}`)}
                style={{ cursor: m.de_baja ? 'default' : 'pointer' }}
            >
                {!quincena && (
                    <td data-label="Quincena" style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {describirPeriodo(m.fecha_desde, m.cantidad)}
                    </td>
                )}
                <td data-label="Operario" style={{ fontWeight: 700 }}>{m.nombre}</td>
                <td data-label="Legajo" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{m.legajo || '—'}</td>
                <td data-label="Servicio" style={{ color: m.servicio ? 'inherit' : 'var(--text-muted)' }}>
                    {m.servicio || 'sin servicio'}
                </td>
                <td data-label="" style={{ fontSize: '0.82rem' }}>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {quincena && propias && <strong>{propias}</strong>}
                        {cobra > 0 && marca(`cobra ${cobra} días`, 'violeta')}
                        {pedido && marca(`pidió ${pedido}`, 'ambar')}
                        {otras.map((t, i) => marca(`también ${t}`, 'azul', i))}
                        {m.de_baja && marca(`de baja${m.fecha_baja ? ` ${fmtCorto(m.fecha_baja)}` : ''}`, 'rojo')}
                    </div>
                </td>
            </tr>
        );
    };

    const tabla = (filas, quincena, vacio) => (
        <div className="card" style={{ padding: 0 }}>
            <div className="table-container">
                <table className="mobile-cards-table">
                    <thead>
                        <tr>
                            {!quincena && <th>Quincena</th>}
                            <th>Operario</th>
                            <th>Legajo</th>
                            <th>Servicio</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filas.map(m => fila(m, quincena))}
                        {!filas.length && (
                            <tr><td colSpan={quincena ? 4 : 5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                {vacio}
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    if (cargando) return <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>;
    if (error) return <div className="card" style={{ padding: '1.25rem', color: 'var(--error)' }}>{error}</div>;

    const actual = grupos.lista.find(g => g.desde === elegida);
    const verOtras = elegida === 'otras';
    const verCobran = elegida === 'cobran';

    const boton = (id, titulo, n, activo) => (
        <button
            key={id}
            onClick={() => { setElegida(id); setBusqueda(''); }}
            className="btn btn-secondary"
            style={{
                padding: '0.35rem 0.7rem', fontSize: '0.82rem', whiteSpace: 'nowrap',
                border: `1px solid ${activo ? 'var(--color-primary)' : 'var(--border-color)'}`,
                fontWeight: activo ? 700 : 500,
            }}
        >
            {titulo} · <strong>{n}</strong>
        </button>
    );

    return (
        <>
            <div className="card" style={{ padding: '0.85rem 1.1rem', marginBottom: '0.75rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
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

            <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.3rem', marginBottom: '0.9rem' }}>
                {grupos.lista.map(g => boton(g.desde, g.nombre, g.filas.length, !q && elegida === g.desde))}
                {grupos.otras.length > 0 && boton('otras', 'Otras fechas', grupos.otras.length, !q && verOtras)}
                {cobros.length > 0 && boton('cobran', 'Cobran', personasQueCobran, !q && verCobran)}
            </div>

            {q ? (
                tabla(resultados, null, 'Nadie aprobado coincide con la búsqueda.')
            ) : verCobran ? (
                <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Cobran</h2>
                        <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            <strong style={{ color: 'var(--text-main)' }}>{personasQueCobran}</strong> {personasQueCobran === 1 ? 'persona' : 'personas'}
                            {' · '}<strong style={{ color: 'var(--text-main)' }}>{diasQueSeCobran}</strong> días
                        </span>
                    </div>
                    <div className="card" style={{ padding: 0 }}>
                        <div className="table-container">
                            <table className="mobile-cards-table">
                                <thead>
                                    <tr>
                                        <th>Operario</th>
                                        <th>Legajo</th>
                                        <th>Servicio</th>
                                        <th style={{ textAlign: 'right' }}>Cobra</th>
                                        <th>Cuándo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cobrosOrdenados.map(c => {
                                        const t = seTomaCon(c);
                                        return (
                                            <tr
                                                key={c.id}
                                                onClick={c.de_baja ? undefined : () => router.push(`/vacaciones/${c.employee_id}`)}
                                                style={{ cursor: c.de_baja ? 'default' : 'pointer' }}
                                            >
                                                <td data-label="Operario" style={{ fontWeight: 700 }}>
                                                    {c.nombre}
                                                    {c.de_baja && <> {marca('de baja', 'rojo')}</>}
                                                </td>
                                                <td data-label="Legajo" style={{ fontVariantNumeric: 'tabular-nums' }}>{c.legajo || '—'}</td>
                                                <td data-label="Servicio" style={{ color: c.servicio ? 'inherit' : 'var(--text-muted)' }}>
                                                    {c.servicio || 'sin servicio'}
                                                </td>
                                                <td data-label="Cobra" style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                    {c.cantidad} días
                                                    {t && (
                                                        <span style={{ display: 'block', fontWeight: 400, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                            + se toma {t.dias}{t.sinAprobar ? ' (sin aprobar)' : ''}
                                                        </span>
                                                    )}
                                                </td>
                                                <td data-label="Cuándo" style={{ fontSize: '0.85rem', color: c.nota ? 'inherit' : 'var(--text-muted)' }}>
                                                    {c.nota || '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            ) : verOtras ? (
                tabla(grupos.otras, { desde: '', hasta: '' }, 'Nada fuera del calendario.')
            ) : actual ? (
                <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{actual.nombre}</h2>
                        <span style={{ fontSize: '0.92rem' }}>
                            {fmtConDia(actual.desde)} al {fmtConDia(actual.hasta)} · vuelven el <strong>{fmtConDia(vuelveEl(actual.hasta))}</strong>
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            <strong style={{ color: 'var(--text-main)' }}>{actual.filas.length}</strong> aprobadas
                            {actual.sinAprobar > 0 && (
                                <> · <strong style={{ color: '#B45309' }}>{actual.sinAprobar}</strong> sin aprobar</>
                            )}
                        </span>
                    </div>
                    {tabla(actual.filas, actual, `Nadie aprobado para ${actual.nombre}.`)}
                </>
            ) : (
                <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No hay calendario de quincenas cargado para {periodo}.
                </div>
            )}
        </>
    );
}
