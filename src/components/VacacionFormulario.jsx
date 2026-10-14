'use client';

import { useEffect, useMemo, useState } from 'react';
import { notify } from '@/lib/toast';
import QuincenaSelect from './QuincenaSelect';

// El formulario para cargar vacaciones, sin el modal alrededor.
//
// Está separado del modal porque se usa en dos lados: adentro de
// VacacionMovimientoModal (desde el legajo de una persona) y embebido en la
// pantalla de carga, donde se cargan muchas seguidas. Copiarlo en vez de
// compartirlo haría que el día que cambie la cuenta del saldo haya dos lugares
// para arreglar, y uno quede viejo.
//
// Los días que se toma y los que cobra van juntos: casi siempre es una mezcla
// —se toma dos semanas y cobra el resto—, así que pedir un movimiento por cada
// cosa obligaría a cargar dos veces a la misma persona.
//
// Los días tomados llevan fecha porque son una ausencia que hay que cubrir; los
// cobrados no, porque la persona sigue trabajando.

const inputEstilo = {
    padding: '0.5rem 0.65rem', borderRadius: '8px',
    border: '1px solid var(--border-color)', background: 'var(--color-surface)',
    color: 'var(--text-main)', fontSize: '0.9rem',
};

/**
 * @param {object}   persona        fila de /api/vacaciones (necesita employee_id)
 * @param {number}   periodo        año al que se imputan los días
 * @param {number}   saldoActual    días que le quedan antes de esta carga
 * @param {function} onGuardado     recibe { nTomados, nCobrados, total, movimientos }
 * @param {function} onCancelar     si viene, dibuja el botón Cancelar
 * @param {function} onGuardandoChange  para que el modal sepa si puede cerrarse
 * @param {boolean}  autoFocus      poner el foco en "días que se toma" al montar
 */
export default function VacacionFormulario({
    persona, periodo, saldoActual,
    onGuardado, onCancelar, onGuardandoChange, autoFocus = false,
}) {
    const [tomados, setTomados] = useState('14');
    const [cobrados, setCobrados] = useState('');
    const [desde, setDesde] = useState('');
    const [opcion2, setOpcion2] = useState('');
    const [nota, setNota] = useState('');
    const [guardando, setGuardando] = useState(false);

    // El modal de afuera no se puede cerrar con Escape mientras se guarda, y
    // para saberlo necesita que esto se lo cuente.
    useEffect(() => { onGuardandoChange?.(guardando); }, [guardando, onGuardandoChange]);

    const nTomados = Math.max(0, Math.trunc(Number(tomados)) || 0);
    const nCobrados = Math.max(0, Math.trunc(Number(cobrados)) || 0);
    const total = nTomados + nCobrados;
    const saldoDespues = saldoActual - total;

    const error = useMemo(() => {
        if (!total) return 'Poné cuántos días se toma o cuántos cobra.';
        if (nTomados > 0 && !desde) return 'Falta elegir la quincena (1ª opción).';
        if (nTomados > 0 && opcion2 && opcion2 === desde) return 'La 2ª opción es igual a la 1ª.';
        return null;
    }, [total, nTomados, desde, opcion2]);

    const guardar = async () => {
        if (error || guardando) return;
        setGuardando(true);
        try {
            // Se guardan como movimientos separados aunque se carguen juntos:
            // son cosas distintas (una es ausencia, la otra no) y el detalle
            // tiene que poder mostrarlas por separado.
            //
            // Van en UN solo request: antes se mandaban de a uno y si el primero
            // entraba y el segundo fallaba quedaba media carga, con el saldo
            // bajando a la mitad de lo que correspondía.
            const movimientos = [];
            if (nTomados > 0) {
                movimientos.push({
                    tipo: 'tomado', cantidad: nTomados, fecha_desde: desde,
                    fecha_desde_opcion2: opcion2 || null,
                });
            }
            if (nCobrados > 0) {
                movimientos.push({ tipo: 'pagado', cantidad: nCobrados, fecha_desde: null });
            }

            const res = await fetch('/api/vacaciones/movimientos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    employee_id: persona.employee_id,
                    periodo,
                    nota: nota.trim() || null,
                    movimientos,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(json.error || 'No se pudo guardar.'); return; }

            onGuardado?.({
                nTomados, nCobrados, total,
                movimientos: json.movimientos || (json.id ? [json] : []),
            });
        } catch {
            notify.error('Error de red al guardar.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <>
            {/* Los dos números juntos: casi siempre se toma unos días y cobra
                el resto, así que pedirlo en dos pasos sería cargar dos veces
                a la misma persona. */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 140px' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Días que se toma
                    </label>
                    <input
                        type="number"
                        min="0"
                        step="1"
                        autoFocus={autoFocus}
                        value={tomados}
                        onChange={(e) => setTomados(e.target.value)}
                        style={{ ...inputEstilo, width: '100%', textAlign: 'right', fontSize: '1.1rem', fontWeight: 700 }}
                    />
                    <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.35rem' }}>
                        {[7, 14, 21, 28].map(n => (
                            <button
                                key={n}
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', flex: 1 }}
                                onClick={() => setTomados(String(n))}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </div>
                <div style={{ flex: '1 1 140px' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Días que cobra
                    </label>
                    <input
                        type="number"
                        min="0"
                        step="1"
                        value={cobrados}
                        onChange={(e) => setCobrados(e.target.value)}
                        placeholder="0"
                        style={{ ...inputEstilo, width: '100%', textAlign: 'right', fontSize: '1.1rem', fontWeight: 700 }}
                    />
                    {/* El resto del saldo es lo que se suele cobrar. */}
                    {saldoActual - nTomados > 0 && (
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', marginTop: '0.35rem', width: '100%' }}
                            onClick={() => setCobrados(String(saldoActual - nTomados))}
                        >
                            el resto ({saldoActual - nTomados})
                        </button>
                    )}
                </div>
            </div>

            {/* Las vacaciones se dan de a quincenas. Se piden dos opciones porque
                no todos salen cuando lo pidieron: la jefa operativa aprueba la
                que cierre con la cobertura del servicio. */}
            {nTomados > 0 && (
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 220px' }}>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                            1ª opción
                        </label>
                        <QuincenaSelect
                            periodo={periodo} value={desde} dias={nTomados}
                            // Si la 1ª pasa a ser la que estaba de 2ª, la 2ª se vacía.
                            onChange={(v) => { setDesde(v); if (v && v === opcion2) setOpcion2(''); }}
                        />
                    </div>
                    <div style={{ flex: '1 1 220px' }}>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                            2ª opción (opcional)
                        </label>
                        <QuincenaSelect periodo={periodo} value={opcion2} onChange={setOpcion2} dias={nTomados} vacio="Sin 2ª opción" excluir={desde} />
                    </div>
                </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Nota (opcional)
                </label>
                <input
                    type="text"
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="Observación"
                    style={{ ...inputEstilo, width: '100%' }}
                />
            </div>

            {/* Cómo queda el saldo: se ve antes de guardar, no después. */}
            {total > 0 && (
                <div className="card" style={{ padding: '0.7rem 0.9rem', marginBottom: '1rem', background: 'var(--color-muted-surface)' }}>
                    <span style={{ fontSize: '0.85rem' }}>
                        {saldoActual} − {total} ({nTomados > 0 && `${nTomados} tomados`}
                        {nTomados > 0 && nCobrados > 0 && ' + '}
                        {nCobrados > 0 && `${nCobrados} cobrados`}) ={' '}
                        <strong style={{ color: saldoDespues < 0 ? 'var(--error)' : 'var(--text-main)' }}>
                            {saldoDespues} días
                        </strong>
                        {saldoDespues < 0 && (
                            <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}> · se pasa del saldo</span>
                        )}
                    </span>
                </div>
            )}

            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={guardar} disabled={guardando || !!error}>
                    {guardando ? 'Guardando…' : 'Guardar'}
                </button>
                {onCancelar && (
                    <button className="btn btn-secondary" onClick={onCancelar} disabled={guardando}>
                        Cancelar
                    </button>
                )}
                {error && total > 0 && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{error}</span>
                )}
            </div>
        </>
    );
}
