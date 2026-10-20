'use client';

import { useEffect, useMemo, useState } from 'react';
import { notify } from '@/lib/toast';
import { calcularACargo } from '@/lib/uniformes';
import BuscadorOperario from './BuscadorOperario';
import UniformeLineas from './UniformeLineas';

// Registrar movimientos de uniformes: compra, entrega, devolución y ajuste.
//
// Un solo componente para los cuatro, porque la mecánica es idéntica y tres
// pantallas casi iguales terminan desincronizándose.
//
// Se sigue guardando TODO junto en un solo movimiento: vestir a alguien son
// 4-6 prendas y con ~37 ingresos por mes, un guardado por prenda serían cientos
// de pasos al mes.
//
// Entregar y devolver van a nombre de un OPERARIO (2026-10-19): así queda en su
// legajo qué tiene y desde cuándo, que es la base para las renovaciones.

// El `efecto` dice en una línea qué le hace cada movimiento a los dos números
// que importan: lo que hay en el armario y lo que hay en la calle.
const TITULOS = {
    compra:     { titulo: 'Registrar compra',     verbo: 'Entró al armario',   accion: 'Registrar compra',
                  efecto: 'Suma al armario. No toca lo que hay en la calle.' },
    entrega:    { titulo: 'Entregar uniforme',    verbo: 'Sale del armario',   accion: 'Registrar entrega',
                  efecto: 'Saca del armario y queda a nombre del operario.' },
    devolucion: { titulo: 'Registrar devolución', verbo: 'Vuelve al armario',  accion: 'Registrar devolución',
                  efecto: 'Vuelve al armario y deja de figurar a nombre del operario.' },
    ajuste:     { titulo: 'Corregir el conteo',   verbo: 'Corrección',         accion: 'Guardar corrección',
                  efecto: 'Corrige lo que dice el armario, sin tocar la calle. Es para ropa que aparece o falta.' },
};

// En qué estado entra o sale cada cosa, por defecto. Lo que se compra es
// nuevo, lo que vuelve de la calle está usado.
const ESTADO_POR_DEFECTO = { compra: 'nuevo', entrega: 'nuevo', devolucion: 'usado', ajuste: 'nuevo' };

// Valor del selector cuando el movimiento pasa por la oficina y no por un
// supervisor. No es un id: los ids son números, así que no puede chocar con uno.
const OFICINA = 'OFICINA';

// El supervisor es un dato de más (quién lo llevó o lo trajo), nunca
// obligatorio. En la corrección no se pregunta: no tiene sentido.
const ETIQUETA_QUIEN = {
    entrega: 'Supervisor que lo lleva (opcional)',
    devolucion: 'Supervisor que lo trae (opcional)',
    compra: 'Para quién es',
};

const todayAR = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

const fmt = (ymd) => (ymd ? ymd.split('-').reverse().join('/') : '');

const inputEstilo = {
    padding: '0.5rem 0.65rem', borderRadius: '8px',
    border: '1px solid var(--border-color)', background: 'var(--color-surface)',
    color: 'var(--text-main)', fontSize: '0.9rem',
};

const etiqueta = { display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' };

export default function UniformeMovimientoModal({ tipo, prendas, supervisores, onClose, onGuardado }) {
    const cfg = TITULOS[tipo] || TITULOS.compra;
    const conOperario = tipo === 'entrega' || tipo === 'devolucion';

    const [estado, setEstado] = useState(ESTADO_POR_DEFECTO[tipo] || 'nuevo');
    const [operario, setOperario] = useState(null);
    // Una bolsa que trae un supervisor sin saber de quién es cada prenda.
    const [sinDueno, setSinDueno] = useState(false);
    // El selector guarda o el id de un supervisor, o el literal OFICINA.
    const [supervisorId, setSupervisorId] = useState('');
    const esOficina = supervisorId === OFICINA;
    const [fecha, setFecha] = useState(todayAR);
    const [nota, setNota] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [lineas, setLineas] = useState([]);

    // Lo que el operario tiene a su nombre (para devolver).
    const [aCargo, setACargo] = useState(null);

    // Cerrar con Escape: es lo primero que intenta cualquiera.
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !guardando) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, guardando]);

    useEffect(() => {
        if (tipo !== 'devolucion' || !operario) { setACargo(null); return; }
        let vivo = true;
        fetch(`/api/uniformes/movimientos?employee_id=${operario.id}`, { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : []))
            .then((movs) => {
                if (!vivo) return;
                const mapa = calcularACargo(Array.isArray(movs) ? movs : []).get(operario.id) || new Map();
                setACargo(mapa);
            })
            .catch(() => { if (vivo) setACargo(new Map()); });
        return () => { vivo = false; };
    }, [tipo, operario]);

    const porId = useMemo(() => new Map(prendas.map((p) => [p.id, p])), [prendas]);
    const disponible = (p) => (estado === 'usado' ? p.stock_usado : p.stock_nuevo);
    const totalUnidades = lineas.reduce((a, i) => a + Math.abs(i.cantidad), 0);

    // ¿Alguna línea saca más de lo que hay? El servidor lo rechaza también;
    // esto es para que se vea antes de intentar.
    const hayFaltante = tipo === 'entrega' && lineas.some((l) => {
        const p = porId.get(l.prenda_id);
        return p && Math.abs(l.cantidad) > disponible(p);
    });

    const avisoLinea = (p, l) => {
        if (tipo === 'entrega' && l.cantidad > disponible(p)) return `hay ${disponible(p)}, estás sacando ${l.cantidad}`;
        // No es un error: la ropa de antes del sistema nunca tuvo su entrega
        // cargada. Entra al armario igual; se avisa para que no sorprenda que
        // no le baje nada al operario.
        if (tipo === 'devolucion' && aCargo) {
            const tiene = aCargo.get(p.id)?.cantidad || 0;
            if (l.cantidad > tiene) return tiene ? `a su nombre figuran ${tiene}` : 'no figura a su nombre · entra al armario igual';
        }
        return null;
    };

    const faltaOperario = conOperario && !operario && !(tipo === 'devolucion' && sinDueno);

    const guardar = async () => {
        if (!lineas.length) { notify.error('Agregá al menos una prenda.'); return; }
        if (faltaOperario) { notify.error(tipo === 'entrega' ? 'Elegí a qué operario se le entrega.' : 'Elegí quién lo devuelve.'); return; }

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
                    employee_id: conOperario && operario ? operario.id : null,
                    // Sin supervisor va null, no 0: Number('') da 0 y eso
                    // apuntaría a un supervisor que no existe. Oficina tampoco
                    // es un id, así que también va null.
                    supervisor_id: (tipo !== 'ajuste' && supervisorId && !esOficina) ? Number(supervisorId) : null,
                    // Lo que distingue "oficina" de "no puse nada".
                    para_nombre: tipo !== 'ajuste' && esOficina ? 'Oficina' : null,
                    nota: nota.trim() || null,
                    movimientos: lineas,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(json.error || 'No se pudo guardar.'); return; }

            notify.success(
                `${cfg.titulo.replace('Registrar ', '').replace('Corregir el conteo', 'Corrección').replace('Entregar uniforme', 'Entrega')}: `
                + `${totalUnidades} ${totalUnidades === 1 ? 'prenda' : 'prendas'}`
                + (operario ? ` · ${operario.apellido} ${operario.nombre}` : '') + '.'
            );
            if (json.sin_registro > 0) {
                notify.success(`${json.sin_registro} ${json.sin_registro === 1 ? 'prenda no figuraba entregada' : 'prendas no figuraban entregadas'}: entraron al armario igual.`);
            }
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
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{cfg.titulo}</h2>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            {cfg.efecto}
                        </p>
                    </div>
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

                {/* A quién: lo primero, porque es lo que define todo lo demás. */}
                {conOperario && (
                    <div style={{ marginBottom: '0.9rem' }}>
                        <label style={etiqueta}>{tipo === 'entrega' ? 'Operario' : 'Quién lo devuelve'}</label>
                        {!(tipo === 'devolucion' && sinDueno) && (
                            <BuscadorOperario
                                value={operario}
                                onChange={setOperario}
                                autoFocus
                                // Para devolver también se busca entre los dados
                                // de baja: quien renuncia trae el uniforme después.
                                url={`/api/uniformes/operarios${tipo === 'devolucion' ? '?bajas=1' : ''}`}
                            />
                        )}
                        {tipo === 'devolucion' && !operario && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', fontSize: '0.82rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={sinDueno} onChange={(e) => setSinDueno(e.target.checked)} />
                                No sé de quién es (por ejemplo, una bolsa que trae un supervisor)
                            </label>
                        )}
                        {/* Lo que tiene a su nombre: un toque y queda para devolver. */}
                        {tipo === 'devolucion' && operario && aCargo && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.82rem' }}>
                                {aCargo.size ? (
                                    <>
                                        <span style={{ color: 'var(--text-muted)' }}>Tiene a su nombre (tocá para devolver):</span>
                                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                                            {[...aCargo].map(([prendaId, a]) => {
                                                const p = porId.get(prendaId);
                                                if (!p) return null;
                                                return (
                                                    <button
                                                        type="button"
                                                        key={prendaId}
                                                        className="btn btn-secondary"
                                                        style={{ padding: '0.2rem 0.55rem', fontSize: '0.78rem' }}
                                                        onClick={() => setLineas((prev) => (prev.some((l) => l.prenda_id === prendaId)
                                                            ? prev
                                                            : [...prev, { prenda_id: prendaId, cantidad: a.cantidad }]))}
                                                    >
                                                        {p.prenda} {p.talle} × {a.cantidad}
                                                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {fmt(a.ultimaEntrega)}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                ) : (
                                    <span style={{ color: 'var(--text-muted)' }}>No tiene nada registrado a su nombre. Si devuelve ropa igual, entra al armario.</span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Nuevo o usado: dos botones grandes, no un desplegable. Es la
                    decisión que más se repite y tiene que ser de un toque. */}
                <div style={{ marginBottom: '0.9rem' }}>
                    <label style={etiqueta}>Estado de la prenda</label>
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
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    {tipo !== 'ajuste' && (
                        <div style={{ flex: '2 1 220px' }}>
                            <label style={etiqueta}>{ETIQUETA_QUIEN[tipo] || 'Supervisor'}</label>
                            <select
                                value={supervisorId}
                                onChange={(e) => setSupervisorId(e.target.value)}
                                style={{ ...inputEstilo, width: '100%' }}
                            >
                                <option value="">Sin supervisor</option>
                                <option value={OFICINA}>🏢 Oficina</option>
                                {supervisores.map((s) => (
                                    <option key={s.id} value={s.id}>{s.surname} {s.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div style={{ flex: '1 1 140px' }}>
                        <label style={etiqueta}>{tipo === 'entrega' ? 'Día de la entrega' : 'Fecha'}</label>
                        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ ...inputEstilo, width: '100%' }} />
                    </div>
                </div>

                <label style={etiqueta}>
                    Qué prendas {tipo === 'ajuste' && <span style={{ fontWeight: 400 }}>· podés poner negativo para descontar</span>}
                </label>
                <UniformeLineas
                    prendas={prendas}
                    estado={estado}
                    lineas={lineas}
                    onChange={setLineas}
                    permitirNegativo={tipo === 'ajuste'}
                    avisoLinea={avisoLinea}
                />

                <div style={{ marginBottom: '1rem' }}>
                    <label style={etiqueta}>Nota (opcional)</label>
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
                        disabled={guardando || !lineas.length || hayFaltante || faltaOperario}
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
