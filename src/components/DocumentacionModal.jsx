'use client';

import { useEffect, useState } from 'react';
import { notify } from '@/lib/toast';

// Alta y edición de una documentación mensual (ex vencimiento de RRHH): qué
// es, la fecha, cada cuánto se repite y a quién le suena el celular. La usan
// la lista (/vencimientos) y el detalle (/vencimientos/[id]).

// "Lia Rosa Toledo" -> "LT": la primera y la última palabra.
export const iniciales = (nombre) => {
    const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};

export default function DocumentacionModal({ vencimiento, usuarios, miId, onClose, onGuardado }) {
    const editando = Boolean(vencimiento);
    const [titulo, setTitulo] = useState(vencimiento?.titulo || '');
    const [fecha, setFecha] = useState(vencimiento?.fecha || '');
    // Una nueva arranca en "cada 1 mes": lo normal es la documentación
    // mensual (decidido con el usuario el 2026-10-26).
    const [repite, setRepite] = useState(vencimiento ? Boolean(vencimiento.cada_meses) : true);
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
    const error = !titulo.trim() ? 'Poné qué documentación es.'
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
            notify.success(editando ? 'Guardado.' : 'Documentación cargada.');
            onGuardado(json);
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
                    <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{editando ? 'Editar documentación' : 'Nueva documentación'}</h2>
                    <button className="btn btn-secondary" onClick={onClose} disabled={guardando} style={{ padding: '0.3rem 0.6rem' }}>✕</button>
                </div>

                <div style={{ display: 'grid', gap: '0.85rem', marginTop: '1.1rem' }}>
                    <label style={labelEstilo}>
                        Qué documentación es
                        <input type="text" className="card" style={inputCard} placeholder="FAO ZARA TOM"
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
