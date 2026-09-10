'use client';

import { useEffect, useMemo, useState } from 'react';
import { notify } from '@/lib/toast';

// Registrar movimientos de uniformes: compra, entrega, devolución y ajuste.
//
// Un solo componente para los cuatro, porque la mecánica es idéntica y tres
// pantallas casi iguales terminan desincronizándose.
//
// La carga es "elegir y sumar": prenda → talle → cantidad → Agregar, y lo
// agregado queda en una lista corta que se puede sacar. Se sigue guardando TODO
// junto en un solo movimiento, que es lo que importa: vestir a alguien son 4-6
// prendas y con ~37 ingresos por mes, un guardado por prenda serían cientos de
// pasos al mes.
//
// Antes se mostraban las 24 combinaciones a la vez con un casillero cada una:
// más rápido en teoría, pero había que barrer una grilla larga para encontrar
// dos renglones. Mostrar solo lo que se carga es menos ruido.

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
    const [guardando, setGuardando] = useState(false);

    // Lo que se va agregando: [{ prenda_id, cantidad }]
    const [lineas, setLineas] = useState([]);
    // El selector de arriba, para armar la próxima línea.
    const [selPrenda, setSelPrenda] = useState('');
    const [selTalle, setSelTalle] = useState('');
    const [selCantidad, setSelCantidad] = useState('1');

    // Cerrar con Escape: es lo primero que intenta cualquiera.
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !guardando) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, guardando]);

    const activas = useMemo(() => prendas.filter((p) => p.activo), [prendas]);
    const porId = useMemo(() => new Map(activas.map((p) => [p.id, p])), [activas]);

    // Nombres de prenda, sin repetir, en el orden en que vienen.
    const nombresPrenda = useMemo(() => [...new Set(activas.map((p) => p.prenda))], [activas]);

    // Talles de la prenda elegida.
    const tallesDisponibles = useMemo(
        () => activas.filter((p) => p.prenda === selPrenda),
        [activas, selPrenda]
    );

    // Cuánto hay en el estado elegido. Sirve para avisar si se entrega más de lo
    // que figura, sin bloquear: si el armario dice otra cosa que el sistema, el
    // que tiene razón es el armario.
    const disponible = (p) => (estado === 'usado' ? p.stock_usado : p.stock_nuevo);

    const items = lineas;
    const totalUnidades = items.reduce((a, i) => a + Math.abs(i.cantidad), 0);

    const agregar = () => {
        const prendaId = Number(selTalle);
        const n = Math.trunc(Number(selCantidad));
        if (!prendaId) { notify.error('Elegí la prenda y el talle.'); return; }
        if (!Number.isFinite(n) || n === 0) { notify.error('Poné una cantidad.'); return; }
        if (n < 0 && tipo !== 'ajuste') { notify.error('La cantidad tiene que ser positiva.'); return; }

        setLineas((prev) => {
            // Si esa prenda ya está en la lista, se suma en vez de duplicar el
            // renglón: cargarla dos veces es un error de tipeo, no dos entregas.
            const i = prev.findIndex((l) => l.prenda_id === prendaId);
            if (i === -1) return [...prev, { prenda_id: prendaId, cantidad: n }];
            const copia = [...prev];
            copia[i] = { ...copia[i], cantidad: copia[i].cantidad + n };
            return copia;
        });
        // El talle se limpia pero la prenda queda: cargar varios talles de la
        // misma prenda es lo más común.
        setSelTalle('');
        setSelCantidad('1');
    };

    const quitar = (prendaId) => setLineas((prev) => prev.filter((l) => l.prenda_id !== prendaId));

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

                {/* Sin "para quién": las entregas se hacen de a muchos operarios
                    a la vez, así que un nombre suelto no representaba nada. */}
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Fecha
                    </label>
                    <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={inputEstilo} />
                </div>

                {/* Elegir y sumar: se agregan solo los renglones que hacen falta,
                    en vez de barrer una grilla con todas las combinaciones. */}
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Qué prendas {tipo === 'ajuste' && <span style={{ fontWeight: 400 }}>· podés poner negativo para descontar</span>}
                </label>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
                    <div style={{ flex: 2, minWidth: '150px' }}>
                        <select
                            value={selPrenda}
                            onChange={(e) => { setSelPrenda(e.target.value); setSelTalle(''); }}
                            style={{ ...inputEstilo, width: '100%' }}
                        >
                            <option value="">Prenda…</option>
                            {nombresPrenda.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1, minWidth: '110px' }}>
                        <select
                            value={selTalle}
                            onChange={(e) => setSelTalle(e.target.value)}
                            disabled={!selPrenda}
                            style={{ ...inputEstilo, width: '100%' }}
                        >
                            <option value="">Talle…</option>
                            {tallesDisponibles.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.talle} (hay {disponible(p)})
                                </option>
                            ))}
                        </select>
                    </div>
                    <input
                        type="number"
                        step="1"
                        value={selCantidad}
                        onChange={(e) => setSelCantidad(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }}
                        style={{ ...inputEstilo, width: '4.5rem', textAlign: 'right' }}
                    />
                    <button className="btn btn-secondary" onClick={agregar} disabled={!selTalle}>
                        Agregar
                    </button>
                </div>

                {/* Lo cargado hasta ahora. */}
                <div style={{
                    border: '1px solid var(--border-color)', borderRadius: '8px',
                    marginBottom: '1rem', maxHeight: '220px', overflowY: 'auto',
                }}>
                    {!lineas.length && (
                        <p style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)', margin: 0, fontSize: '0.88rem' }}>
                            {activas.length
                                ? 'Elegí una prenda arriba y tocá Agregar.'
                                : 'No hay prendas cargadas todavía.'}
                        </p>
                    )}
                    {lineas.map((l, i) => {
                        const p = porId.get(l.prenda_id);
                        if (!p) return null;
                        const hay = disponible(p);
                        const deMas = tipo === 'entrega' && l.cantidad > hay;
                        return (
                            <div
                                key={l.prenda_id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    padding: '0.5rem 0.75rem',
                                    borderTop: i === 0 ? 'none' : '1px solid var(--border-color)',
                                }}
                            >
                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                    {p.prenda} <span style={{ color: 'var(--text-muted)' }}>·</span> {p.talle}
                                </span>
                                {deMas && (
                                    <span style={{ fontSize: '0.78rem', color: '#B45309', fontWeight: 600 }}>
                                        hay {hay}, estás sacando {l.cantidad}
                                    </span>
                                )}
                                <span style={{ marginLeft: 'auto', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                    {l.cantidad}
                                </span>
                                <button
                                    onClick={() => quitar(l.prenda_id)}
                                    title="Sacar de la lista"
                                    style={{
                                        border: 'none', background: 'none', cursor: 'pointer',
                                        color: 'var(--text-muted)', fontSize: '1.05rem', lineHeight: 1, padding: '0 0.15rem',
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                        );
                    })}
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
