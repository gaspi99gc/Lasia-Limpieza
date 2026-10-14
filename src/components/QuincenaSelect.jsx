'use client';

import { useState } from 'react';
import { quincenasDe, sumarDias, fmtFecha } from '@/lib/quincenas-vacaciones';

// Elegir una quincena del calendario de la empresa en vez de tipear una fecha.
// "Otra fecha" queda como escape para quien no encaja en el calendario.

const inputEstilo = {
    padding: '0.5rem 0.65rem', borderRadius: '8px',
    border: '1px solid var(--border-color)', background: 'var(--color-surface)',
    color: 'var(--text-main)', fontSize: '0.9rem',
};

const OTRA = '__otra__';

/**
 * @param {number}   periodo   año del calendario
 * @param {string}   value     fecha de inicio elegida (YYYY-MM-DD) o ''
 * @param {function} onChange  recibe la fecha de inicio
 * @param {number}   dias      para mostrar hasta cuándo y cuándo vuelve
 * @param {string}   vacio     texto de la opción vacía
 * @param {string}   excluir   fecha que no se puede elegir (la 1ª opción, en la 2ª)
 */
export default function QuincenaSelect({ periodo, value, onChange, dias, vacio = 'Elegí una quincena…', excluir = null }) {
    const quincenas = quincenasDe(periodo);
    const enLista = quincenas.some(q => q.desde === value);
    // Arranca en "otra fecha" si ya viene una fecha que no está en el calendario.
    const [libre, setLibre] = useState(!!value && !enLista);
    const hasta = sumarDias(value, dias);

    return (
        <div>
            <select
                value={libre ? OTRA : (enLista ? value : '')}
                onChange={(e) => {
                    if (e.target.value === OTRA) { setLibre(true); onChange(''); return; }
                    setLibre(false);
                    onChange(e.target.value);
                }}
                style={{ ...inputEstilo, width: '100%' }}
            >
                <option value="">{vacio}</option>
                {quincenas.map(q => (
                    <option key={q.desde} value={q.desde} disabled={q.desde === excluir}>
                        {q.nombre} ({fmtFecha(q.desde).slice(0, 5)} al {fmtFecha(sumarDias(q.desde, 14)).slice(0, 5)}){q.desde === excluir ? ' — ya es la 1ª opción' : ''}
                    </option>
                ))}
                <option value={OTRA}>Otra fecha…</option>
            </select>
            {libre && (
                <input
                    type="date"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    style={{ ...inputEstilo, marginTop: '0.4rem' }}
                />
            )}
            {hasta && (
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Del <strong>{fmtFecha(value)}</strong> al <strong>{fmtFecha(hasta)}</strong> · vuelve el{' '}
                    {fmtFecha(sumarDias(hasta, 2))}
                </p>
            )}
        </div>
    );
}
