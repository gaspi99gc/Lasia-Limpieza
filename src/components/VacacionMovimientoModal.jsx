'use client';

import { useEffect, useMemo, useState } from 'react';
import { notify } from '@/lib/toast';

// Cargar días de vacaciones: tomados, pagados en efectivo o un ajuste.
//
// Se pide la FECHA DE INICIO y la CANTIDAD de días, no las dos puntas. Elegir
// dos fechas a mano es lo que produjo las cargas viejas de 8, 15 y 4 días, que
// no cuadran con semanas completas. Con los botones de 1 y 2 semanas, el caso
// normal es un toque.

const TIPOS = [
    { v: 'tomado', label: 'Se las toma', ayuda: 'Se ausenta esos días' },
    { v: 'pagado', label: 'Las cobra', ayuda: 'No se ausenta, pero descuenta igual del saldo' },
    { v: 'ajuste', label: 'Ajuste', ayuda: 'Corrección manual; acepta negativo' },
];

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
    const [tipo, setTipo] = useState('tomado');
    const [cantidad, setCantidad] = useState('14');
    const [desde, setDesde] = useState('');
    const [nota, setNota] = useState('');
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !guardando) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, guardando]);

    const dias = Math.trunc(Number(cantidad)) || 0;
    const hasta = tipo === 'tomado' ? sumarDias(desde, dias) : null;
    const saldoDespues = saldoActual - dias;

    const puedeGuardar = useMemo(() => {
        if (!dias) return false;
        if (dias < 0 && tipo !== 'ajuste') return false;
        if (tipo === 'tomado' && !desde) return false;
        return true;
    }, [dias, tipo, desde]);

    const guardar = async () => {
        setGuardando(true);
        try {
            const res = await fetch('/api/vacaciones/movimientos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    employee_id: persona.employee_id,
                    periodo,
                    tipo,
                    cantidad: dias,
                    fecha_desde: tipo === 'tomado' ? desde : null,
                    nota: nota.trim() || null,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(json.error || 'No se pudo guardar.'); return; }
            notify.success(`${dias} día${dias === 1 ? '' : 's'} registrado${dias === 1 ? '' : 's'}.`);
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
                <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    {persona.nombre} · le quedan <strong style={{ color: 'var(--text-main)' }}>{saldoActual}</strong> días
                </p>

                <div style={{ marginBottom: '0.9rem' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Qué pasó
                    </label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {TIPOS.map(t => (
                            <button
                                key={t.v}
                                type="button"
                                onClick={() => setTipo(t.v)}
                                style={{
                                    flex: 1, padding: '0.55rem 0.3rem', borderRadius: '8px', cursor: 'pointer',
                                    border: `1px solid ${tipo === t.v ? 'var(--color-primary)' : 'var(--border-color)'}`,
                                    background: tipo === t.v ? 'var(--color-primary)' : 'var(--color-surface)',
                                    color: tipo === t.v ? '#fff' : 'var(--text-main)',
                                    fontWeight: tipo === t.v ? 700 : 500, fontSize: '0.85rem',
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                        {TIPOS.find(t => t.v === tipo)?.ayuda}
                    </p>
                </div>

                <div style={{ marginBottom: '0.9rem' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Cuántos días
                    </label>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                            type="number"
                            step="1"
                            value={cantidad}
                            onChange={(e) => setCantidad(e.target.value)}
                            style={{ ...inputEstilo, width: '5.5rem', textAlign: 'right' }}
                        />
                        {/* Casi siempre son una o dos semanas: que sea un toque. */}
                        {[7, 14, 21].map(n => (
                            <button
                                key={n}
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}
                                onClick={() => setCantidad(String(n))}
                            >
                                {n === 7 ? '1 semana' : n === 14 ? '2 semanas' : '3 semanas'}
                            </button>
                        ))}
                    </div>
                </div>

                {tipo === 'tomado' && (
                    <div style={{ marginBottom: '0.9rem' }}>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                            Desde qué día
                        </label>
                        <input
                            type="date"
                            value={desde}
                            onChange={(e) => setDesde(e.target.value)}
                            style={inputEstilo}
                        />
                        {hasta && (
                            <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
                                Del <strong>{fmt(desde)}</strong> al <strong>{fmt(hasta)}</strong> · se reincorpora el{' '}
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
                        placeholder={tipo === 'ajuste' ? 'Por qué se corrige' : 'Observación'}
                        style={{ ...inputEstilo, width: '100%' }}
                    />
                </div>

                {/* Cómo queda el saldo: se ve antes de guardar, no después. */}
                {!!dias && (
                    <div className="card" style={{ padding: '0.7rem 0.9rem', marginBottom: '1rem', background: 'var(--color-muted-surface)' }}>
                        <span style={{ fontSize: '0.85rem' }}>
                            {saldoActual} − {dias} = <strong style={{ color: saldoDespues < 0 ? 'var(--error)' : 'var(--text-main)' }}>
                                {saldoDespues} días
                            </strong>
                            {saldoDespues < 0 && (
                                <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}> · queda en negativo</span>
                            )}
                        </span>
                    </div>
                )}

                <div style={{ display: 'flex', gap: '0.6rem' }}>
                    <button className="btn btn-primary" onClick={guardar} disabled={guardando || !puedeGuardar}>
                        {guardando ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button className="btn btn-secondary" onClick={onClose} disabled={guardando}>
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
}
