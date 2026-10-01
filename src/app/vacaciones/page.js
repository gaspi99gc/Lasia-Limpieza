'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import VacacionesCarga from '@/components/VacacionesCarga';
import { downloadWorkbook } from '@/lib/xlsx-download';
import { matchesSearch } from '@/lib/search';
import { getSessionUser } from '@/lib/session';
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

// Los tres grupos en que se parte el plantel. No es solo un corte por número de
// días: cada uno es un problema distinto. Las largas hay que cubrirlas sí o sí,
// las de 14 son el grueso, y las proporcionales son gente que entró hace poco y
// se calcula con otra regla (art. 153).
//
// `filtra` es la única definición de cada grupo: la usan la tabla y las
// tarjetas. Tenerla en un solo lugar evita que el número de arriba diga una cosa
// y la lista de abajo muestre otra.
const GRUPOS = [
    {
        id: 'largas', titulo: '21 y 28 días', color: '#0369A1',
        filtra: f => !f.proporcional && f.dias >= 21,
    },
    {
        id: 'cortas', titulo: '14 días', color: '#4B5563',
        filtra: f => !f.proporcional && f.dias < 21,
    },
    {
        // No es "menos de 1 año": quien entró a mitad de año y trabajó la mitad
        // de los días hábiles ya cobra los 14 completos (art. 151). Acá caen
        // solo los que ingresaron después de julio, más o menos.
        id: 'proporcionales', titulo: 'Proporcionales', color: '#9333EA',
        filtra: f => f.proporcional,
    },
];

// Quién puede cargar movimientos. El mismo corte que hace el servidor: dirección
// consulta el saldo pero no lo modifica.
const ROLES_CARGA = ['admin', 'rrhh'];

export default function VacacionesPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const router = useRouter();
    const searchParams = useSearchParams();
    const anio = new Date().getFullYear();
    const [busqueda, setBusqueda] = useState('');
    const [role, setRole] = useState(null);
    useEffect(() => { setRole(getSessionUser()?.role || null); }, []);
    const puedeCargar = ROLES_CARGA.includes(role);

    // Qué se está mirando: los saldos o la pantalla de carga. Va en la URL para
    // que el link sea compartible, igual que /rrhh?tab=.
    const tab = searchParams.get('tab') === 'cargar' ? 'cargar' : 'saldos';
    const irATab = (t) => router.replace(t === 'cargar' ? '/vacaciones?tab=cargar' : '/vacaciones', { scroll: false });

    // Lo cargado en esta sesión, sin volver a pedirle los saldos al servidor.
    //
    // Recalcular los 338 empleados después de cada persona haría que cargar en
    // tanda sea insoportable. El delta se aplica recién con la respuesta OK del
    // servidor: mostrar un saldo que después no existe es peor que esperar.
    const [cargasLocales, setCargasLocales] = useState(() => new Map());
    const [calculadoA, setCalculadoA] = useState(null);

    const anotarCarga = useCallback((employeeId, dias) => {
        setCargasLocales(prev => {
            const siguiente = new Map(prev);
            siguiente.set(employeeId, (siguiente.get(employeeId) || 0) + dias);
            return siguiente;
        });
    }, []);
    // Qué tramo se está mirando. Arranca en 'largas' (21 y 28 días) porque son
    // las ausencias que hay que planificar y cubrir sí o sí; el resto está a un
    // clic para que el total cierre.
    const [tramo, setTramo] = useState('largas');
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
            // Lo que trae el servidor ya incluye lo que se cargó: el delta local
            // deja de hacer falta y sumarlo contaría dos veces.
            setCargasLocales(new Map());
            setCalculadoA(new Date());
        } catch {
            setError('Error de red.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { cargar(anio); }, [anio, cargar]);

    // Las filas del servidor con lo cargado en esta sesión ya descontado. TODO lo
    // que muestre saldos tiene que salir de acá —la tabla, los contadores, el
    // Excel y la pantalla de carga—, o alguno va a mostrar números viejos.
    const filasEfectivas = useMemo(() => {
        const todas = data?.filas || [];
        if (!cargasLocales.size) return todas;
        return todas.map(f => {
            const extra = cargasLocales.get(f.employee_id);
            if (!extra) return f;
            return { ...f, usados: f.usados + extra, saldo: f.saldo - extra };
        });
    }, [data, cargasLocales]);

    const filas = useMemo(() => {
        const grupo = GRUPOS.find(g => g.id === tramo);
        let f = grupo ? filasEfectivas.filter(grupo.filtra) : filasEfectivas;
        // matchesSearch y no includes(): busca las palabras en cualquier orden y
        // sin acentos, así "juana perez" encuentra a "PÉREZ JUANA".
        const q = busqueda.trim();
        if (q) f = f.filter(x => matchesSearch(q, [x.nombre, x.legajo, x.servicio]));

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
    }, [filasEfectivas, busqueda, orden, tramo]);

    // Tocar la misma columna invierte; cambiar de columna arranca en el orden
    // más útil para esa columna (los nombres de la A, los números de mayor a menor).
    const ordenarPor = (col) => {
        setOrden(prev => prev.col === col
            ? { col, desc: !prev.desc }
            : { col, desc: col === 'anios' || col === 'dias' });
    };

    // A cuánta gente todavía le falta que le den vacaciones. Es el número
    // accionable: son las personas a las que hay que agendarles algo antes de
    // que termine el año, y se cuenta en gente porque lo que se coordina es una
    // persona a la vez, no un día suelto.
    const adeudan = filas.filter(f => f.saldo > 0).length;

    // Cuánta gente hay en cada grupo, para el renglón de apoyo de la tarjeta.
    const resumen = useMemo(
        () => GRUPOS.map(g => ({ ...g, personas: filasEfectivas.filter(g.filtra).length })),
        [filasEfectivas]
    );

    const exportar = async () => {
        if (!filas.length) { notify.error('No hay nada para exportar.'); return; }
        const XLSX = await import('xlsx');
        const ws = XLSX.utils.json_to_sheet(filas.map(f => ({
            Legajo: f.legajo || '',
            Operario: f.nombre,
            'Fecha de ingreso': fmtFecha(f.fecha_ingreso),
            Antigüedad: f.anios,
            Corresponden: f.dias,
            // Para el proporcional se exporta la cuenta: quien revise la
            // planilla tiene que poder rehacerla sin volver a la app.
            Cómo: f.proporcional ? `${f.dias_habiles} hábiles ÷ 20 (art. 153)` : 'por antigüedad',
            Usó: f.usados, 'Le quedan': f.saldo,
            Servicio: f.servicio || '',
        })));
        ws['!cols'] = [{ wch: 9 }, { wch: 34 }, { wch: 15 }, { wch: 11 }, { wch: 13 }, { wch: 26 }, { wch: 7 }, { wch: 11 }, { wch: 32 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Vacaciones');
        const sufijo = GRUPOS.find(g => g.id === tramo)?.id || 'todos';
        downloadWorkbook(XLSX, wb, `Vacaciones_${data.anio}_${sufijo}.xlsx`);
    };

    return (
        <MainLayout>
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                <header style={{ marginBottom: '1rem' }}>
                    <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Vacaciones</h1>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                        {tab === 'cargar'
                            ? <>Cargá los días que cada uno se tomó o cobró del período <strong>{data?.anio || anio}</strong>.</>
                            : <>Cuántos días le corresponden a cada uno, contando la antigüedad al{' '}
                                <strong>31 de diciembre de {data?.anio || anio}</strong>.</>}
                    </p>
                </header>

                {/* Dos pestañas y no dos pantallas: así cambiar de una a otra no
                    vuelve a pedir el cálculo de los 338 empleados, y lo cargado
                    en esta sesión se ve reflejado de los dos lados. */}
                {puedeCargar && (
                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.1rem', borderBottom: '1px solid var(--border-color)' }}>
                        {[
                            { id: 'saldos', label: 'Días y saldos' },
                            { id: 'cargar', label: 'Cargar vacaciones' },
                        ].map(t => (
                            <button
                                key={t.id}
                                onClick={() => irATab(t.id)}
                                style={{
                                    font: 'inherit', cursor: 'pointer', background: 'none', border: 'none',
                                    padding: '0.5rem 0.9rem', fontSize: '0.9rem',
                                    fontWeight: tab === t.id ? 700 : 500,
                                    color: tab === t.id ? 'var(--text-main)' : 'var(--text-muted)',
                                    borderBottom: `2px solid ${tab === t.id ? 'var(--color-primary)' : 'transparent'}`,
                                    marginBottom: '-1px',
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                )}

                {error && <div className="card" style={{ padding: '1.25rem', color: 'var(--error)' }}>{error}</div>}
                {loading && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Calculando…</div>}

                {!loading && !error && data && tab === 'cargar' && puedeCargar && (
                    <>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {cargasLocales.size > 0 && (
                                <span><strong style={{ color: '#15803D' }}>{cargasLocales.size}</strong> cargadas en esta sesión</span>
                            )}
                            <button
                                className="btn btn-secondary"
                                style={{ marginLeft: 'auto', fontSize: '0.82rem' }}
                                onClick={() => cargar(anio)}
                                title="Vuelve a pedirle los saldos al servidor"
                            >
                                Recalcular
                            </button>
                            {calculadoA && (
                                <span style={{ fontSize: '0.78rem' }}>
                                    calculado a las {calculadoA.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                        </div>
                        <VacacionesCarga
                            filas={filasEfectivas}
                            periodo={data.anio}
                            cargadasAhora={cargasLocales.size}
                            onCargado={anotarCarga}
                        />
                    </>
                )}

                {!loading && !error && data && tab === 'saldos' && (
                    <>
                        {/* Las tarjetas son los filtros: se toca la que se
                            quiere mirar. Antes eran solo números y el recorte a
                            21+ estaba escondido en el código, así que no había
                            forma de ver a los demás. */}
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                            {resumen.map(g => {
                                const activo = tramo === g.id;
                                return (
                                    <button
                                        key={g.id}
                                        onClick={() => setTramo(g.id)}
                                        className="card"
                                        style={{
                                            padding: '0.9rem 1.15rem', flex: '1 1 170px', textAlign: 'left',
                                            cursor: 'pointer', font: 'inherit',
                                            border: `2px solid ${activo ? g.color : 'transparent'}`,
                                            opacity: activo ? 1 : 0.72,
                                        }}
                                    >
                                        {/* El tramo manda: la tarjeta dice ANTE TODO de
                                            qué grupo se trata. Cuánta gente lo compone es
                                            el dato de apoyo, no el titular. */}
                                        <div style={{ fontSize: '1.15rem', fontWeight: 800, lineHeight: 1.15, color: g.color }}>
                                            {g.titulo}
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                                            {g.personas} {g.personas === 1 ? 'persona' : 'personas'}
                                        </div>
                                    </button>
                                );
                            })}
                            {/* Separada del resto con un borde: las tres de la
                                izquierda son grupos que se pueden tocar para
                                filtrar; esta no se toca, y dice a cuántos del
                                grupo elegido todavía hay que darles vacaciones.
                                Sin el corte se leía como una cuarta categoría. */}
                            <div
                                className="card"
                                style={{
                                    padding: '0.9rem 1.15rem', flex: '1 1 170px',
                                    borderLeft: '3px solid #15803D', marginLeft: '0.35rem',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem', color: '#15803D' }}>
                                    <span style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1.15 }}>{adeudan}</span>
                                    <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                                        {adeudan === 1 ? 'persona' : 'personas'}
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                                    sin tomarse las vacaciones
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
                                                <td data-label="Corresponden" style={{ textAlign: 'right', fontWeight: 700, color: f.proporcional ? '#9333EA' : COLOR_TRAMO[f.dias], fontVariantNumeric: 'tabular-nums' }}>
                                                    {f.dias}
                                                    {f.arrastre > 0 && (
                                                        <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.78rem' }}>
                                                            {' '}+{f.arrastre}
                                                        </span>
                                                    )}
                                                    {/* De dónde salió el número: "6" solo no se
                                                        entiende cuando no viene de la escala. */}
                                                    {f.proporcional && (
                                                        <span style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.72rem' }}>
                                                            {f.dias_habiles} háb. ÷ 20
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

                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '1rem', lineHeight: 1.65 }}>
                            La antigüedad se cuenta al <strong>31 de diciembre</strong>, no al día de hoy (art. 150
                            LCT). La escala es 14 días de 1 a 4 años, 21 de 5 a 9, 28 de 10 a 19 y 35 de 20 en
                            adelante.
                            {tramo === 'proporcionales' && (
                                <>
                                    {' '}Quien <strong>trabajó la mitad de los días hábiles del año</strong> (unos 130,
                                    o sea entrar antes de julio) ya cobra los <strong>14 días completos</strong> aunque
                                    no haya cumplido el año: lo fija el art. 151 LCT. Los que aparecen acá entraron
                                    después de ese corte, así que les toca el <strong>proporcional</strong> del art.
                                    153: un día por cada 20 días hábiles trabajados. No se descuentan faltas; si hace
                                    falta ajustar un caso puntual, se carga un movimiento de tipo ajuste.
                                </>
                            )}
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
