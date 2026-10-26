'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import ActivarNotificaciones from '@/components/ActivarNotificaciones';
import HojaFecha from '@/components/HojaFecha';
import { getSessionUser } from '@/lib/session';
import { notify } from '@/lib/toast';
import { diasEntre, fmtFecha, hoyArgentina } from '@/lib/trabajos';
import { AVISOS_VENCIMIENTO, textoRepeticion } from '@/lib/vencimientos';

// Vencimientos de RRHH: lo que hay que presentar o renovar en una fecha, una
// sola vez o cada N meses. Avisa al celular de los responsables 7 días antes,
// 2 días antes y el mismo día, hasta que alguien lo marca como hecho.

const fmtHechoAR = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// "26/10 a las 14:30"
const fmtHecho = (iso) => {
    const p = Object.fromEntries(fmtHechoAR.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    return `${p.day}/${p.month} a las ${p.hour}:${p.minute}`;
};

// La urgencia, en una palabra: la usan la hoja de la fecha, el "cuándo" y el
// grupo. Rojo = vencido o a dos días; ámbar = esta semana.
const tonoDe = (dias) => (dias <= 2 ? 'rojo' : dias <= 7 ? 'ambar' : undefined);

function cuandoEs(dias) {
    if (dias < 0) return `venció hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'día' : 'días'}`;
    if (dias === 0) return 'vence hoy';
    if (dias === 1) return 'vence mañana';
    return `en ${dias} días`;
}

const GRUPOS = [
    { id: 'vencidos', titulo: 'Vencidos', tono: 'rojo' },
    { id: 'semana', titulo: 'Esta semana', tono: 'ambar' },
    { id: 'despues', titulo: 'Más adelante' },
];
const grupoDe = (dias) => (dias < 0 ? 'vencidos' : dias <= 7 ? 'semana' : 'despues');

// "Lia Rosa Toledo" -> "LT": la primera y la última palabra.
const iniciales = (nombre) => {
    const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};

// Qué avisos ya salieron. Solo se muestra lo que pasó: lo que falta se sabe.
function lineaAvisos(v) {
    return AVISOS_VENCIMIENTO
        .map((d) => {
            const a = v.avisos.find((x) => x.dias_antes === d);
            if (!a || a.estado === 'omitido') return null;
            const etiqueta = d === 0 ? 'el día' : `${d} días antes`;
            if (a.estado === 'enviado') return { texto: `${etiqueta}: avisado`, mal: false };
            return { texto: `${etiqueta}: no llegó (${a.ultimo_error || 'error'})`, mal: true };
        })
        .filter(Boolean);
}

export default function VencimientosPage() {
    const [vencimientos, setVencimientos] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [hechos, setHechos] = useState(null);   // null = no se pidieron todavía
    const [verHechos, setVerHechos] = useState(false);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [modal, setModal] = useState(null);     // null | 'nuevo' | el vencimiento a editar
    const [miId, setMiId] = useState(null);

    // Para tildar por defecto a quien carga. La sesión vive en el navegador:
    // no se puede leer en el primer render.
    useEffect(() => { setMiId(getSessionUser()?.app_user_id || null); }, []);

    const cargar = useCallback(async () => {
        setError('');
        try {
            const res = await fetch('/api/vencimientos', { credentials: 'include' });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'No se pudo cargar.');
            setVencimientos(json.vencimientos || []);
            setUsuarios(json.usuarios || []);
        } catch (e) {
            setError(e.message || 'Error de red.');
        } finally {
            setCargando(false);
        }
    }, []);

    const cargarHechos = useCallback(async () => {
        try {
            const res = await fetch('/api/vencimientos?hechos=1', { credentials: 'include' });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'No se pudo cargar.');
            setHechos(json.hechos || []);
        } catch (e) {
            notify.error(e.message || 'Error de red.');
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);
    useEffect(() => { if (verHechos) cargarHechos(); }, [verHechos, cargarHechos]);

    const nombreDe = useMemo(() => new Map(usuarios.map((u) => [u.id, u.nombre])), [usuarios]);

    const porGrupo = useMemo(() => {
        const hoy = hoyArgentina();
        const g = { vencidos: [], semana: [], despues: [] };
        for (const v of vencimientos) {
            const dias = diasEntre(hoy, v.fecha);
            g[grupoDe(dias)].push({ ...v, dias });
        }
        return g;
    }, [vencimientos]);

    const marcarHecho = async (v) => {
        const sigue = v.cada_meses ? '\n\nPasa solo al próximo vencimiento.' : '\n\nSale de la lista y ya no avisa.';
        if (!confirm(`¿Marcar "${v.titulo}" como hecho?${sigue}`)) return;
        try {
            const res = await fetch('/api/vencimientos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: v.id, accion: 'hecho' }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'No se pudo marcar.');
            notify.success(v.cada_meses ? `Hecho. El próximo vence el ${fmtFecha(json.fecha)}.` : 'Hecho.');
            cargar();
            if (verHechos) cargarHechos();
        } catch (e) {
            notify.error(e.message || 'Error de red.');
        }
    };

    const borrar = async (v) => {
        if (!confirm(`¿Borrar "${v.titulo}"?\n\nDeja de aparecer y de avisar${v.cada_meses ? ', también los meses que vienen' : ''}.`)) return;
        try {
            const res = await fetch(`/api/vencimientos?id=${v.id}`, { method: 'DELETE', credentials: 'include' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || 'No se pudo borrar.');
            notify.success('Borrado.');
            cargar();
        } catch (e) {
            notify.error(e.message || 'Error de red.');
        }
    };

    return (
        <MainLayout>
            <div className="config-view agenda">
                <header className="page-header" style={{ marginBottom: '1rem', alignItems: 'center' }}>
                    <h1 style={{ margin: 0, flex: '1 1 0', minWidth: 'min-content' }}>Vencimientos</h1>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginLeft: 'auto' }}>
                        <button className="btn btn-primary" onClick={() => setModal('nuevo')} disabled={!usuarios.length}>
                            + Nuevo
                        </button>
                        <ActivarNotificaciones />
                    </div>
                </header>

                <div className="agenda-tabs" role="tablist">
                    {[{ id: false, label: 'Pendientes' }, { id: true, label: 'Hechos' }].map((t) => (
                        <button key={t.label} role="tab" aria-selected={verHechos === t.id} onClick={() => setVerHechos(t.id)}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {verHechos ? (
                    <ListaHechos hechos={hechos} />
                ) : cargando ? (
                    <div className="agenda-vacia">Cargando…</div>
                ) : error ? (
                    <div className="agenda-vacia" style={{ color: 'var(--error)' }}>{error}</div>
                ) : vencimientos.length === 0 ? (
                    <div className="agenda-vacia">
                        <strong>No hay nada por vencer</strong>
                        Cargá lo que vence con “+ Nuevo”: una vez o todos los meses.
                    </div>
                ) : (
                    GRUPOS.filter((g) => porGrupo[g.id].length).map((g) => (
                        <section key={g.id} className="agenda-grupo" data-tono={g.tono}>
                            <h2 className="agenda-grupo__titulo">
                                {g.titulo} <small>{porGrupo[g.id].length}</small>
                            </h2>
                            <div className="agenda-lista">
                                {porGrupo[g.id].map((v) => {
                                    const tono = tonoDe(v.dias);
                                    const avisos = lineaAvisos(v);
                                    const nombres = (v.responsables || []).map((id) => nombreDe.get(id) || 'Usuario deshabilitado');
                                    return (
                                        <article key={v.id} className="agenda-fila">
                                            <HojaFecha fecha={v.fecha} tono={tono} />
                                            <div className="agenda-cuerpo">
                                                <div className="agenda-cabeza">
                                                    <h3 className="agenda-titulo">{v.titulo}</h3>
                                                    <span className="agenda-cuando" data-tono={tono}>{cuandoEs(v.dias)}</span>
                                                </div>
                                                <div className="agenda-detalle">
                                                    <span className="avatares" aria-hidden="true">
                                                        {nombres.map((n, i) => <span key={i} className="avatar-mini">{iniciales(n)}</span>)}
                                                    </span>
                                                    Avisa a <strong>{nombres.join(', ')}</strong>
                                                    {v.cada_meses ? <> · {textoRepeticion(v.cada_meses).toLowerCase()}</> : null}
                                                </div>
                                                {v.nota && <div className="agenda-nota">{v.nota}</div>}
                                                {avisos.length > 0 && (
                                                    <div className="agenda-avisos">
                                                        {avisos.map((a, i) => (
                                                            <span key={a.texto} data-mal={a.mal}>{i > 0 && ' · '}{a.texto}</span>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className="agenda-acciones">
                                                    <button className="btn btn-primary" onClick={() => marcarHecho(v)}>✓ Hecho</button>
                                                    <button className="agenda-accion" onClick={() => setModal(v)}>Editar</button>
                                                    <button className="agenda-accion agenda-accion--borrar" onClick={() => borrar(v)}>Borrar</button>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </section>
                    ))
                )}

                {modal && (
                    <VencimientoModal
                        vencimiento={modal === 'nuevo' ? null : modal}
                        usuarios={usuarios}
                        miId={miId}
                        onClose={() => setModal(null)}
                        onGuardado={() => { setModal(null); cargar(); }}
                    />
                )}
            </div>
        </MainLayout>
    );
}

function ListaHechos({ hechos }) {
    if (!hechos) return <div className="agenda-vacia">Cargando…</div>;
    if (!hechos.length) {
        return (
            <div className="agenda-vacia">
                <strong>Todavía no se marcó nada como hecho</strong>
                Cuando alguien toque “Hecho”, queda acá con su nombre y la hora.
            </div>
        );
    }
    return (
        <div className="agenda-lista">
            {hechos.map((h) => (
                <article key={h.id} className="agenda-fila" data-apagada="true">
                    <HojaFecha fecha={h.fecha_vencimiento} />
                    <div className="agenda-cuerpo">
                        <div className="agenda-cabeza">
                            <h3 className="agenda-titulo">{h.titulo}</h3>
                            {h.cada_meses ? <span className="agenda-estado">{textoRepeticion(h.cada_meses)}</span> : null}
                        </div>
                        <div className="agenda-detalle">
                            Hecho por <strong>{h.hecho_por || 'alguien'}</strong> el {fmtHecho(h.hecho_at)}
                        </div>
                    </div>
                </article>
            ))}
        </div>
    );
}

function VencimientoModal({ vencimiento, usuarios, miId, onClose, onGuardado }) {
    const editando = Boolean(vencimiento);
    const [titulo, setTitulo] = useState(vencimiento?.titulo || '');
    const [fecha, setFecha] = useState(vencimiento?.fecha || '');
    const [repite, setRepite] = useState(Boolean(vencimiento?.cada_meses));
    const [cada, setCada] = useState(String(vencimiento?.cada_meses || 1));
    const [responsables, setResponsables] = useState(() => new Set(
        vencimiento?.responsables || (usuarios.some((u) => u.id === miId) ? [miId] : [])
    ));
    const [nota, setNota] = useState(vencimiento?.nota || '');
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !guardando) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, guardando]);

    const nCada = Math.trunc(Number(cada)) || 0;
    const error = !titulo.trim() ? 'Poné qué vence.'
        : !fecha ? 'Elegí la fecha.'
            : repite && (nCada < 1 || nCada > 24) ? 'Cada cuántos meses: de 1 a 24.'
                : !responsables.size ? 'Elegí a quién avisarle.'
                    : null;

    const toggle = (id) => setResponsables((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const guardar = async () => {
        if (error) { notify.error(error); return; }
        setGuardando(true);
        try {
            const cuerpo = {
                titulo: titulo.trim(),
                fecha,
                cada_meses: repite ? nCada : null,
                responsables: [...responsables],
                nota: nota.trim() || null,
            };
            const res = await fetch('/api/vencimientos', {
                method: editando ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(editando ? { ...cuerpo, id: vencimiento.id } : cuerpo),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'No se pudo guardar.');
            notify.success(editando ? 'Guardado.' : 'Vencimiento cargado.');
            onGuardado();
        } catch (e) {
            notify.error(e.message || 'Error de red.');
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
                    <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{editando ? 'Editar vencimiento' : 'Nuevo vencimiento'}</h2>
                    <button className="btn btn-secondary" onClick={onClose} disabled={guardando} style={{ padding: '0.3rem 0.6rem' }}>✕</button>
                </div>

                <div style={{ display: 'grid', gap: '0.85rem', marginTop: '1.1rem' }}>
                    <label style={labelEstilo}>
                        Qué vence
                        <input type="text" className="card" style={inputCard} placeholder="Presentación 931"
                            value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
                    </label>

                    <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <label style={{ ...labelEstilo, flex: '1 1 160px', margin: 0 }}>
                            Fecha
                            <input type="date" className="card" style={inputCard} value={fecha} onChange={(e) => setFecha(e.target.value)} />
                        </label>

                        <div style={{ ...labelEstilo, flex: '0 1 auto' }}>
                            <span>Se repite</span>
                            <div className="venc-seg" role="group" aria-label="Se repite">
                                <button type="button" data-activo={!repite} aria-pressed={!repite} onClick={() => setRepite(false)}>
                                    Una sola vez
                                </button>
                                {/* Una etiqueta y no un botón: el número va adentro, y
                                    un input dentro de un botón no se puede escribir en
                                    todos los navegadores. Tocar el segmento lo elige. */}
                                <label data-activo={repite} onClick={() => setRepite(true)}>
                                    Cada
                                    <input
                                        type="number" min="1" max="24" step="1"
                                        aria-label="Cada cuántos meses"
                                        value={cada}
                                        onFocus={() => setRepite(true)}
                                        onChange={(e) => setCada(e.target.value)}
                                    />
                                    {nCada === 1 ? 'mes' : 'meses'}
                                </label>
                            </div>
                        </div>
                    </div>

                    <div style={labelEstilo}>
                        <span>Avisar a</span>
                        <div className="venc-personas">
                            {usuarios.map((u) => (
                                <button
                                    key={u.id}
                                    type="button"
                                    className="venc-persona"
                                    aria-pressed={responsables.has(u.id)}
                                    onClick={() => toggle(u.id)}
                                >
                                    <span className="venc-persona__ini" aria-hidden="true">{iniciales(u.nombre)}</span>
                                    {u.nombre}
                                </button>
                            ))}
                        </div>
                    </div>

                    <label style={labelEstilo}>
                        Nota (opcional)
                        <textarea className="card" rows={2} style={{ ...inputCard, resize: 'vertical', fontFamily: 'inherit' }}
                            value={nota} onChange={(e) => setNota(e.target.value)} />
                    </label>
                </div>

                <div className="config-modal-actions" style={{ marginTop: '1.4rem' }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
                    <button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando}>
                        {guardando ? 'Guardando…' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
