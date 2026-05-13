'use client';

import { useState, useEffect, useRef } from 'react';
import MainLayout from '@/components/MainLayout';

function ToggleSwitch({ checked, onChange, disabled }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            style={{
                width: '40px', height: '22px', borderRadius: '999px', border: 'none',
                background: checked ? '#00AEEF' : '#E2E8F0',
                position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'background 0.18s', flexShrink: 0, padding: 0,
            }}
        >
            <span style={{
                position: 'absolute', top: '3px', left: checked ? '21px' : '3px',
                width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.18)', transition: 'left 0.18s', display: 'block',
            }} />
        </button>
    );
}

function MachineRow({ machine, onEdit, onToggleActive }) {
    const [toggling, setToggling] = useState(false);

    const handleToggle = async (val) => {
        setToggling(true);
        await onToggleActive(machine, val);
        setToggling(false);
    };

    return (
        <div
            style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.95rem 1.5rem', borderBottom: '1px solid var(--border-color)', transition: 'background 0.12s', background: 'transparent' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-muted-surface)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
            <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{machine.nombre}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                <span style={{ fontSize: '0.82rem', color: machine.activo !== false ? 'var(--success)' : 'var(--text-muted)', fontWeight: 500, minWidth: '50px', textAlign: 'right' }}>
                    {machine.activo !== false ? 'Activa' : 'Inactiva'}
                </span>
                <ToggleSwitch checked={machine.activo !== false} onChange={handleToggle} disabled={toggling} />
            </div>
            <button
                onClick={() => onEdit(machine)}
                style={{ border: '1px solid var(--border-color)', background: 'var(--color-surface)', borderRadius: '8px', padding: '0.38rem 0.85rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', cursor: 'pointer', flexShrink: 0, transition: 'border-color 0.12s, color 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#00AEEF'; e.currentTarget.style.color = '#00AEEF'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-main)'; }}
            >
                Editar
            </button>
        </div>
    );
}

function MachineDrawer({ machine, onClose, onSaved }) {
    const isNew = !machine?.id;
    const [nombre, setNombre] = useState(machine?.nombre || '');
    const [activo, setActivo] = useState(machine?.activo !== false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, []);

    const handleSave = async () => {
        if (!nombre.trim()) { setError('Ingresá el nombre de la máquina.'); return; }
        setSaving(true);
        setError('');
        try {
            const url = isNew ? '/api/machines' : `/api/machines/${machine.id}`;
            const method = isNew ? 'POST' : 'PUT';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: nombre.trim(), activo }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setError(data.error || 'Error al guardar.'); return; }
            onSaved();
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/machines/${machine.id}`, { method: 'DELETE' });
            if (res.ok) onSaved();
            else setError('No se pudo eliminar la máquina.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 50, animation: 'fadeIn 0.18s ease-out' }} />
            <div style={{
                position: 'fixed', top: 0, right: 0, bottom: 0,
                width: 'min(400px, 100vw)',
                background: 'var(--color-surface)',
                boxShadow: '0 0 40px rgba(0,0,0,0.18)',
                zIndex: 51, display: 'flex', flexDirection: 'column',
                animation: 'slideInDrawer 0.22s cubic-bezier(.2,.8,.2,1)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                        {isNew ? 'Nueva máquina' : 'Editar máquina'}
                    </h2>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0.25rem' }}>×</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Nombre
                        </label>
                        <input
                            ref={inputRef}
                            type="text"
                            value={nombre}
                            onChange={e => setNombre(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSave()}
                            placeholder="Ej: Hidrolavadora, Aspiradora..."
                            style={{
                                width: '100%', padding: '0.65rem 0.85rem',
                                border: '1px solid var(--border-color)', borderRadius: '8px',
                                fontSize: '0.95rem', background: 'var(--color-surface)',
                                color: 'var(--text-main)', outline: 'none',
                                transition: 'border-color 0.12s, box-shadow 0.12s',
                            }}
                            onFocus={e => { e.target.style.borderColor = '#00AEEF'; e.target.style.boxShadow = '0 0 0 3px rgba(0,174,239,0.15)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--color-muted-surface)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                        <div>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>Máquina activa</p>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {activo ? 'Aparece en la matriz de servicios' : 'Oculta en la matriz'}
                            </p>
                        </div>
                        <ToggleSwitch checked={activo} onChange={setActivo} />
                    </div>

                    {error && (
                        <p style={{ color: 'var(--error)', fontSize: '0.88rem', margin: 0, padding: '0.6rem 0.85rem', background: '#FEF2F2', borderRadius: '8px', border: '1px solid #FECACA' }}>
                            {error}
                        </p>
                    )}
                </div>

                <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            width: '100%', padding: '0.7rem', background: '#00AEEF', color: '#fff',
                            border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.95rem',
                            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                            transition: 'opacity 0.15s',
                        }}
                    >
                        {saving ? 'Guardando...' : isNew ? 'Crear máquina' : 'Guardar cambios'}
                    </button>

                    {!isNew && (
                        confirmDelete ? (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '0.6rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--color-surface)', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>
                                    Cancelar
                                </button>
                                <button onClick={handleDelete} disabled={saving} style={{ flex: 1, padding: '0.6rem', border: 'none', borderRadius: '8px', background: 'var(--error)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>
                                    Sí, eliminar
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setConfirmDelete(true)}
                                style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'transparent', color: 'var(--error)', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', transition: 'background 0.12s' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                                Eliminar máquina
                            </button>
                        )
                    )}
                </div>
            </div>
            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideInDrawer { from { transform: translateX(100%); } to { transform: translateX(0); } }
            `}</style>
        </>
    );
}

function MatrixCell({ hasX }) {
    return (
        <td style={{
            textAlign: 'center', verticalAlign: 'middle',
            padding: '0.6rem 0.5rem',
            borderBottom: '1px solid var(--border-color)',
            borderRight: '1px solid var(--border-color)',
            background: hasX ? 'rgba(0,174,239,0.06)' : 'transparent',
            minWidth: '80px',
        }}>
            {hasX ? (
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#00AEEF', lineHeight: 1 }}>✕</span>
            ) : (
                <span style={{ fontSize: '0.9rem', color: '#D1D5DB' }}>—</span>
            )}
        </td>
    );
}

export default function MaquinariaPage() {
    const [machines, setMachines] = useState([]);
    const [services, setServices] = useState([]);
    const [relations, setRelations] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [drawerMachine, setDrawerMachine] = useState(null);
    const [tab, setTab] = useState('matriz');
    const [searchServicio, setSearchServicio] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const [mRes, sRes, rRes] = await Promise.all([
                fetch('/api/machines'),
                fetch('/api/services'),
                fetch('/api/service-machines'),
            ]);
            const [mData, sData, rData] = await Promise.all([mRes.json(), sRes.json(), rRes.json()]);
            setMachines(Array.isArray(mData) ? mData : []);
            setServices(Array.isArray(sData) ? sData : []);
            const rel = new Set((Array.isArray(rData) ? rData : []).map(r => `${r.service_id}-${r.machine_id}`));
            setRelations(rel);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const activeMachines = machines.filter(m => m.activo !== false);
    const filteredServices = services.filter(s => s.name.toLowerCase().includes(searchServicio.toLowerCase()));

    return (
        <MainLayout>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 0.2rem' }}>Maquinaria</h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', margin: 0 }}>
                            {activeMachines.length} máquinas activas · {services.length} servicios
                        </p>
                    </div>
                    <button
                        onClick={() => { setDrawerMachine({}); setTab('catalogo'); }}
                        style={{
                            padding: '0.65rem 1.25rem', background: '#00AEEF', color: '#fff',
                            border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.92rem',
                            cursor: 'pointer', flexShrink: 0,
                            boxShadow: '0 2px 8px rgba(0,174,239,0.25)', transition: 'box-shadow 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,174,239,0.35)'}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,174,239,0.25)'}
                    >
                        + Nueva máquina
                    </button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    {[{ key: 'matriz', label: 'Matriz de servicios' }, { key: 'catalogo', label: 'Catálogo de Máquinas' }].map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            style={{
                                padding: '0.6rem 1.1rem', border: 'none',
                                borderBottom: tab === t.key ? '2px solid #00AEEF' : '2px solid transparent',
                                background: 'none', cursor: 'pointer',
                                fontWeight: tab === t.key ? 700 : 500,
                                fontSize: '0.92rem',
                                color: tab === t.key ? '#00AEEF' : 'var(--text-muted)',
                                transition: 'color 0.12s', marginBottom: '-1px',
                            }}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</div>
                ) : tab === 'matriz' ? (
                    activeMachines.length === 0 ? (
                        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No hay máquinas activas. Creá una desde el <strong>Catálogo</strong>.
                        </div>
                    ) : services.length === 0 ? (
                        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No hay servicios cargados.
                        </div>
                    ) : (
                        <>
                        <div style={{ marginBottom: '1rem' }}>
                            <input
                                type="text"
                                value={searchServicio}
                                onChange={e => setSearchServicio(e.target.value)}
                                placeholder="Buscar servicio..."
                                style={{
                                    width: '100%', maxWidth: '320px',
                                    padding: '0.55rem 0.85rem',
                                    border: '1px solid var(--border-color)', borderRadius: '8px',
                                    fontSize: '0.9rem', background: 'var(--color-surface)',
                                    color: 'var(--text-main)', outline: 'none',
                                    transition: 'border-color 0.12s',
                                }}
                                onFocus={e => e.target.style.borderColor = '#00AEEF'}
                                onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                            />
                        </div>
                        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
                            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: `${200 + activeMachines.length * 90}px` }}>
                                <thead>
                                    <tr style={{ background: 'var(--color-muted-surface)' }}>
                                        <th style={{
                                            textAlign: 'left', padding: '0.75rem 1.25rem',
                                            fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)',
                                            textTransform: 'uppercase', letterSpacing: '0.05em',
                                            borderBottom: '1px solid var(--border-color)',
                                            borderRight: '2px solid var(--border-color)',
                                            position: 'sticky', left: 0,
                                            background: 'var(--color-muted-surface)',
                                            minWidth: '200px', zIndex: 1,
                                        }}>
                                            Servicio
                                        </th>
                                        {activeMachines.map(m => (
                                            <th
                                                key={m.id}
                                                onClick={() => { setDrawerMachine(m); setTab('catalogo'); }}
                                                style={{
                                                    padding: '0.75rem 0.5rem',
                                                    fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)',
                                                    borderBottom: '1px solid var(--border-color)',
                                                    borderRight: '1px solid var(--border-color)',
                                                    textAlign: 'center', cursor: 'pointer',
                                                    transition: 'color 0.12s', minWidth: '80px',
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.color = '#00AEEF'}
                                                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-main)'}
                                                title="Click para editar"
                                            >
                                                {m.nombre}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredServices.map(s => (
                                        <tr key={s.id}>
                                            <td style={{
                                                padding: '0.7rem 1.25rem',
                                                fontWeight: 600, fontSize: '0.9rem',
                                                borderBottom: '1px solid var(--border-color)',
                                                borderRight: '2px solid var(--border-color)',
                                                position: 'sticky', left: 0,
                                                background: 'var(--color-surface)', zIndex: 1,
                                            }}>
                                                {s.name}
                                            </td>
                                            {activeMachines.map(m => (
                                                <MatrixCell
                                                    key={m.id}
                                                    hasX={relations.has(`${s.id}-${m.id}`)}
                                                />
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        </>
                    )
                ) : (
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--color-muted-surface)' }}>
                            <span style={{ flex: 1, fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Máquina</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '90px', textAlign: 'right' }}>Estado</span>
                            <span style={{ minWidth: '60px' }} />
                        </div>
                        {machines.length === 0 ? (
                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                No hay máquinas cargadas. Creá la primera con el botón de arriba.
                            </div>
                        ) : machines.map(m => (
                            <MachineRow
                                key={m.id}
                                machine={m}
                                onEdit={setDrawerMachine}
                                onToggleActive={async (machine, val) => {
                                    const res = await fetch(`/api/machines/${machine.id}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ nombre: machine.nombre, activo: val }),
                                    });
                                    if (res.ok) setMachines(prev => prev.map(x => x.id === machine.id ? { ...x, activo: val } : x));
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>

            {drawerMachine !== null && (
                <MachineDrawer
                    machine={drawerMachine}
                    onClose={() => setDrawerMachine(null)}
                    onSaved={() => { setDrawerMachine(null); load(); }}
                />
            )}
        </MainLayout>
    );
}
