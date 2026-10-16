'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import VacacionMovimientoModal from '@/components/VacacionMovimientoModal';
import { getSessionUser } from '@/lib/session';
import { notify } from '@/lib/toast';
import { periodoVigente } from '@/lib/quincenas-vacaciones';

// Detalle de vacaciones de una persona: el saldo explicado y qué movimientos lo
// componen. Es la pantalla que se abre cuando alguien discute un número.

const ROLES_CARGA = ['admin', 'rrhh'];

const fmt = (ymd) => {
    if (!ymd) return '—';
    const [a, m, d] = String(ymd).slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
};

const ETIQUETA_TIPO = {
    tomado: { label: 'Se las tomó', color: '#0369A1' },
    pagado: { label: 'Las cobró', color: '#7C3AED' },
    ajuste: { label: 'Ajuste', color: '#B45309' },
};

export default function VacacionDetallePage() {
    const { id } = useParams();
    const router = useRouter();
    // El período que corre: en enero se siguen tomando las del año anterior.
    const anio = periodoVigente();

    const [role, setRole] = useState(null);
    const [persona, setPersona] = useState(null);
    const [movimientos, setMovimientos] = useState([]);
    const [anulados, setAnulados] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [modal, setModal] = useState(false);

    useEffect(() => { setRole(getSessionUser()?.role || null); }, []);
    const puedeCargar = ROLES_CARGA.includes(role);

    const cargar = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [resVac, resMov, resAnu] = await Promise.all([
                fetch(`/api/vacaciones?anio=${anio}`, { credentials: 'include' }),
                fetch(`/api/vacaciones/movimientos?empleado_id=${id}&periodo=${anio}`, { credentials: 'include' }),
                fetch(`/api/vacaciones/movimientos?empleado_id=${id}&periodo=${anio}&anulados=1`, { credentials: 'include' }),
            ]);
            const vac = await resVac.json().catch(() => ({}));
            if (!resVac.ok) { setError(vac.error || 'No se pudo cargar.'); return; }

            const p = (vac.filas || []).find(f => String(f.employee_id) === String(id));
            if (!p) { setError('No se encontró a esa persona entre los activos.'); return; }
            setPersona(p);

            const mov = await resMov.json().catch(() => []);
            setMovimientos(Array.isArray(mov) ? mov : []);
            const anu = await resAnu.json().catch(() => []);
            // Al pie van los que no cuentan: los anulados por RRHH y los que
            // rechazó la jefa operativa.
            setAnulados(Array.isArray(anu) ? anu.filter(m => m.anulado_at || m.estado === 'rechazado') : []);
        } catch {
            setError('Error de red.');
        } finally {
            setLoading(false);
        }
    }, [id, anio]);

    useEffect(() => { cargar(); }, [cargar]);

    const anular = async (m) => {
        if (!confirm(`¿Anular estos ${m.cantidad} días?\n\nSale del cálculo, pero queda registrado como anulado.`)) return;
        try {
            const res = await fetch(`/api/vacaciones/movimientos?id=${m.id}`, {
                method: 'DELETE', credentials: 'include',
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(j.error || 'No se pudo anular.'); return; }
            notify.success('Movimiento anulado.');
            cargar();
        } catch {
            notify.error('Error de red.');
        }
    };

    return (
        <MainLayout>
            <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                <button
                    className="btn btn-secondary"
                    style={{ marginBottom: '1rem' }}
                    onClick={() => router.push('/vacaciones')}
                >
                    ← Volver
                </button>

                {error && <div className="card" style={{ padding: '1.25rem', color: 'var(--error)' }}>{error}</div>}
                {loading && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>}

                {!loading && !error && persona && (
                    <>
                        <header style={{ marginBottom: '1.25rem' }}>
                            <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{persona.nombre}</h1>
                            <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                                {persona.legajo && <>Legajo {persona.legajo} · </>}
                                Ingresó el {fmt(persona.fecha_ingreso)} · {persona.anios} años de antigüedad
                            </p>
                        </header>

                        {/* El cálculo escrito como una frase: es lo que hay que poder
                            mostrarle a alguien que pregunta por qué le quedan X días. */}
                        <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap', fontSize: '1.05rem' }}>
                                <span><strong>{persona.dias}</strong> le corresponden</span>
                                {persona.arrastre > 0 && <span>+ <strong>{persona.arrastre}</strong> del año anterior</span>}
                                <span>− <strong>{persona.usados}</strong> que usó</span>
                                <span>=</span>
                                <span style={{
                                    fontSize: '1.6rem', fontWeight: 800,
                                    color: persona.saldo < 0 ? 'var(--error)' : persona.saldo === 0 ? 'var(--text-muted)' : '#15803D',
                                }}>
                                    {persona.saldo} días
                                </span>
                            </div>
                            {/* De dónde sale el número cuando no viene de la escala.
                                Es exactamente acá donde alguien pregunta "¿por qué
                                tengo 6 y no 14?". */}
                            {persona.proporcional && (
                                <p style={{ margin: '0.5rem 0 0', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                                    Desde que ingresó hasta el 31/12 trabajó{' '}
                                    <strong>{persona.dias_habiles} días hábiles</strong>, menos de la mitad del año,
                                    así que todavía no llega a los 14 días completos del art. 151 LCT. Le corresponde
                                    el <strong>proporcional</strong> del art. 153: un día cada 20 hábiles ={' '}
                                    <strong>{persona.dias} días</strong>. Al pasar los ~130 días hábiles le van a
                                    corresponder los 14 enteros.
                                </p>
                            )}
                            {persona.saldo < 0 && (
                                <p style={{ margin: '0.5rem 0 0', fontSize: '0.83rem', color: 'var(--error)' }}>
                                    Quedó en negativo: se cargaron más días de los que le corresponden. Revisá los
                                    movimientos de abajo.
                                </p>
                            )}
                            {puedeCargar && (
                                <button
                                    className="btn btn-primary"
                                    style={{ marginTop: '0.9rem' }}
                                    onClick={() => setModal(true)}
                                >
                                    + Cargar días
                                </button>
                            )}
                        </div>

                        <div className="card" style={{ padding: 0 }}>
                            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
                                <h3 style={{ margin: 0, fontSize: '1rem' }}>Movimientos de {anio}</h3>
                            </div>
                            <div className="table-container">
                                <table className="mobile-cards-table">
                                    <thead>
                                        <tr>
                                            <th>Qué</th>
                                            <th>Cuándo</th>
                                            <th style={{ textAlign: 'right' }}>Días</th>
                                            <th>Nota</th>
                                            {puedeCargar && <th></th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {movimientos.map(m => {
                                            const t = ETIQUETA_TIPO[m.tipo] || { label: m.tipo, color: 'var(--text-muted)' };
                                            return (
                                                <tr key={m.id}>
                                                    <td data-label="Qué">
                                                        <span style={{ color: t.color, fontWeight: 700, fontSize: '0.88rem' }}>{t.label}</span>
                                                        {m.estado === 'pendiente' && (
                                                            <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#B45309' }}>
                                                                esperando aprobación
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td data-label="Cuándo" style={{ whiteSpace: 'nowrap', fontSize: '0.88rem' }}>
                                                        {m.fecha_desde
                                                            ? <>{fmt(m.fecha_desde)} al {fmt(m.fecha_hasta)}</>
                                                            : <span style={{ color: 'var(--text-muted)' }}>sin fechas</span>}
                                                        {m.fecha_desde_original ? (
                                                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                {m.fecha_desde === m.fecha_desde_opcion2 ? 'salió en su 2ª opción' : 'le dieron otra fecha'}
                                                                {' '}· había pedido el {fmt(m.fecha_desde_original)}
                                                            </span>
                                                        ) : m.estado === 'pendiente' && m.fecha_desde_opcion2 && (
                                                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                2ª opción: desde el {fmt(m.fecha_desde_opcion2)}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td data-label="Días" style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                                        {m.cantidad}
                                                    </td>
                                                    <td data-label="Nota" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                        {m.nota || '—'}
                                                        {m.registrado_por && (
                                                            <span style={{ display: 'block', fontSize: '0.75rem' }}>
                                                                cargó {m.registrado_por}
                                                            </span>
                                                        )}
                                                        {m.estado === 'aprobado' && m.resuelto_por && (
                                                            <span style={{ display: 'block', fontSize: '0.75rem' }}>
                                                                aprobó {m.resuelto_por}
                                                                {m.resuelto_nota && <> — {m.resuelto_nota}</>}
                                                            </span>
                                                        )}
                                                    </td>
                                                    {puedeCargar && (
                                                        <td data-label="" style={{ textAlign: 'right' }}>
                                                            <button
                                                                onClick={() => anular(m)}
                                                                title="Anular"
                                                                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem' }}
                                                            >
                                                                ✕
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                        {!movimientos.length && (
                                            <tr>
                                                <td colSpan={puedeCargar ? 5 : 4} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                                                    Todavía no usó días este año.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Los anulados al pie y en gris: quedan a la vista para poder
                                reconstruir el saldo, sin mezclarse con lo vigente. */}
                            {anulados.length > 0 && (
                                <div style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border-color)' }}>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.4rem' }}>
                                        {anulados.length} que no cuenta{anulados.length === 1 ? '' : 'n'} (anulados o rechazados)
                                    </div>
                                    {anulados.map(m => (
                                        <div key={m.id} style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            <span style={{ textDecoration: 'line-through' }}>
                                                {ETIQUETA_TIPO[m.tipo]?.label || m.tipo} · {m.cantidad} días
                                                {m.fecha_desde && <> · {fmt(m.fecha_desde)}</>}
                                            </span>
                                            {m.anulado_at
                                                ? m.anulado_por && <> — anuló {m.anulado_por}</>
                                                : <> — <span style={{ color: 'var(--error)' }}>rechazó {m.resuelto_por || 'la jefa operativa'}</span>
                                                    {m.resuelto_nota && <>: “{m.resuelto_nota}”</>}</>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {modal && persona && (
                <VacacionMovimientoModal
                    persona={persona}
                    periodo={anio}
                    saldoActual={persona.saldo}
                    onClose={() => setModal(false)}
                    onGuardado={cargar}
                />
            )}
        </MainLayout>
    );
}
