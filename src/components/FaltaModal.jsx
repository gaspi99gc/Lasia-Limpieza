'use client';

import { useMemo, useState } from 'react';
import SearchableSelect from './SearchableSelect';
import { notify } from '@/lib/toast';

// Registrar una falta. Avisa el propio operario, así que esto se carga con la
// persona al teléfono: tiene que salir en segundos.
//
// Se busca por PERSONA, no por puesto. Mucha gente hace más de un turno el mismo
// día (jornada partida, dos servicios, o un adicional fijo aparte), y si no
// viene falta a todos: se marcan de una sola vez y el sistema crea una falta por
// turno. Cargarlas de a una era el trabajo de más que queremos sacar.

const MOTIVOS = [
    { key: 'enfermedad', label: 'Enfermedad', emoji: '🤒' },
    { key: 'personal', label: 'Tema personal', emoji: '🏠' },
    { key: 'accidente', label: 'Accidente', emoji: '🚑' },
    { key: 'sin_aviso', label: 'No avisó', emoji: '❌' },
    { key: 'sin_especificar', label: 'No lo dijo', emoji: '🤷' },
];

const fmtHora = (h) => (h === null || h === undefined ? '' : String(Number(h)).replace('.', ','));
const fmtFecha = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const normNombre = (s) => String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();

// El nombre "de la persona", sin el prefijo del concepto de pago: la fila
// "ADICIONAL FIJO - GODOY GUSTAVO" es el mismo GODOY, no otro empleado.
const nombreLimpio = (s) => String(s || '')
    .replace(/^.*?(ADICIONAL(\s+FIJO)?|EXTRA)\s*[-:]?\s*/i, '')
    .replace(/\/.*$/, '')
    .trim();

export default function FaltaModal({ fecha, puestos, celdasPorPuesto, onClose, onGuardada }) {
    const [personaKey, setPersonaKey] = useState('');
    const [turnosSel, setTurnosSel] = useState(() => new Set());
    const [motivo, setMotivo] = useState('');
    const [nota, setNota] = useState('');
    const [horas, setHoras] = useState('');
    const [guardando, setGuardando] = useState(false);

    // Personas que ese día tenían que trabajar, con TODOS sus turnos juntos.
    const personas = useMemo(() => {
        const map = new Map();
        for (const p of puestos) {
            if (!p.nombre_excel || p.tipo === 'vacante') continue;
            const celda = celdasPorPuesto[p.id]?.[fecha];
            if (!celda || (celda.hi === null && celda.he === null)) continue;

            // Se agrupa por legajo cuando existe; si no, por el nombre limpio.
            const limpio = nombreLimpio(p.nombre_excel);
            const key = p.employee_id ? `emp:${p.employee_id}` : `nom:${normNombre(limpio)}`;
            if (!map.has(key)) {
                map.set(key, { key, nombre: limpio || p.nombre_excel, employee_id: p.employee_id, turnos: [] });
            }
            map.get(key).turnos.push({
                puesto_id: p.id,
                servicio: p.servicio_excel,
                tipo: p.tipo,
                hi: celda.hi,
                he: celda.he,
                horas: (celda.hi != null && celda.he != null)
                    ? Math.round((Number(celda.he) - Number(celda.hi)) * 100) / 100
                    : null,
            });
        }
        for (const p of map.values()) p.turnos.sort((a, b) => (a.hi ?? 0) - (b.hi ?? 0));
        return map;
    }, [puestos, celdasPorPuesto, fecha]);

    const opciones = useMemo(() => [...personas.values()]
        .map(p => ({
            value: p.key,
            label: p.turnos.length > 1
                ? `${p.nombre} (${p.turnos.length} turnos)`
                : `${p.nombre} — ${p.turnos[0].servicio}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')), [personas]);

    const persona = personas.get(personaKey) || null;

    // Al elegir a alguien se marcan todos sus turnos: lo normal es que no venga
    // en todo el día. Si faltó a uno solo, se destilda.
    const elegirPersona = (key) => {
        setPersonaKey(key);
        const p = personas.get(key);
        setTurnosSel(new Set(p ? p.turnos.map(t => t.puesto_id) : []));
        setHoras('');
    };

    const toggleTurno = (puestoId) => {
        setTurnosSel(prev => {
            const next = new Set(prev);
            if (next.has(puestoId)) next.delete(puestoId); else next.add(puestoId);
            return next;
        });
    };

    const turnosMarcados = persona ? persona.turnos.filter(t => turnosSel.has(t.puesto_id)) : [];
    const horasTotales = turnosMarcados.reduce((a, t) => a + (t.horas || 0), 0);

    const guardar = async () => {
        if (!persona) { notify.error('Elegí quién faltó.'); return; }
        if (!turnosMarcados.length) { notify.error('Marcá al menos un turno.'); return; }
        setGuardando(true);
        try {
            const res = await fetch('/api/operativo/faltas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    fecha,
                    puesto_ids: turnosMarcados.map(t => t.puesto_id),
                    motivo: motivo || 'sin_especificar',
                    nota,
                    horas: (turnosMarcados.length === 1 && horas !== '') ? Number(horas) : undefined,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(json.error || 'No se pudo registrar la falta.'); return; }

            const n = json.creadas?.length || 0;
            notify.success(
                n === 1
                    ? `Falta registrada: ${persona.nombre}.`
                    : `${n} turnos registrados para ${persona.nombre}.`
            );
            if (json.yaEstaban?.length) {
                notify.error(`Ya estaban cargados: ${json.yaEstaban.join(', ')}`);
            }
            onGuardada?.(json);
            onClose();
        } catch {
            notify.error('Error de red al registrar la falta.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
                <h2 style={{ marginBottom: '0.25rem' }}>Registrar falta</h2>
                <p style={{ margin: '0 0 1.25rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    Del <strong>{fmtFecha(fecha)}</strong> · {personas.size} personas tenían que trabajar
                </p>

                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem' }}>
                    ¿Quién faltó?
                </label>
                <SearchableSelect
                    options={opciones}
                    value={personaKey}
                    onChange={elegirPersona}
                    placeholder="Buscá por nombre…"
                    searchPlaceholder="Escribí las primeras letras…"
                />

                {persona && (
                    <div style={{ marginTop: '0.9rem' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.45rem', flexWrap: 'wrap' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {persona.turnos.length > 1 ? '¿A qué turnos faltó?' : 'Turno'}
                            </label>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                {turnosMarcados.length} de {persona.turnos.length} · <strong style={{ color: 'var(--text-main)' }}>{fmtHora(horasTotales)} horas</strong>
                            </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {persona.turnos.map(t => {
                                const marcado = turnosSel.has(t.puesto_id);
                                return (
                                    <button
                                        key={t.puesto_id}
                                        type="button"
                                        onClick={() => toggleTurno(t.puesto_id)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.7rem', width: '100%',
                                            textAlign: 'left', cursor: 'pointer', font: 'inherit',
                                            padding: '0.6rem 0.8rem', borderRadius: '8px',
                                            border: marcado ? '2px solid var(--color-primary)' : '1px solid var(--border-color)',
                                            background: marcado ? 'var(--color-primary-light)' : 'var(--color-surface)',
                                            color: 'var(--text-main)',
                                        }}
                                    >
                                        <span style={{ fontSize: '1.05rem' }}>{marcado ? '☑' : '☐'}</span>
                                        <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                                            {fmtHora(t.hi)} a {fmtHora(t.he)}
                                        </span>
                                        <span style={{ flex: 1, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {t.servicio}
                                        </span>
                                        {t.tipo !== 'titular' && (
                                            <span className="op-tag op-tag-extra">{t.tipo === 'adicional_fijo' ? 'ADIC' : 'EXTRA'}</span>
                                        )}
                                        {t.horas != null && (
                                            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtHora(t.horas)} hs</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {!persona.employee_id && (
                            <div style={{ fontSize: '0.78rem', color: '#B45309', marginTop: '0.5rem' }}>
                                Ojo: este nombre no coincide con ningún legajo.
                            </div>
                        )}
                    </div>
                )}

                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '1.1rem 0 0.4rem' }}>
                    ¿Por qué? <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional)</span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {MOTIVOS.map(m => (
                        <button
                            key={m.key}
                            type="button"
                            onClick={() => setMotivo(motivo === m.key ? '' : m.key)}
                            className={`btn ${motivo === m.key ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}
                        >
                            {m.emoji} {m.label}
                        </button>
                    ))}
                </div>

                <details style={{ marginTop: '1.1rem' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Agregar una nota{turnosMarcados.length === 1 ? ' o corregir las horas' : ''}
                    </summary>
                    <div style={{ marginTop: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                        {/* Con varios turnos no se pueden forzar las horas: no habría
                            forma de saber a cuál corresponde el número. */}
                        {turnosMarcados.length === 1 && (
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                    Horas perdidas (por defecto {fmtHora(turnosMarcados[0].horas)})
                                </label>
                                <input
                                    type="number" step="0.5" min="0" max="24"
                                    value={horas}
                                    onChange={e => setHoras(e.target.value)}
                                    placeholder={String(turnosMarcados[0].horas ?? '')}
                                    style={{ width: '140px' }}
                                />
                            </div>
                        )}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Nota</label>
                            <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} placeholder="Lo que haya dicho, o cualquier detalle…" style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
                        </div>
                    </div>
                </details>

                <div className="config-modal-actions" style={{ marginTop: '1.5rem' }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                    <button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando || !turnosMarcados.length}>
                        {guardando
                            ? 'Guardando…'
                            : turnosMarcados.length > 1
                                ? `Registrar ${turnosMarcados.length} turnos`
                                : 'Registrar falta'}
                    </button>
                </div>
            </div>
        </div>
    );
}
