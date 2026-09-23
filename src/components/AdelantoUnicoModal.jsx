'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { notify } from '@/lib/toast';
import { normalizeText } from '@/lib/search';
import { formatArgentinaDate } from '@/lib/datetime';

// Cargar un adelanto suelto, sin Excel.
//
// Los adelantos del mes entran por planilla, pero de vez en cuando se hace una
// excepción: alguien pide un adelanto fuera de la tanda. Armar un Excel de una
// fila para eso no tiene sentido, así que este modal carga la línea directo
// sobre la planilla del mes que se elija.
//
// El nombre se elige de la nómina y NO se escribe a mano: en las planillas ya
// cargadas los operarios figuran como "APELLIDO NOMBRE" en mayúsculas, y si una
// excepción quedara escrita de otra forma sería la misma persona con dos
// nombres distintos en el sistema.

const money = (n) => Number(n || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });

// Mismo formato con el que vienen los Excel de adelantos: "APELLIDO NOMBRE",
// mayúsculas y sin coma.
function nombrePlanilla(emp) {
    return `${emp.apellido || ''} ${emp.nombre || ''}`.replace(/\s+/g, ' ').trim().toUpperCase();
}

// El monto se tipea en un campo de TEXTO y no en uno numérico: un input
// type="number" no acepta ni el "$" ni los puntos de miles, y un adelanto de
// 300000 sin separadores se lee mal justo cuando importa no equivocarse de cero.
//
// Se guarda el texto crudo y se formatea al vuelo. El parseo acepta lo que
// alguien escribiría de verdad: "300000", "300.000", "$ 300.000", "300000,50".

// "$ 300.000,50" -> 300000.5   ·   vacío o basura -> NaN
function parseMonto(texto) {
    const limpio = String(texto ?? '').replace(/[^\d,]/g, '').replace(',', '.');
    if (limpio === '' || limpio === '.') return NaN;
    return Number(limpio);
}

// Formatea mientras se escribe, sin estorbar: sólo pone los puntos de miles en
// la parte entera y respeta los decimales tal cual se están tipeando (si se
// formatearan también, escribir "300000,5" borraría el 5 al pasar a "...,50").
function formatMientrasEscribe(texto) {
    const soloValidos = String(texto ?? '').replace(/[^\d,]/g, '');
    if (soloValidos === '') return '';
    const [entera, ...resto] = soloValidos.split(',');
    const decimales = resto.join('');   // una sola coma, aunque se tipeen dos
    const conPuntos = entera === '' ? '' : Number(entera).toLocaleString('es-AR');
    const cuerpo = resto.length ? `${conPuntos},${decimales}` : conPuntos;
    return `$ ${cuerpo}`;
}

export default function AdelantoUnicoModal({ planillas, onClose, onGuardado }) {
    const [sheetId, setSheetId] = useState(planillas[0]?.id ? String(planillas[0].id) : '');
    const [empleados, setEmpleados] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [elegido, setElegido] = useState(null);
    const [monto, setMonto] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [abierta, setAbierta] = useState(false);   // lista de sugerencias visible
    const cajaRef = useRef(null);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !guardando) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, guardando]);

    // Cerrar la lista al hacer clic afuera.
    useEffect(() => {
        const onClick = (e) => { if (cajaRef.current && !cajaRef.current.contains(e.target)) setAbierta(false); };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    useEffect(() => {
        let vivo = true;
        fetch('/api/employees', { credentials: 'include' })
            .then(r => (r.ok ? r.json() : []))
            .then(data => {
                if (!vivo) return;
                // Solo activos: un adelanto a alguien que ya no trabaja acá sería
                // un error de carga, no una excepción.
                setEmpleados((Array.isArray(data) ? data : []).filter(e => e.activo !== false));
            })
            .catch(() => {});
        return () => { vivo = false; };
    }, []);

    const sugerencias = useMemo(() => {
        const q = normalizeText(busqueda);
        if (!q) return [];
        return empleados
            .filter(e => normalizeText(`${e.apellido || ''} ${e.nombre || ''}`).includes(q)
                || normalizeText(`${e.nombre || ''} ${e.apellido || ''}`).includes(q))
            .slice(0, 8);
    }, [empleados, busqueda]);

    const planilla = planillas.find(p => String(p.id) === sheetId) || null;
    const nMonto = parseMonto(monto);
    const montoValido = Number.isFinite(nMonto) && nMonto > 0;

    const error = useMemo(() => {
        if (!planilla) return 'Elegí a qué planilla se suma.';
        if (!elegido) return 'Buscá y elegí al operario de la lista.';
        if (!montoValido) return 'Poné el monto del adelanto.';
        return null;
    }, [planilla, elegido, montoValido]);

    const guardar = async () => {
        if (error) return;
        setGuardando(true);
        try {
            // El PUT reemplaza todas las líneas, así que primero traemos las que
            // ya tiene la planilla y mandamos el conjunto completo con la nueva.
            // Se lee en el momento de guardar (y no al abrir el modal) para no
            // pisar lo que se haya cargado en el medio desde otra pantalla.
            const res = await fetch(`/api/payment-sheets/${planilla.id}`);
            if (!res.ok) { notify.error('No se pudo leer la planilla.'); return; }
            const actual = await res.json();
            const lineas = (actual.lines || []).map(l => ({ operario: l.operario, monto: Number(l.monto) }));

            const nombre = nombrePlanilla(elegido);
            const yaEsta = lineas.some(l => normalizeText(l.operario) === normalizeText(nombre));
            if (yaEsta && !confirm(`${nombre} ya figura en esta planilla. ¿Agregarlo igual como una segunda línea?`)) {
                return;
            }

            const guardado = await fetch(`/api/payment-sheets/${planilla.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tipo: actual.tipo,
                    nombre: actual.nombre,
                    fecha: actual.fecha,
                    lines: [...lineas, { operario: nombre, monto: nMonto }],
                }),
            });
            const json = await guardado.json().catch(() => ({}));
            if (!guardado.ok) { notify.error(json.error || 'No se pudo guardar el adelanto.'); return; }

            notify.success(`${nombre}: ${money(nMonto)} agregado a ${actual.nombre}.`);
            onGuardado?.();
            onClose();
        } catch {
            notify.error('Error de red al guardar.');
        } finally {
            setGuardando(false);
        }
    };

    const inputCard = { margin: 0, fontWeight: 'normal', width: '100%' };
    const labelEstilo = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 };

    return (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
            <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div>
                        <h2 style={{ margin: 0 }}>Adelanto suelto</h2>
                        <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            Para una excepción fuera de la tanda del mes.
                        </p>
                    </div>
                    <button className="btn btn-secondary" onClick={onClose} disabled={guardando} style={{ padding: '0.3rem 0.6rem' }}>✕</button>
                </div>

                {planillas.length === 0 ? (
                    <p style={{ margin: '1.5rem 0', padding: '1rem', background: 'var(--color-muted-surface)', borderRadius: '8px', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                        Todavía no hay ninguna planilla de adelantos cargada. Creá una primero con
                        <strong style={{ color: 'var(--text-main)' }}> + Nueva planilla</strong> y después vas a poder sumarle adelantos sueltos.
                    </p>
                ) : (
                    <>
                        <div style={{ marginTop: '1.1rem', display: 'grid', gap: '0.9rem' }}>
                            <label style={labelEstilo}>
                                Se suma a la planilla
                                <select className="card" style={inputCard} value={sheetId} onChange={(e) => setSheetId(e.target.value)}>
                                    {planillas.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.nombre}{p.fecha ? ` · ${formatArgentinaDate(p.fecha)}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            {/* Buscador de operario. Se elige de la nómina, no se
                                escribe libre: el nombre tiene que quedar igual
                                que en el resto de la planilla. */}
                            <div style={{ ...labelEstilo, position: 'relative' }} ref={cajaRef}>
                                <span>Operario</span>
                                {elegido ? (
                                    <div className="card" style={{ ...inputCard, display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>
                                            {nombrePlanilla(elegido)}
                                        </span>
                                        {elegido.legajo && (
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>leg {elegido.legajo}</span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => { setElegido(null); setBusqueda(''); }}
                                            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.95rem' }}
                                            title="Elegir otro"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <input
                                            type="text"
                                            className="card"
                                            style={inputCard}
                                            placeholder="🔍 Buscar por apellido o nombre…"
                                            value={busqueda}
                                            onChange={(e) => { setBusqueda(e.target.value); setAbierta(true); }}
                                            onFocus={() => setAbierta(true)}
                                            autoComplete="off"
                                        />
                                        {abierta && busqueda.trim() !== '' && (
                                            <div
                                                className="card"
                                                style={{
                                                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                                                    margin: '0.2rem 0 0', padding: 0, maxHeight: '13rem', overflowY: 'auto',
                                                }}
                                            >
                                                {sugerencias.map(e => (
                                                    <button
                                                        key={e.id}
                                                        type="button"
                                                        onClick={() => { setElegido(e); setAbierta(false); }}
                                                        style={{
                                                            display: 'flex', width: '100%', alignItems: 'center', gap: '0.5rem',
                                                            padding: '0.5rem 0.75rem', background: 'transparent', border: 'none',
                                                            borderBottom: '1px solid var(--border-color)', cursor: 'pointer',
                                                            textAlign: 'left', color: 'var(--text-main)', fontSize: '0.88rem',
                                                        }}
                                                    >
                                                        <span>{nombrePlanilla(e)}</span>
                                                        {e.legajo && (
                                                            <span style={{ marginLeft: 'auto', fontSize: '0.76rem', color: 'var(--text-muted)' }}>leg {e.legajo}</span>
                                                        )}
                                                    </button>
                                                ))}
                                                {sugerencias.length === 0 && (
                                                    <p style={{ margin: 0, padding: '0.75rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
                                                        Ningún operario activo coincide.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <label style={labelEstilo}>
                                Monto del adelanto
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    className="card"
                                    style={{ ...inputCard, textAlign: 'right', fontWeight: 700, fontSize: '1.05rem' }}
                                    placeholder="$ 0"
                                    value={monto}
                                    onChange={(e) => setMonto(formatMientrasEscribe(e.target.value))}
                                />
                            </label>
                        </div>

                        {/* Cómo queda la planilla: se ve antes de guardar. */}
                        {planilla && montoValido && (
                            <div style={{ marginTop: '1rem', padding: '0.7rem 1rem', background: 'var(--color-muted-surface)', borderRadius: '8px', fontSize: '0.85rem' }}>
                                <strong>{planilla.nombre}</strong> pasa de {money(planilla.total)} a{' '}
                                <strong style={{ color: 'var(--text-main)' }}>{money(Number(planilla.total || 0) + nMonto)}</strong>
                                {' '}· {Number(planilla.cantidad_operarios || 0) + 1} operarios
                            </div>
                        )}

                        <div className="config-modal-actions" style={{ marginTop: '1.25rem', alignItems: 'center', gap: '0.6rem' }}>
                            <button className="btn btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
                            <button className="btn btn-primary" onClick={guardar} disabled={guardando || !!error}>
                                {guardando ? 'Guardando…' : 'Agregar adelanto'}
                            </button>
                            {error && (
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{error}</span>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
