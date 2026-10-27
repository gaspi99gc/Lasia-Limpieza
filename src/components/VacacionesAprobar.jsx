'use client';

import { useMemo, useState } from 'react';
import { notify } from '@/lib/toast';
import QuincenaSelect from './QuincenaSelect';
import QuincenasResumen from './QuincenasResumen';
import { describirPeriodo, fmtFecha, sumarDias } from '@/lib/quincenas-vacaciones';

// La bandeja de la jefa operativa: las vacaciones que cargó RRHH y esperan que
// alguien mire la cobertura del servicio.
//
// Cada pedido trae una 1ª y a veces una 2ª opción de quincena: no todos salen
// cuando lo pidieron. Para cada opción se ve quién más del mismo servicio está
// afuera en esas fechas, que es el dato para decidir. Si ninguna sirve, se le
// da otra quincena o se rechaza con el motivo.
//
// No cambia la cantidad de días: eso es de RRHH, y si hace falta otra cantidad
// se rechaza explicando por qué.
//
// Las que arrancan en menos de una semana van en rojo: son las que no pueden
// esperar a la próxima vez que entre.

const fmtCorto = (ymd) => fmtFecha(ymd).slice(0, 5);

const hoyAR = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

const diasHasta = (ymd) => Math.round((new Date(`${ymd}T12:00:00Z`) - new Date(`${hoyAR()}T12:00:00Z`)) / 86400000);

const inputEstilo = {
    padding: '0.45rem 0.6rem', borderRadius: '8px',
    border: '1px solid var(--border-color)', background: 'var(--color-surface)',
    color: 'var(--text-main)', fontSize: '0.88rem',
};

/**
 * @param {number}   periodo     año del período, para el resumen por quincena
 * @param {Array}    pendientes  movimientos en estado 'pendiente'
 * @param {Array}    vigentes    todos los 'tomado' vigentes (para ver quién más falta en el servicio)
 * @param {Array}    filas       filas de /api/vacaciones (servicio de cada uno)
 * @param {Array}    cobros      movimientos 'pagado' vigentes, para mostrar lo que cobra en la misma carga
 * @param {function} onResuelto  recibe el id del movimiento ya resuelto
 */
export default function VacacionesAprobar({ periodo, pendientes, vigentes, filas, cobros = [], onResuelto }) {
    // Qué tarjeta tiene abierto el "otra fecha" o el "rechazar", y con qué.
    const [abierta, setAbierta] = useState(null); // { id, modo: 'mover'|'rechazar' }
    const [fechaNueva, setFechaNueva] = useState('');
    const [motivo, setMotivo] = useState('');
    const [guardando, setGuardando] = useState(null);

    const porEmpleado = useMemo(() => new Map(filas.map(f => [f.employee_id, f])), [filas]);

    // Ordenadas por fecha de inicio: lo más urgente arriba.
    const lista = useMemo(
        () => [...pendientes].sort((a, b) => String(a.fecha_desde).localeCompare(String(b.fecha_desde))),
        [pendientes]
    );

    // Quién más del mismo servicio está afuera entre esas fechas.
    const superpuestos = (m, desde, hasta) => {
        const servicio = porEmpleado.get(m.employee_id)?.servicio;
        if (!servicio || !desde || !hasta) return [];
        return vigentes.filter(o =>
            o.id !== m.id
            && o.employee_id !== m.employee_id
            && porEmpleado.get(o.employee_id)?.servicio === servicio
            && o.fecha_desde <= hasta && o.fecha_hasta >= desde
        );
    };

    const abrir = (id, modo) => {
        setAbierta({ id, modo });
        setFechaNueva('');
        setMotivo('');
    };

    const resolver = async (m, accion) => {
        if (guardando) return;
        if (accion === 'rechazar' && !motivo.trim()) { notify.error('Escribí el motivo del rechazo.'); return; }
        if (accion === 'mover' && !fechaNueva) { notify.error('Elegí la quincena.'); return; }
        setGuardando(m.id);
        try {
            const res = await fetch('/api/vacaciones/movimientos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    id: m.id,
                    accion,
                    fecha_desde: accion === 'mover' ? fechaNueva : undefined,
                    nota: accion === 'rechazar' ? motivo.trim() : undefined,
                }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(j.error || 'No se pudo guardar.'); return; }
            notify.success(
                accion === 'rechazar'
                    ? 'Rechazada. RRHH lo va a ver en su pantalla.'
                    : `Aprobada: ${describirPeriodo(j.fecha_desde, j.cantidad)}.`
            );
            setAbierta(null);
            onResuelto(m.id);
        } catch {
            notify.error('Error de red.');
        } finally {
            setGuardando(null);
        }
    };

    // Cuánta gente hay en cada quincena: arriba de todo, haya o no pendientes.
    const resumen = <QuincenasResumen periodo={periodo} movimientos={vigentes} />;

    if (!lista.length) {
        return (
            <>
            {resumen}
            <div className="card" style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✓</div>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    No hay vacaciones esperando aprobación
                </div>
                <div style={{ fontSize: '0.87rem', marginTop: '0.3rem' }}>
                    Cuando RRHH cargue nuevas, aparecen acá.
                </div>
            </div>
            </>
        );
    }

    // Una opción de quincena con su chequeo de cobertura.
    const renglonOpcion = (m, titulo, desde) => {
        const hasta = sumarDias(desde, m.cantidad);
        const otros = superpuestos(m, desde, hasta);
        const nombre = describirPeriodo(desde, m.cantidad);
        // Si no es una quincena del calendario, el nombre ya son las fechas:
        // repetirlas al lado no suma nada.
        const esQuincena = !nombre.includes(' al ');
        return (
            <div style={{ padding: '0.55rem 0.7rem', borderRadius: '8px', background: 'var(--color-muted-surface)' }}>
                <div style={{ fontSize: '0.88rem' }}>
                    <strong>{titulo}:</strong> {nombre}
                    {esQuincena && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            {' '}· {fmtFecha(desde)} al {fmtFecha(hasta)}
                        </span>
                    )}
                </div>
                <div style={{ fontSize: '0.8rem', marginTop: '0.2rem', color: otros.length ? '#B45309' : '#15803D' }}>
                    {otros.length
                        ? <>También de vacaciones en ese servicio:{' '}
                            {otros.map(o => `${o.nombre} (${fmtCorto(o.fecha_desde)}–${fmtCorto(o.fecha_hasta)}${o.estado === 'pendiente' ? ', sin aprobar' : ''})`).join(', ')}</>
                        : 'Nadie más de ese servicio está de vacaciones en esas fechas.'}
                </div>
            </div>
        );
    };

    return (
        <>
        {resumen}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {lista.map(m => {
                const persona = porEmpleado.get(m.employee_id);
                const faltan = diasHasta(m.fecha_desde);
                const urgente = faltan < 7;
                const modo = abierta?.id === m.id ? abierta.modo : null;
                const ocupado = guardando === m.id;
                // Lo que cobra se guarda aparte (no es ausencia y nace aprobado),
                // pero entra en el mismo envío que lo que se toma: misma persona
                // y misma hora de carga.
                const cobra = cobros
                    .filter(c => c.employee_id === m.employee_id && c.created_at === m.created_at)
                    .reduce((a, c) => a + (Number(c.cantidad) || 0), 0);
                return (
                    <div
                        key={m.id}
                        className="card"
                        style={{ padding: '1rem 1.1rem', borderLeft: `4px solid ${urgente ? 'var(--error)' : 'var(--border-color)'}` }}
                    >
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'baseline', marginBottom: '0.6rem' }}>
                            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>
                                    {m.nombre}
                                    {m.legajo && <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.82rem' }}> · leg {m.legajo}</span>}
                                </div>
                                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                    {persona?.servicio || 'sin servicio asignado'}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{m.cantidad} días</div>
                                {cobra > 0 && (
                                    <div style={{
                                        marginTop: '0.25rem', display: 'inline-block', fontSize: '0.8rem', fontWeight: 700,
                                        color: '#7C3AED', background: 'rgba(124,58,237,0.12)', padding: '0.15rem 0.55rem', borderRadius: '999px',
                                    }}>
                                        + cobra {cobra} días
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {renglonOpcion(m, '1ª opción', m.fecha_desde)}
                            {m.fecha_desde_opcion2 && renglonOpcion(m, '2ª opción', m.fecha_desde_opcion2)}
                        </div>

                        {m.nota && (
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.45rem' }}>
                                Nota de RRHH: {m.nota}
                            </div>
                        )}

                        {modo === 'mover' && (
                            <div style={{ marginTop: '0.75rem', maxWidth: '420px' }}>
                                <div style={{ fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                                    Otra quincena (se mantienen los {m.cantidad} días):
                                </div>
                                <QuincenaSelect periodo={m.periodo} value={fechaNueva} onChange={setFechaNueva} dias={m.cantidad} />
                                {fechaNueva && <div style={{ marginTop: '0.4rem' }}>{renglonOpcion(m, 'Nueva', fechaNueva)}</div>}
                            </div>
                        )}
                        {modo === 'rechazar' && (
                            <div style={{ marginTop: '0.75rem' }}>
                                <input
                                    type="text"
                                    autoFocus
                                    value={motivo}
                                    onChange={e => setMotivo(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') resolver(m, 'rechazar'); }}
                                    placeholder="Motivo (ej: no hay cobertura en ninguna de las dos)"
                                    style={{ ...inputEstilo, width: '100%' }}
                                />
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                            {!modo && (
                                <>
                                    <button className="btn btn-primary" disabled={ocupado} onClick={() => resolver(m, 'aprobar')}>
                                        {m.fecha_desde_opcion2 ? 'Aprobar 1ª opción' : 'Aprobar'}
                                    </button>
                                    {m.fecha_desde_opcion2 && (
                                        <button className="btn btn-primary" disabled={ocupado} onClick={() => resolver(m, 'aprobar_2')}>
                                            Aprobar 2ª opción
                                        </button>
                                    )}
                                    <button className="btn btn-secondary" disabled={ocupado} onClick={() => abrir(m.id, 'mover')}>
                                        Otra quincena
                                    </button>
                                    <button className="btn btn-secondary" disabled={ocupado} onClick={() => abrir(m.id, 'rechazar')} style={{ color: 'var(--error)' }}>
                                        Rechazar
                                    </button>
                                </>
                            )}
                            {modo === 'mover' && (
                                <button className="btn btn-primary" disabled={ocupado || !fechaNueva} onClick={() => resolver(m, 'mover')}>
                                    Aprobar con esta fecha
                                </button>
                            )}
                            {modo === 'rechazar' && (
                                <button className="btn btn-primary" disabled={ocupado} onClick={() => resolver(m, 'rechazar')} style={{ background: 'var(--error)' }}>
                                    Confirmar rechazo
                                </button>
                            )}
                            {modo && (
                                <button className="btn btn-secondary" disabled={ocupado} onClick={() => setAbierta(null)}>
                                    Volver
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
        </>
    );
}
