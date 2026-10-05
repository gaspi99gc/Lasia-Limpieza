'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { matchesSearch } from '@/lib/search';
import VacacionFormulario from './VacacionFormulario';

// Cargar las vacaciones de todo el plantel.
//
// Son 338 personas y al empezar no había ninguna cargada. El problema no era el
// formulario sino el camino hasta él: había que ir a la lista, buscar, entrar al
// legajo (que recalcula los 338), abrir el modal, cargar, y el modal se cerraba
// y había que volver a empezar. Ocho pasos y dos navegaciones por persona.
//
// Acá las dos mitades conviven: a la izquierda quién falta, a la derecha el
// formulario. Elegir a alguien no navega a ningún lado, así que cargar al
// siguiente son dos clics.
//
// NO hace ningún fetch propio: recibe las filas ya calculadas de la pantalla
// madre. Volver a pedirlas sería recalcular los 338 empleados a cada rato.

const fmtFecha = (ymd) => {
    if (!ymd) return '—';
    const [a, m, d] = String(ymd).slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
};

export default function VacacionesCarga({ filas, periodo, cargadasAhora, onCargado }) {
    const [elegidaId, setElegidaId] = useState(null);
    const [busqueda, setBusqueda] = useState('');
    const [verCargadas, setVerCargadas] = useState(false);
    // Lo que se acaba de guardar. Mientras está, el formulario se reemplaza por
    // la confirmación: se ve qué quedó cargado antes de pasar al siguiente.
    const [recien, setRecien] = useState(null);
    const buscadorRef = useRef(null);

    // Quién falta y quién ya tiene algo. Se excluye a quien no tiene días que
    // cargar (proporcionales que todavía no generaron ninguno): contarlos como
    // "pendientes" haría que el número nunca llegue a cero.
    const { pendientes, cargadas } = useMemo(() => {
        const conDias = filas.filter(f => (f.dias + f.arrastre) > 0);
        return {
            pendientes: conDias.filter(f => !f.usados),
            cargadas: conDias.filter(f => f.usados > 0),
        };
    }, [filas]);

    // matchesSearch y no includes(): busca las palabras en cualquier orden y sin
    // acentos, así "juana perez" encuentra a "PÉREZ JUANA".
    const pendientesVisibles = useMemo(() => {
        const q = busqueda.trim();
        if (!q) return pendientes;
        return pendientes.filter(f => matchesSearch(q, [f.nombre, f.legajo, f.servicio]));
    }, [pendientes, busqueda]);

    const cargadasVisibles = useMemo(() => {
        const q = busqueda.trim();
        if (!q) return cargadas;
        return cargadas.filter(f => matchesSearch(q, [f.nombre, f.legajo, f.servicio]));
    }, [cargadas, busqueda]);

    const elegida = useMemo(
        () => filas.find(f => f.employee_id === elegidaId) || null,
        [filas, elegidaId]
    );

    const elegir = (f) => {
        setRecien(null);
        setElegidaId(f.employee_id);
    };

    const siguiente = () => {
        setRecien(null);
        setElegidaId(null);
        setBusqueda('');
        buscadorRef.current?.focus();
    };

    const filaPersona = (f) => {
        const activa = f.employee_id === elegidaId;
        return (
            <button
                key={f.employee_id}
                onClick={() => elegir(f)}
                style={{
                    width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.45rem 0.6rem', borderRadius: '8px',
                    border: `1px solid ${activa ? 'var(--color-primary)' : 'transparent'}`,
                    background: activa ? 'var(--color-muted-surface)' : 'transparent',
                }}
            >
                <span style={{ flex: 1, minWidth: 0, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.nombre}
                </span>
                {f.usados > 0 && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>usó {f.usados}</span>
                )}
                <span style={{
                    fontSize: '0.82rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                    color: f.saldo < 0 ? 'var(--error)' : f.saldo === 0 ? 'var(--text-muted)' : '#15803D',
                }}>
                    {f.saldo}
                </span>
            </button>
        );
    };

    return (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* IZQUIERDA: a quién falta. Es el progreso y el selector a la vez. */}
            <div className="card" style={{ flex: '1 1 280px', maxWidth: '360px', padding: '0.85rem', alignSelf: 'stretch' }}>
                <input
                    ref={buscadorRef}
                    type="text"
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder="🔍 Buscar persona…"
                    style={{
                        width: '100%', padding: '0.45rem 0.6rem', borderRadius: '8px',
                        border: '1px solid var(--border-color)', background: 'var(--color-surface)',
                        color: 'var(--text-main)', marginBottom: '0.75rem',
                    }}
                />

                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                    Sin cargar ({pendientes.length})
                </div>
                <div style={{ maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                    {pendientesVisibles.map(filaPersona)}
                    {!pendientesVisibles.length && (
                        <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', padding: '0.75rem 0.25rem', margin: 0 }}>
                            {busqueda
                                ? 'Nadie sin cargar coincide con la búsqueda.'
                                : '¡Listo! Todos tienen vacaciones cargadas.'}
                        </p>
                    )}
                </div>

                {/* Las ya cargadas se pueden abrir: sirve para corregir o para
                    cargar un segundo tramo del año. */}
                <button
                    onClick={() => setVerCargadas(v => !v)}
                    style={{
                        width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer',
                        border: 'none', background: 'none', padding: '0.6rem 0 0.35rem',
                        fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)',
                    }}
                >
                    {verCargadas ? '▾' : '▸'} Ya cargadas ({cargadas.length})
                </button>
                {verCargadas && (
                    <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                        {cargadasVisibles.map(filaPersona)}
                        {!cargadasVisibles.length && (
                            <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', padding: '0.5rem 0.25rem', margin: 0 }}>
                                {busqueda ? 'Ninguna coincide.' : 'Todavía no cargaste a nadie.'}
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* DERECHA: el formulario, o la confirmación de lo que se cargó. */}
            <div className="card" style={{ flex: '2 1 380px', padding: '1.1rem' }}>
                {recien ? (
                    <>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#15803D', marginBottom: '0.3rem' }}>
                            ✓ Cargado
                        </div>
                        <p style={{ margin: '0 0 0.75rem', fontSize: '0.92rem' }}>
                            <strong>{recien.nombre}</strong>: {recien.detalle}.
                            {' '}Le quedan <strong>{recien.saldoDespues}</strong> días.
                        </p>
                        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button className="btn btn-primary" onClick={siguiente}>
                                Cargar otra persona
                            </button>
                            <Link
                                href={`/vacaciones/${recien.employee_id}`}
                                style={{ fontSize: '0.85rem', color: 'var(--color-primary)' }}
                            >
                                Ver el detalle
                            </Link>
                        </div>
                    </>
                ) : elegida ? (
                    <>
                        <div style={{ marginBottom: '0.9rem' }}>
                            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                                {elegida.nombre}
                                {elegida.legajo && (
                                    <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.85rem' }}>
                                        {' '}· leg {elegida.legajo}
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                Ingresó el {fmtFecha(elegida.fecha_ingreso)} ·{' '}
                                {elegida.dias} le corresponden
                                {elegida.arrastre > 0 && ` + ${elegida.arrastre} del año anterior`}
                                {elegida.usados > 0 && ` − ${elegida.usados} que usó`}
                                {' = '}
                                <strong style={{ color: elegida.saldo < 0 ? 'var(--error)' : 'var(--text-main)' }}>
                                    {elegida.saldo} días
                                </strong>
                            </div>
                            {/* Un segundo tramo en el año es legítimo, pero conviene
                                avisarlo: si fue sin querer, el saldo ya está descontado
                                y la cuenta de abajo arranca de un número más chico. */}
                            {elegida.usados > 0 && (
                                <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: '#B45309' }}>
                                    Ya tiene {elegida.usados} días cargados este año. Si es un segundo período está bien;
                                    si no, revisá el detalle antes de cargar.
                                </p>
                            )}
                        </div>

                        <VacacionFormulario
                            // La key fuerza un formulario nuevo al cambiar de persona:
                            // sin esto quedarían la fecha y la nota del anterior, que es
                            // el peor error posible acá.
                            key={elegida.employee_id}
                            persona={elegida}
                            periodo={periodo}
                            saldoActual={elegida.saldo}
                            autoFocus
                            onCancelar={() => setElegidaId(null)}
                            onGuardado={({ nTomados, nCobrados, total }) => {
                                const partes = [];
                                if (nTomados) partes.push(`${nTomados} tomados`);
                                if (nCobrados) partes.push(`${nCobrados} cobrados`);
                                setRecien({
                                    employee_id: elegida.employee_id,
                                    nombre: elegida.nombre,
                                    detalle: partes.join(' y '),
                                    saldoDespues: elegida.saldo - total,
                                });
                                onCargado(elegida.employee_id, total);
                            }}
                        />
                    </>
                ) : (
                    <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏖️</div>
                        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                            Elegí a quién cargarle las vacaciones
                        </div>
                        <div style={{ fontSize: '0.87rem', marginTop: '0.3rem' }}>
                            Buscala en la lista de la izquierda o escribí el apellido arriba.
                            {cargadasAhora > 0 && (
                                <> Llevás <strong>{cargadasAhora}</strong> cargadas en esta sesión.</>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
