'use client';

import { useEffect, useMemo, useState } from 'react';
import { notify } from '@/lib/toast';

// Registrar movimientos de uniformes: compra, entrega, devolución y ajuste.
//
// Un solo componente para los cuatro, porque la mecánica es idéntica y tres
// pantallas casi iguales terminan desincronizándose.
//
// Lo importante del diseño: TODAS las prendas se ven a la vez con un casillero
// de cantidad al lado, y se guarda todo junto. Vestir a alguien que entra son
// 4-6 prendas, y con ~37 ingresos por mes, un formulario por prenda serían
// cientos de pasos al mes. Esa fricción es exactamente lo que hace que a las dos
// semanas nadie cargue nada.

const TITULOS = {
    compra:     { titulo: 'Registrar compra',     verbo: 'Entró al armario',   accion: 'Registrar compra' },
    entrega:    { titulo: 'Entregar uniforme',    verbo: 'Sale del armario',   accion: 'Registrar entrega' },
    devolucion: { titulo: 'Registrar devolución', verbo: 'Vuelve al armario',  accion: 'Registrar devolución' },
    ajuste:     { titulo: 'Corregir el conteo',   verbo: 'Corrección',         accion: 'Guardar corrección' },
};

// En qué estado entra o sale cada cosa, por defecto. Los defaults resuelven casi
// todos los casos sin que nadie toque nada: lo que se compra es nuevo, lo que
// vuelve de la calle está usado.
const ESTADO_POR_DEFECTO = { compra: 'nuevo', entrega: 'nuevo', devolucion: 'usado', ajuste: 'nuevo' };

const todayAR = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

const inputEstilo = {
    padding: '0.5rem 0.65rem', borderRadius: '8px',
    border: '1px solid var(--border-color)', background: 'var(--color-surface)',
    color: 'var(--text-main)', fontSize: '0.9rem',
};

export default function UniformeMovimientoModal({ tipo, prendas, supervisores, onClose, onGuardado }) {
    const cfg = TITULOS[tipo] || TITULOS.compra;
    const pideSupervisor = tipo === 'entrega' || tipo === 'devolucion';

    const [estado, setEstado] = useState(ESTADO_POR_DEFECTO[tipo] || 'nuevo');
    const [supervisorId, setSupervisorId] = useState('');
    const [fecha, setFecha] = useState(todayAR);
    const [nota, setNota] = useState('');
    const [paraNombre, setParaNombre] = useState('');
    const [cantidades, setCantidades] = useState({});   // prenda_id -> string
    const [guardando, setGuardando] = useState(false);

    // Cerrar con Escape: es lo primero que intenta cualquiera.
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !guardando) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, guardando]);

    const activas = useMemo(() => prendas.filter((p) => p.activo), [prendas]);

    // Agrupadas por prenda, igual que en la pantalla de stock.
    const grupos = useMemo(() => {
        const map = new Map();
        for (const p of activas) {
            if (!map.has(p.prenda)) map.set(p.prenda, []);
            map.get(p.prenda).push(p);
        }
        return [...map.entries()];
    }, [activas]);

    const setCant = (id, v) => setCantidades((prev) => ({ ...prev, [id]: v }));

    const items = useMemo(() => {
        const out = [];
        for (const [id, v] of Object.entries(cantidades)) {
            const n = Math.trunc(Number(v));
            if (!Number.isFinite(n) || n === 0) continue;
            out.push({ prenda_id: Number(id), cantidad: n });
        }
        return out;
    }, [cantidades]);

    const totalUnidades = items.reduce((a, i) => a + Math.abs(i.cantidad), 0);

    // Cuánto hay disponible de cada prenda en el estado elegido. Sirve para
    // avisar si se entrega más de lo que hay, sin bloquear: si el armario dice
    // otra cosa que el sistema, el que tiene razón es el armario.
    const disponible = (p) => (estado === 'usado' ? p.stock_usado : p.stock_nuevo);

    const guardar = async () => {
        if (!items.length) {
            notify.error('Poné la cantidad de al menos una prenda.');
            return;
        }
        if (pideSupervisor && !supervisorId) {
            notify.error('Elegí el supervisor: es quien queda responsable del uniforme.');
            return;
        }

        setGuardando(true);
        try {
            const res = await fetch('/api/uniformes/movimientos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    tipo,
                    estado,
                    fecha,
                    supervisor_id: pideSupervisor ? Number(supervisorId) : null,
                    para_nombre: paraNombre.trim() || null,
                    nota: nota.trim() || null,
                    movimientos: items,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(json.error || 'No se pudo guardar.'); return; }

            notify.success(
                `${cfg.titulo.replace('Registrar ', '').replace('Corregir el conteo', 'Corrección')}: `
                + `${totalUnidades} ${totalUnidades === 1 ? 'prenda' : 'prendas'}.`
            );
            onGuardado?.();
            onClose();
        } catch {
            notify.error('Error de red al guardar.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div
            onClick={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                padding: '1rem', overflowY: 'auto',
            }}
        >
            <div className="card" style={{ width: '100%', maxWidth: '620px', padding: '1.25rem', margin: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{cfg.titulo}</h2>
                    <button
                        onClick={onClose}
                        disabled={guardando}
                        style={{
                            marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', fontSize: '1.3rem', lineHeight: 1,
                        }}
                        title="Cerrar"
                    >
                        ✕
                    </button>
                </div>

                {/* Nuevo o usado: dos botones grandes, no un desplegable. Es la
                    decisión que más se repite y tiene que ser de un toque. */}
                <div style={{ marginBottom: '0.9rem' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Estado de la prenda
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {['nuevo', 'usado'].map((e) => (
                            <button
                                key={e}
                                onClick={() => setEstado(e)}
                                style={{
                                    flex: 1, padding: '0.6rem', borderRadius: '8px', cursor: 'pointer',
                                    border: `1px solid ${estado === e ? 'var(--color-primary)' : 'var(--border-color)'}`,
                                    background: estado === e ? 'var(--color-primary)' : 'var(--color-surface)',
                                    color: estado === e ? '#fff' : 'var(--text-main)',
                                    fontWeight: estado === e ? 700 : 500, fontSize: '0.9rem',
                                }}
                            >
                                {e === 'nuevo' ? 'Nueva' : 'Usada'}
                            </button>
                        ))}
                    </div>
                    {tipo === 'entrega' && estado === 'usado' && (
                        <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Entregar una usada no cuenta como gasto nuevo: se suma al ahorro por reutilizar.
                        </p>
                    )}
                </div>

                {pideSupervisor && (
                    <div style={{ marginBottom: '0.9rem' }}>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                            Supervisor {tipo === 'entrega' ? '(queda responsable)' : '(quien la devuelve)'}
                        </label>
                        <select
                            value={supervisorId}
                            onChange={(e) => setSupervisorId(e.target.value)}
                            style={{ ...inputEstilo, width: '100%' }}
                        >
                            <option value="">Elegí un supervisor…</option>
                            {supervisores.map((s) => (
                                <option key={s.id} value={s.id}>{s.surname} {s.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                            Fecha
                        </label>
                        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={inputEstilo} />
                    </div>
                    {tipo === 'entrega' && (
                        <div style={{ flex: 1, minWidth: '180px' }}>
                            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                                Para quién (opcional)
                            </label>
                            <input
                                type="text"
                                value={paraNombre}
                                onChange={(e) => setParaNombre(e.target.value)}
                                placeholder="Nombre del operario, si se sabe"
                                style={{ ...inputEstilo, width: '100%' }}
                            />
                        </div>
                    )}
                </div>

                {/* La grilla: todas las prendas a la vez. Se tipea en las que
                    correspondan y se guarda una sola vez. */}
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Cantidades {tipo === 'ajuste' && <span style={{ fontWeight: 400 }}>· podés poner negativo para descontar</span>}
                </label>
                <div style={{
                    border: '1px solid var(--border-color)', borderRadius: '8px',
                    maxHeight: '320px', overflowY: 'auto', marginBottom: '1rem',
                }}>
                    {grupos.map(([nombre, talles]) => (
                        <div key={nombre}>
                            <div style={{
                                padding: '0.4rem 0.75rem', background: 'var(--color-muted-surface)',
                                fontSize: '0.8rem', fontWeight: 700, position: 'sticky', top: 0,
                            }}>
                                {nombre}
                            </div>
                            {talles.map((p) => {
                                const hay = disponible(p);
                                const puesto = Math.trunc(Number(cantidades[p.id] || 0)) || 0;
                                const seVaEnNegativo = tipo === 'entrega' && puesto > hay;
                                return (
                                    <div
                                        key={p.id}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                                            padding: '0.4rem 0.75rem', borderTop: '1px solid var(--border-color)',
                                        }}
                                    >
                                        <span style={{ width: '3rem', fontWeight: 600, fontSize: '0.88rem' }}>{p.talle}</span>
                                        <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            hay {hay} {estado === 'usado' ? 'usadas' : 'nuevas'}
                                            {seVaEnNegativo && (
                                                <span style={{ color: '#B45309', fontWeight: 600 }}> · estás entregando más de lo que figura</span>
                                            )}
                                        </span>
                                        <input
                                            type="number"
                                            step="1"
                                            value={cantidades[p.id] ?? ''}
                                            onChange={(e) => setCant(p.id, e.target.value)}
                                            placeholder="0"
                                            style={{ ...inputEstilo, width: '5.5rem', textAlign: 'right' }}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                    {!grupos.length && (
                        <p style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
                            No hay prendas cargadas todavía.
                        </p>
                    )}
                </div>

                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Nota (opcional)
                    </label>
                    <input
                        type="text"
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        placeholder={tipo === 'ajuste' ? 'Por qué se corrige' : 'Número de factura, observación…'}
                        style={{ ...inputEstilo, width: '100%' }}
                    />
                </div>

                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        className="btn btn-primary"
                        onClick={guardar}
                        disabled={guardando || !items.length}
                        style={{ fontWeight: 700 }}
                    >
                        {guardando ? 'Guardando…' : cfg.accion}
                    </button>
                    <button className="btn btn-secondary" onClick={onClose} disabled={guardando}>
                        Cancelar
                    </button>
                    {totalUnidades > 0 && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            {cfg.verbo}: {totalUnidades} {totalUnidades === 1 ? 'prenda' : 'prendas'}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
