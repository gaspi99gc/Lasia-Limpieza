'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import FaltaModal from '@/components/FaltaModal';
import { getSessionUser } from '@/lib/session';
import { notify } from '@/lib/toast';

// Pantalla de faltas del día. Tiene UN solo propósito: registrar que alguien no
// vino y ver quiénes faltaron. Avisa el propio operario por teléfono, así que
// esto se usa a lo largo de todo el día y tiene que ser inmediato.
//
// A propósito no hay grilla, ni filtros, ni buscador, ni export: lo que no está
// no se puede confundir. La planificación se consulta en /operativo, que sigue
// mostrando el FALTÓ sobre la celda.

const todayAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const addDaysStr = (ymd, n) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fmtLargo = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return `${DIAS[dt.getUTCDay()]} ${d} de ${MESES[m - 1]}`;
};
const fmtHora = (h) => (h === null || h === undefined ? '' : String(Number(h)).replace('.', ','));

const MOTIVO_LABEL = {
    enfermedad: 'Enfermedad', personal: 'Tema personal', accidente: 'Accidente',
    sin_aviso: 'No avisó', sin_especificar: 'Sin motivo',
};
const MOTIVOS_EDIT = ['enfermedad', 'personal', 'accidente', 'sin_aviso', 'sin_especificar'];
const CAMPO_LABEL = { motivo: 'el motivo', horas: 'las horas', nota: 'la nota' };

// Un cambio contado como frase, para que se entienda de un vistazo.
const fraseCambio = (h) => {
    const valor = (v) => {
        if (v === null || v === '') return 'vacío';
        return h.campo === 'motivo' ? (MOTIVO_LABEL[v] || v) : v;
    };
    const cuando = new Date(h.created_at).toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    return `${h.usuario || 'Alguien'} cambió ${CAMPO_LABEL[h.campo] || h.campo} de “${valor(h.valor_anterior)}” a “${valor(h.valor_nuevo)}” · ${cuando}`;
};

// Solo operaciones carga y borra. Los demás roles miran.
const ROL_CARGA = 'operaciones';

export default function FaltasPage() {
    const [role, setRole] = useState(null);
    const [fecha, setFecha] = useState(todayAR);
    const [faltas, setFaltas] = useState([]);
    const [operativo, setOperativo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editando, setEditando] = useState(null);
    // Anuladas del día: van en una línea discreta al pie, no en la lista.
    const [anuladas, setAnuladas] = useState([]);

    // La sesión vive en el navegador: no se puede leer en el primer render.
    useEffect(() => { setRole(getSessionUser()?.role || null); }, []);

    const puedeCargar = role === ROL_CARGA;
    const esHoy = fecha === todayAR();

    const cargarAnuladas = useCallback(async (f) => {
        const a = await fetch(`/api/operativo/faltas?desde=${f}&hasta=${f}&anuladas=1`, { credentials: 'include' })
            .then(r => (r.ok ? r.json() : []))
            .catch(() => []);
        setAnuladas(Array.isArray(a) ? a : []);
    }, []);

    const cargar = useCallback(async (f) => {
        setLoading(true);
        setError('');
        try {
            // Un solo día: mucho más liviano que el rango de 30 del operativo.
            const [resOp, resFaltas] = await Promise.all([
                fetch(`/api/operativo?from=${f}&to=${f}`, { credentials: 'include' }),
                fetch(`/api/operativo/faltas?desde=${f}&hasta=${f}`, { credentials: 'include' }),
            ]);
            const op = await resOp.json().catch(() => ({}));
            if (!resOp.ok) { setError(op.error || 'No se pudo cargar el operativo del día.'); return; }
            setOperativo(op);
            const fl = await resFaltas.json().catch(() => []);
            setFaltas(Array.isArray(fl) ? fl : []);
            await cargarAnuladas(f);
        } catch {
            setError('Error de red. Probá recargar la página.');
        } finally {
            setLoading(false);
        }
    }, [cargarAnuladas]);

    useEffect(() => { cargar(fecha); }, [fecha, cargar]);

    // celdas[puesto_id][fecha], como lo espera el modal.
    const celdas = useMemo(() => {
        const map = {};
        for (const d of operativo?.dias || []) {
            (map[d.puesto_id] = map[d.puesto_id] || {})[d.fecha] = d;
        }
        return map;
    }, [operativo]);

    // Personas y turnos no son lo mismo: quien hace jornada partida y no viene
    // genera varios turnos pero es una sola persona.
    const resumen = useMemo(() => {
        const gente = new Set(faltas.map(f => (f.employee_id ? `e${f.employee_id}` : `n${f.nombre}`)));
        return {
            personas: gente.size,
            turnos: faltas.length,
            horas: faltas.reduce((a, f) => a + (Number(f.horas) || 0), 0),
        };
    }, [faltas]);

    const borrar = async (id) => {
        // Se avisa que queda registrada: si el botón dice borrar y en realidad
        // guarda, eso sí se siente traicionero cuando lo descubren. Una frase
        // neutra alcanza para que nadie pruebe si zafa.
        if (!confirm('¿Borrar esta falta?\n\nSale de la lista, pero queda registrada como anulada.')) return;
        const res = await fetch(`/api/operativo/faltas?id=${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) { notify.error('No se pudo borrar la falta.'); return; }
        setFaltas(prev => prev.filter(f => f.id !== id));
        cargarAnuladas(fecha);
    };

    const flecha = (dias, titulo) => (
        <button
            className="btn btn-secondary"
            onClick={() => setFecha(f => addDaysStr(f, dias))}
            title={titulo}
            style={{ padding: '0.45rem 0.8rem', fontSize: '1rem', lineHeight: 1 }}
        >
            {dias < 0 ? '←' : '→'}
        </button>
    );

    return (
        <MainLayout>
            <div style={{ maxWidth: '860px', margin: '0 auto' }}>
                {/* Fecha con flechas. Abre en hoy; las flechas sirven para cargar
                    algo que llegó tarde o revisar lo de ayer. */}
                <header style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                    {flecha(-1, 'Día anterior')}
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <h1 style={{ margin: 0, fontSize: '1.5rem', textTransform: 'capitalize' }}>{fmtLargo(fecha)}</h1>
                        <p style={{ margin: '0.15rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            {esHoy ? 'Hoy' : (
                                <button
                                    onClick={() => setFecha(todayAR())}
                                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-primary)', font: 'inherit', textDecoration: 'underline' }}
                                >
                                    Volver a hoy
                                </button>
                            )}
                        </p>
                    </div>
                    {flecha(1, 'Día siguiente')}
                    {/* Los reportes van en su propia pantalla: acá solo un enlace,
                        para que la de carga siga teniendo un único propósito. */}
                    <Link href="/faltas/reportes" className="btn btn-secondary">📊 Reportes</Link>
                    {puedeCargar && (
                        <button
                            className="btn btn-primary"
                            onClick={() => setShowModal(true)}
                            disabled={loading || !operativo}
                            style={{ padding: '0.7rem 1.4rem', fontSize: '1rem', fontWeight: 700 }}
                        >
                            ⚠ Registrar falta
                        </button>
                    )}
                </header>

                {error && (
                    <div className="card" style={{ padding: '1.25rem', color: 'var(--error)', marginBottom: '1rem' }}>{error}</div>
                )}

                {/* Resumen: lo que se mira de un vistazo para saber qué hay que cubrir. */}
                {!loading && faltas.length > 0 && (
                    <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1 }}>{resumen.personas}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{resumen.personas === 1 ? 'persona faltó' : 'personas faltaron'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1 }}>{resumen.turnos}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{resumen.turnos === 1 ? 'turno' : 'turnos'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1, color: '#B45309' }}>{fmtHora(resumen.horas)}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>horas sin cubrir</div>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>
                ) : faltas.length === 0 ? (
                    <div className="card" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>No se registraron faltas</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '0.3rem' }}>
                            {esHoy ? 'Hasta ahora vino todo el mundo.' : 'Ese día no quedó ninguna falta cargada.'}
                        </div>
                    </div>
                ) : (
                    <div className="card" style={{ padding: 0 }}>
                        {faltas.map((f, i) => (
                            <div
                                key={f.id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap',
                                    padding: '0.9rem 1.25rem',
                                    borderBottom: i < faltas.length - 1 ? '1px solid var(--border-color)' : 'none',
                                }}
                            >
                                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>{f.nombre}</div>
                                    <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {f.servicio}
                                    </div>
                                    {f.nota && (
                                        <div style={{ fontSize: '0.82rem', fontStyle: 'italic', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                            “{f.nota}”
                                        </div>
                                    )}
                                </div>
                                <span className="op-tag op-tag-warn" style={{ marginLeft: 0 }}>
                                    {MOTIVO_LABEL[f.motivo] || f.motivo}
                                </span>
                                {f.horas != null && (
                                    <span style={{ fontWeight: 700, fontSize: '1rem', minWidth: '3.5rem', textAlign: 'right' }}>
                                        {fmtHora(f.horas)} hs
                                    </span>
                                )}
                                {puedeCargar && (
                                    <>
                                        <button
                                            onClick={() => setEditando(f)}
                                            title="Corregir esta falta"
                                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontSize: '1rem', padding: '0.2rem 0.4rem' }}
                                        >
                                            ✎
                                        </button>
                                        <button
                                            onClick={() => borrar(f.id)}
                                            title="Borrar esta falta"
                                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: '1.05rem', padding: '0.2rem 0.4rem' }}
                                        >
                                            ✕
                                        </button>
                                    </>
                                )}

                                {/* El historial se muestra a TODOS los que ven faltas:
                                    que se vea es lo que desalienta el retoque silencioso. */}
                                {f.historial?.length > 0 && (
                                    <details style={{ flexBasis: '100%', marginTop: '0.35rem' }}>
                                        <summary style={{ cursor: 'pointer', fontSize: '0.76rem', color: '#B45309', fontWeight: 600 }}>
                                            ✎ Editada {f.historial.length === 1 ? 'una vez' : `${f.historial.length} veces`}
                                        </summary>
                                        <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                            {f.historial.map(h => <li key={h.id ?? `${h.campo}${h.created_at}`}>{fraseCambio(h)}</li>)}
                                        </ul>
                                    </details>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {faltas.length > 0 && faltas.some(f => f.registrado_por) && (
                    <p style={{ margin: '0.7rem 0.25rem 0', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                        Cargadas por {[...new Set(faltas.map(f => f.registrado_por).filter(Boolean))].join(', ')}.
                    </p>
                )}

                {/* Anuladas: una línea al pie, gris y chica. Que esté es lo que
                    hace el trabajo; no hace falta que grite. */}
                {anuladas.length > 0 && (
                    <details style={{ margin: '0.5rem 0.25rem 0' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                            {anuladas.length} {anuladas.length === 1 ? 'anulada' : 'anuladas'}
                        </summary>
                        <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                            {anuladas.map(a => (
                                <li key={a.id} style={{ marginBottom: '0.15rem' }}>
                                    <span style={{ textDecoration: 'line-through' }}>{a.nombre} · {a.servicio}</span>
                                    {a.horas != null && <> · {fmtHora(a.horas)} hs</>}
                                    {' — anulada por '}{a.anulada_por || 'alguien'}
                                    {a.anulada_at && ` el ${new Date(a.anulada_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                                </li>
                            ))}
                        </ul>
                    </details>
                )}

                {showModal && operativo && (
                    <FaltaModal
                        fecha={fecha}
                        puestos={operativo.puestos}
                        celdasPorPuesto={celdas}
                        onClose={() => setShowModal(false)}
                        onGuardada={() => cargar(fecha)}
                    />
                )}

                {editando && (
                    <EditarFaltaModal
                        falta={editando}
                        onClose={() => setEditando(null)}
                        onGuardada={() => cargar(fecha)}
                    />
                )}
            </div>
        </MainLayout>
    );
}

// Corregir una falta ya cargada. Solo motivo, horas y nota: si se cargó a la
// persona equivocada o un turno de más, se borra y se carga de nuevo, porque una
// falta de otra persona es en realidad otra falta.
function EditarFaltaModal({ falta, onClose, onGuardada }) {
    const [motivo, setMotivo] = useState(falta.motivo || 'sin_especificar');
    const [horas, setHoras] = useState(falta.horas ?? '');
    const [nota, setNota] = useState(falta.nota || '');
    const [guardando, setGuardando] = useState(false);

    const hayCambios =
        motivo !== falta.motivo ||
        String(horas) !== String(falta.horas ?? '') ||
        (nota || '') !== (falta.nota || '');

    const guardar = async () => {
        setGuardando(true);
        try {
            const res = await fetch(`/api/operativo/faltas?id=${falta.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ motivo, horas: horas === '' ? null : Number(horas), nota }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(json.error || 'No se pudo guardar la corrección.'); return; }
            notify.success(json.sinCambios ? 'No había nada que cambiar.' : 'Falta corregida.');
            onGuardada?.();
            onClose();
        } catch {
            notify.error('Error de red al guardar.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                <h2 style={{ marginBottom: '0.25rem' }}>Corregir falta</h2>
                <p style={{ margin: '0 0 1.25rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    <strong>{falta.nombre}</strong> · {falta.servicio}
                </p>

                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                    Motivo
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {MOTIVOS_EDIT.map(m => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => setMotivo(m)}
                            className={`btn ${motivo === m ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}
                        >
                            {MOTIVO_LABEL[m]}
                        </button>
                    ))}
                </div>

                <div style={{ marginTop: '1.1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>
                        Horas perdidas
                    </label>
                    <input
                        type="number" step="0.5" min="0" max="24"
                        value={horas}
                        onChange={e => setHoras(e.target.value)}
                        style={{ width: '140px' }}
                    />
                </div>

                <div style={{ marginTop: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>
                        Nota
                    </label>
                    <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
                </div>

                <p style={{ margin: '1rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    La corrección queda registrada con tu nombre y se ve en la lista.
                </p>

                <div className="config-modal-actions" style={{ marginTop: '1.25rem' }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                    <button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando || !hayCambios}>
                        {guardando ? 'Guardando…' : 'Guardar corrección'}
                    </button>
                </div>
            </div>
        </div>
    );
}
