'use client';

import { useMemo, useState } from 'react';
import SearchableSelect from './SearchableSelect';
import { notify } from '@/lib/toast';

// Registrar una falta. Avisa el propio operario, así que esto se carga con la
// persona al teléfono: tiene que salir en segundos. Se elige el nombre y el
// resto (servicio y horas) lo completa el operativo del día; el motivo son
// botones grandes, no un desplegable.

const MOTIVOS = [
    { key: 'enfermedad', label: 'Enfermedad', emoji: '🤒' },
    { key: 'personal', label: 'Tema personal', emoji: '🏠' },
    { key: 'accidente', label: 'Accidente', emoji: '🚑' },
    { key: 'sin_aviso', label: 'No avisó', emoji: '❌' },
    { key: 'sin_especificar', label: 'No lo dijo', emoji: '🤷' },
];

const fmtHora = (h) => (h === null || h === undefined ? '' : String(Number(h)).replace('.', ','));
const fmtFecha = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

export default function FaltaModal({ fecha, puestos, celdasPorPuesto, onClose, onGuardada }) {
    const [puestoId, setPuestoId] = useState('');
    const [motivo, setMotivo] = useState('');
    const [nota, setNota] = useState('');
    const [horas, setHoras] = useState('');
    const [guardando, setGuardando] = useState(false);

    // Solo la gente que ese día tenía que trabajar: es entre esos que puede
    // haber una falta, y acorta muchísimo la lista.
    const opciones = useMemo(() => {
        return puestos
            .filter(p => p.nombre_excel && p.tipo !== 'vacante')
            .filter(p => {
                const c = celdasPorPuesto[p.id]?.[fecha];
                return c && (c.hi !== null || c.he !== null);
            })
            .map(p => ({
                value: String(p.id),
                label: `${p.nombre_excel} — ${p.servicio_excel}`,
            }))
            .sort((a, b) => a.label.localeCompare(b.label, 'es'));
    }, [puestos, celdasPorPuesto, fecha]);

    const puesto = puestos.find(p => String(p.id) === puestoId) || null;
    const celda = puesto ? celdasPorPuesto[puesto.id]?.[fecha] : null;
    const horasPrevistas = celda && celda.hi != null && celda.he != null
        ? Math.round((Number(celda.he) - Number(celda.hi)) * 100) / 100
        : null;

    const guardar = async () => {
        if (!puestoId) { notify.error('Elegí quién faltó.'); return; }
        setGuardando(true);
        try {
            const res = await fetch('/api/operativo/faltas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    fecha,
                    puesto_id: Number(puestoId),
                    motivo: motivo || 'sin_especificar',
                    nota,
                    horas: horas === '' ? undefined : Number(horas),
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(json.error || 'No se pudo registrar la falta.'); return; }
            notify.success(`Falta registrada: ${puesto?.nombre_excel}.`);
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
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '540px' }}>
                <h2 style={{ marginBottom: '0.25rem' }}>Registrar falta</h2>
                <p style={{ margin: '0 0 1.25rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    Del <strong>{fmtFecha(fecha)}</strong> · {opciones.length} personas tenían que trabajar
                </p>

                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem' }}>
                    ¿Quién faltó?
                </label>
                <SearchableSelect
                    options={opciones}
                    value={puestoId}
                    onChange={setPuestoId}
                    placeholder="Buscá por nombre o servicio…"
                    searchPlaceholder="Escribí las primeras letras…"
                />

                {/* Al elegir la persona ya sabemos dónde y cuántas horas: no hay
                    que escribir nada más para el caso normal. */}
                {puesto && (
                    <div style={{ marginTop: '0.9rem', padding: '0.85rem 1rem', borderRadius: '8px', background: 'var(--color-muted-surface)', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{puesto.nombre_excel}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            {puesto.servicio_excel}
                        </div>
                        <div style={{ fontSize: '0.88rem', marginTop: '0.45rem' }}>
                            Tenía que trabajar de <strong>{fmtHora(celda?.hi)}</strong> a <strong>{fmtHora(celda?.he)}</strong>
                            {horasPrevistas != null && <> · <strong>{fmtHora(horasPrevistas)} horas</strong></>}
                        </div>
                        {!puesto.employee_id && (
                            <div style={{ fontSize: '0.78rem', color: '#B45309', marginTop: '0.4rem' }}>
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
                        Agregar una nota o corregir las horas
                    </summary>
                    <div style={{ marginTop: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                Horas perdidas {horasPrevistas != null && `(por defecto ${fmtHora(horasPrevistas)})`}
                            </label>
                            <input
                                type="number" step="0.5" min="0" max="24"
                                value={horas}
                                onChange={e => setHoras(e.target.value)}
                                placeholder={horasPrevistas != null ? String(horasPrevistas) : 'Ej: 8'}
                                style={{ width: '140px' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Nota</label>
                            <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} placeholder="Lo que haya dicho, o cualquier detalle…" style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
                        </div>
                    </div>
                </details>

                <div className="config-modal-actions" style={{ marginTop: '1.5rem' }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                    <button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando || !puestoId}>
                        {guardando ? 'Guardando…' : 'Registrar falta'}
                    </button>
                </div>
            </div>
        </div>
    );
}
