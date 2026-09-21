'use client';

import { useEffect, useMemo, useState } from 'react';
import { notify } from '@/lib/toast';

// Cargar vacaciones: los días que se toma y los que cobra, juntos.
//
// Casi siempre es una mezcla —se toma dos semanas y cobra el resto—, así que
// pedir un movimiento por cada cosa obligaría a cargar dos veces a la misma
// persona. Acá se ponen los dos números y el sistema guarda los movimientos que
// correspondan.
//
// Los días tomados llevan fecha porque son una ausencia que hay que cubrir; los
// cobrados no, porque la persona sigue trabajando.

const inputEstilo = {
    padding: '0.5rem 0.65rem', borderRadius: '8px',
    border: '1px solid var(--border-color)', background: 'var(--color-surface)',
    color: 'var(--text-main)', fontSize: '0.9rem',
};

const fmt = (ymd) => {
    if (!ymd) return '—';
    const [a, m, d] = ymd.split('-');
    return `${d}/${m}/${a}`;
};

// Días corridos contando el primero: del 3/11 por 14 días → 16/11, no 17.
function sumarDias(desde, dias) {
    if (!desde || !Number.isFinite(dias) || dias < 1) return null;
    const [a, m, d] = desde.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d + dias - 1)).toISOString().slice(0, 10);
}

export default function VacacionMovimientoModal({ persona, periodo, saldoActual, onClose, onGuardado }) {
    const [tomados, setTomados] = useState('14');
    const [cobrados, setCobrados] = useState('');
    const [desde, setDesde] = useState('');
    const [nota, setNota] = useState('');
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !guardando) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, guardando]);

    const nTomados = Math.max(0, Math.trunc(Number(tomados)) || 0);
    const nCobrados = Math.max(0, Math.trunc(Number(cobrados)) || 0);
    const total = nTomados + nCobrados;
    const hasta = sumarDias(desde, nTomados);
    const saldoDespues = saldoActual - total;

    const error = useMemo(() => {
        if (!total) return 'Poné cuántos días se toma o cuántos cobra.';
        if (nTomados > 0 && !desde) return 'Falta desde qué día se toma las vacaciones.';
        return null;
    }, [total, nTomados, desde]);

    const guardar = async () => {
        setGuardando(true);
        try {
            // Se guardan como movimientos separados aunque se carguen juntos:
            // son cosas distintas (una es ausencia, la otra no) y el detalle
            // tiene que poder mostrarlas por separado.
            const movimientos = [];
            if (nTomados > 0) {
                movimientos.push({ tipo: 'tomado', cantidad: nTomados, fecha_desde: desde });
            }
            if (nCobrados > 0) {
                movimientos.push({ tipo: 'pagado', cantidad: nCobrados, fecha_desde: null });
            }

            for (const m of movimientos) {
                const res = await fetch('/api/vacaciones/movimientos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        employee_id: persona.employee_id,
                        periodo,
                        nota: nota.trim() || null,
                        ...m,
                    }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) { notify.error(json.error || 'No se pudo guardar.'); return; }
            }

            const partes = [];
            if (nTomados) partes.push(`${nTomados} tomados`);
            if (nCobrados) partes.push(`${nCobrados} cobrados`);
            notify.success(`Cargado: ${partes.join(' y ')}.`);
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
            <div className="card" style={{ width: '100%', maxWidth: '480px', padding: '1.25rem', margin: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Cargar vacaciones</h2>
                    <button
                        onClick={onClose}
                        disabled={guardando}
                        style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.3rem', lineHeight: 1 }}
                        title="Cerrar"
                    >
                        ✕
                    </button>
                </div>
                <p style={{ margin: '0 0 1.1rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    {persona.nombre} · le quedan <strong style={{ color: 'var(--text-main)' }}>{saldoActual}</strong> días
                </p>

                {/* Los dos números juntos: casi siempre se toma unos días y cobra
                    el resto, así que pedirlo en dos pasos sería cargar dos veces
                    a la misma persona. */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 140px' }}>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                            Días que se toma
                        </label>
                        <input
                            type="number"
                            min="0"
                            step="1"
                            value={tomados}
                            onChange={(e) => setTomados(e.target.value)}
                            style={{ ...inputEstilo, width: '100%', textAlign: 'right', fontSize: '1.1rem', fontWeight: 700 }}
                        />
                        <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.35rem' }}>
                            {[7, 14, 21].map(n => (
                                <button
                                    key={n}
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', flex: 1 }}
                                    onClick={() => setTomados(String(n))}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div style={{ flex: '1 1 140px' }}>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                            Días que cobra
                        </label>
                        <input
                            type="number"
                            min="0"
                            step="1"
                            value={cobrados}
                            onChange={(e) => setCobrados(e.target.value)}
                            placeholder="0"
                            style={{ ...inputEstilo, width: '100%', textAlign: 'right', fontSize: '1.1rem', fontWeight: 700 }}
                        />
                        {/* El resto del saldo es lo que se suele cobrar. */}
                        {saldoActual - nTomados > 0 && (
                            <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', marginTop: '0.35rem', width: '100%' }}
                                onClick={() => setCobrados(String(saldoActual - nTomados))}
                            >
                                el resto ({saldoActual - nTomados})
                            </button>
                        )}
                    </div>
                </div>

                {nTomados > 0 && (
                    <div style={{ marginBottom: '0.9rem' }}>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                            Desde qué día se las toma
                        </label>
                        <input
                            type="date"
                            value={desde}
                            onChange={(e) => setDesde(e.target.value)}
                            style={inputEstilo}
                        />
                        {hasta && (
                            <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
                                Del <strong>{fmt(desde)}</strong> al <strong>{fmt(hasta)}</strong> · vuelve el{' '}
                                {fmt(sumarDias(hasta, 2))}
                            </p>
                        )}
                    </div>
                )}

                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Nota (opcional)
                    </label>
                    <input
                        type="text"
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        placeholder="Observación"
                        style={{ ...inputEstilo, width: '100%' }}
                    />
                </div>

                {/* Cómo queda el saldo: se ve antes de guardar, no después. */}
                {total > 0 && (
                    <div className="card" style={{ padding: '0.7rem 0.9rem', marginBottom: '1rem', background: 'var(--color-muted-surface)' }}>
                        <span style={{ fontSize: '0.85rem' }}>
                            {saldoActual} − {total} ({nTomados > 0 && `${nTomados} tomados`}
                            {nTomados > 0 && nCobrados > 0 && ' + '}
                            {nCobrados > 0 && `${nCobrados} cobrados`}) ={' '}
                            <strong style={{ color: saldoDespues < 0 ? 'var(--error)' : 'var(--text-main)' }}>
                                {saldoDespues} días
                            </strong>
                            {saldoDespues < 0 && (
                                <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}> · se pasa del saldo</span>
                            )}
                        </span>
                    </div>
                )}

                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={guardar} disabled={guardando || !!error}>
                        {guardando ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button className="btn btn-secondary" onClick={onClose} disabled={guardando}>
                        Cancelar
                    </button>
                    {error && total > 0 && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{error}</span>
                    )}
                </div>
            </div>
        </div>
    );
}
