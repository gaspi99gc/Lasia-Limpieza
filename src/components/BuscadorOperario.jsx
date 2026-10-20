'use client';

import { useEffect, useRef, useState } from 'react';

// Elegir un operario del legajo escribiendo apellido, nombre o legajo.
//
// Busca en el servidor desde 3 letras (el legajo tiene más de mil personas:
// traerlo entero cada vez tardaba). Muestra el legajo y el servicio de cada
// uno, porque hay homónimos (dos TORRES GUSTAVO).

const inputEstilo = {
    padding: '0.5rem 0.65rem', borderRadius: '8px',
    border: '1px solid var(--border-color)', background: 'var(--color-surface)',
    color: 'var(--text-main)', fontSize: '0.9rem', width: '100%',
};

const nombre = (o) => `${o.apellido} ${o.nombre}`.trim();

/**
 * @param {object|null} value      el operario elegido ({ id, apellido, nombre, legajo, ... })
 * @param {function}    onChange   recibe el operario, o null al cambiarlo
 * @param {string}      url        endpoint de búsqueda (recibe ?q=)
 * @param {string}      placeholder
 */
export default function BuscadorOperario({ value, onChange, url, placeholder = 'Apellido, nombre o legajo…', autoFocus = false }) {
    const [q, setQ] = useState('');
    const [resultados, setResultados] = useState([]);
    const [buscando, setBuscando] = useState(false);
    const pedido = useRef(0);

    useEffect(() => {
        const texto = q.trim();
        if (texto.replace(/\s/g, '').length < 3) { setResultados([]); return; }
        const n = ++pedido.current;
        const t = setTimeout(async () => {
            setBuscando(true);
            try {
                const sep = url.includes('?') ? '&' : '?';
                const res = await fetch(`${url}${sep}q=${encodeURIComponent(texto)}`, { credentials: 'include' });
                const json = await res.json().catch(() => []);
                // Solo vale la respuesta de lo último que se escribió.
                if (n === pedido.current) setResultados(Array.isArray(json) ? json : []);
            } finally {
                if (n === pedido.current) setBuscando(false);
            }
        }, 250);
        return () => clearTimeout(t);
    }, [q, url]);

    if (value) {
        return (
            <div style={{ ...inputEstilo, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 700 }}>{nombre(value)}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    {value.legajo && `leg ${value.legajo}`}
                    {value.servicio_nombre && ` · ${value.servicio_nombre}`}
                    {value.fecha_baja && ' · de baja'}
                </span>
                <button
                    type="button"
                    onClick={() => { onChange(null); setQ(''); setResultados([]); }}
                    style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontSize: '0.82rem' }}
                >
                    cambiar
                </button>
            </div>
        );
    }

    const texto = q.trim();
    return (
        <div>
            <input
                type="text"
                value={q}
                autoFocus={autoFocus}
                onChange={(e) => setQ(e.target.value)}
                placeholder={placeholder}
                style={inputEstilo}
            />
            {texto.length >= 3 && (
                <div style={{
                    marginTop: '0.3rem', border: '1px solid var(--border-color)', borderRadius: '8px',
                    maxHeight: '200px', overflowY: 'auto',
                }}>
                    {resultados.map((o) => (
                        <button
                            type="button"
                            key={o.id}
                            onClick={() => onChange(o)}
                            style={{
                                width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer',
                                border: 'none', background: 'none', padding: '0.45rem 0.65rem',
                                display: 'flex', gap: '0.5rem', alignItems: 'baseline',
                                borderBottom: '1px solid var(--border-color)', color: 'var(--text-main)',
                            }}
                        >
                            <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{nombre(o)}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                {o.legajo && `leg ${o.legajo}`}
                                {o.servicio_nombre && ` · ${o.servicio_nombre}`}
                            </span>
                            {o.fecha_baja && (
                                <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700, color: '#B45309' }}>de baja</span>
                            )}
                        </button>
                    ))}
                    {!resultados.length && (
                        <div style={{ padding: '0.6rem 0.65rem', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                            {buscando ? 'Buscando…' : 'Nadie coincide en el legajo.'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
