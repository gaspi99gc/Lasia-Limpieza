'use client';

import { useEffect, useMemo, useState } from 'react';
import { notify } from '@/lib/toast';

// Cada cuántos meses se renueva cada prenda. Lo carga RRHH; con esto la pestaña
// Renovaciones sabe a quién le toca uniforme nuevo.
//
// Una fila por prenda (no por talle): el plazo es de la camisa, no del talle L.
// Vacío = esa prenda no se renueva.

const inputEstilo = {
    padding: '0.45rem 0.6rem', borderRadius: '8px',
    border: '1px solid var(--border-color)', background: 'var(--color-surface)',
    color: 'var(--text-main)', fontSize: '0.9rem', width: '5rem', textAlign: 'right',
};

export default function PlazosRenovacionModal({ prendas, onClose, onGuardado }) {
    // Una entrada por nombre de prenda, con el plazo que ya tenga cualquiera de
    // sus talles.
    const iniciales = useMemo(() => {
        const mapa = new Map();
        for (const p of prendas) {
            if (!p.activo) continue;
            const meses = Number(p.meses_renovacion) > 0 ? String(p.meses_renovacion) : '';
            if (!mapa.has(p.prenda) || (!mapa.get(p.prenda) && meses)) mapa.set(p.prenda, meses);
        }
        return [...mapa].map(([prenda, meses]) => ({ prenda, meses }))
            .sort((a, b) => a.prenda.localeCompare(b.prenda, 'es'));
    }, [prendas]);

    const [valores, setValores] = useState(() => Object.fromEntries(iniciales.map((i) => [i.prenda, i.meses])));
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !guardando) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, guardando]);

    const guardar = async () => {
        // Solo lo que cambió.
        const plazos = iniciales
            .filter((i) => (valores[i.prenda] || '') !== i.meses)
            .map((i) => ({ prenda: i.prenda, meses: valores[i.prenda] === '' ? null : Number(valores[i.prenda]) }));
        if (!plazos.length) { onClose(); return; }
        setGuardando(true);
        try {
            const res = await fetch('/api/uniformes/prendas/renovacion', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ plazos }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(j.error || 'No se pudo guardar.'); return; }
            notify.success('Plazos de renovación guardados.');
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
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto',
            }}
        >
            <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '1.25rem', margin: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Plazos de renovación</h2>
                    <button
                        onClick={onClose}
                        disabled={guardando}
                        style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.3rem', lineHeight: 1 }}
                        title="Cerrar"
                    >
                        ✕
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.1rem' }}>
                    {iniciales.map((i) => (
                        <div key={i.prenda} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{ flex: 1, fontWeight: 600 }}>{i.prenda}</span>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>cada</span>
                            <input
                                type="number"
                                min="1"
                                max="60"
                                step="1"
                                value={valores[i.prenda] ?? ''}
                                onChange={(e) => setValores((v) => ({ ...v, [i.prenda]: e.target.value }))}
                                placeholder="—"
                                style={inputEstilo}
                            />
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', width: '3.5rem' }}>meses</span>
                        </div>
                    ))}
                </div>
                <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Vacío = esa prenda no se renueva.
                </p>

                <div style={{ display: 'flex', gap: '0.6rem' }}>
                    <button className="btn btn-primary" onClick={guardar} disabled={guardando} style={{ fontWeight: 700 }}>
                        {guardando ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button className="btn btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
                </div>
            </div>
        </div>
    );
}
