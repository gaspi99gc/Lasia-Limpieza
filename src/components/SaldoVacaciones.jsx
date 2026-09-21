'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// Saldo de vacaciones dentro del legajo.
//
// Es donde se mira cuando alguien pregunta "¿cuántos días me quedan?". Solo
// lectura: cargar días se hace desde la pantalla de vacaciones, que es donde
// está el formulario con las validaciones.
//
// Si la persona no llega al año de antigüedad no le corresponden días todavía,
// y la tarjeta no se muestra: un "0 días" sin contexto se lee como un error.

export default function SaldoVacaciones({ empleadoId }) {
    const [fila, setFila] = useState(null);
    const [listo, setListo] = useState(false);

    useEffect(() => {
        if (!empleadoId) return;
        let vivo = true;
        fetch('/api/vacaciones', { credentials: 'include' })
            .then(r => (r.ok ? r.json() : null))
            .then(j => {
                if (!vivo) return;
                setFila((j?.filas || []).find(f => String(f.employee_id) === String(empleadoId)) || null);
            })
            // Sin ruido si falla: es un dato secundario dentro del legajo.
            .catch(() => {})
            .finally(() => { if (vivo) setListo(true); });
        return () => { vivo = false; };
    }, [empleadoId]);

    if (!listo || !fila || !fila.dias) return null;

    const color = fila.saldo < 0 ? 'var(--error)' : fila.saldo === 0 ? 'var(--text-muted)' : '#15803D';

    return (
        <div className="card" style={{ padding: '1rem 1.25rem', marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
            <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Vacaciones {new Date().getFullYear()}
                </div>
                <div style={{ marginTop: '0.3rem', fontSize: '0.92rem' }}>
                    Le corresponden <strong>{fila.dias}</strong>
                    {fila.arrastre > 0 && <> + <strong>{fila.arrastre}</strong> del año anterior</>}
                    {' · '}usó <strong>{fila.usados}</strong>
                </div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1, color }}>{fila.saldo}</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    {fila.saldo < 0 ? 'días de más' : 'días pendientes'}
                </div>
            </div>
            <Link href={`/vacaciones/${empleadoId}`} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
                Ver detalle
            </Link>
        </div>
    );
}
