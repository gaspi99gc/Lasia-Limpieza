'use client';

import { useEffect, useRef, useState } from 'react';

export default function SearchableSelect({ options, value, onChange, placeholder = 'Seleccioná una opción', searchPlaceholder = 'Buscar...', disabled = false, minChars = 0 }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef(null);
    const searchRef = useRef(null);

    const selected = options.find(o => String(o.value) === String(value));

    const filtered = options.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase())
    );

    useEffect(() => {
        if (open && searchRef.current) {
            searchRef.current.focus();
        }
    }, [open]);

    useEffect(() => {
        function handleOutside(e) {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
                setSearch('');
            }
        }
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, []);

    const handleSelect = (val) => {
        onChange(val);
        setOpen(false);
        setSearch('');
    };

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setOpen(v => !v)}
                style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.6rem 2rem 0.6rem 0.85rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    background: disabled ? 'var(--color-muted-surface)' : 'var(--color-surface)',
                    color: selected ? 'var(--text-main)' : 'var(--text-muted)',
                    fontSize: '0.95rem',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    position: 'relative',
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'border-color 0.15s',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}
            >
                {selected ? selected.label : placeholder}
                <span style={{
                    position: 'absolute',
                    right: '0.7rem',
                    top: '50%',
                    transform: `translateY(-50%) rotate(${open ? '180deg' : '0deg'})`,
                    transition: 'transform 0.2s',
                    color: 'var(--text-muted)',
                    fontSize: '0.75rem',
                    pointerEvents: 'none',
                }}>▾</span>
            </button>

            {open && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    zIndex: 200,
                    background: 'var(--color-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-lg)',
                    overflow: 'hidden',
                }}>
                    <div style={{ padding: '0.5rem' }}>
                        <input
                            ref={searchRef}
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={searchPlaceholder}
                            style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '0.9rem',
                                background: 'var(--color-muted-surface)',
                                color: 'var(--text-main)',
                                outline: 'none',
                            }}
                        />
                    </div>
                    <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                        {value && (
                            <div
                                onMouseDown={() => handleSelect('')}
                                style={{
                                    padding: '0.55rem 0.85rem',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    color: 'var(--text-muted)',
                                    borderBottom: '1px solid var(--border-color)',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-muted-surface)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                                — {placeholder}
                            </div>
                        )}
                        {minChars > 0 && search.length < minChars ? (
                            <div style={{ padding: '0.75rem 0.85rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                Escribí al menos {minChars} caracteres
                            </div>
                        ) : filtered.length === 0 ? (
                            <div style={{ padding: '0.75rem 0.85rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                Sin resultados
                            </div>
                        ) : filtered.map(o => (
                            <div
                                key={o.value}
                                onMouseDown={() => handleSelect(String(o.value))}
                                style={{
                                    padding: '0.55rem 0.85rem',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: String(o.value) === String(value) ? 600 : 400,
                                    background: String(o.value) === String(value) ? 'var(--color-primary-light)' : 'transparent',
                                    color: String(o.value) === String(value) ? 'var(--color-primary-hover)' : 'var(--text-main)',
                                }}
                                onMouseEnter={e => { if (String(o.value) !== String(value)) e.currentTarget.style.background = 'var(--color-muted-surface)'; }}
                                onMouseLeave={e => { if (String(o.value) !== String(value)) e.currentTarget.style.background = 'transparent'; }}
                            >
                                {o.label}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
