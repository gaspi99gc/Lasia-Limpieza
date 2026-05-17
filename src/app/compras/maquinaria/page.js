'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import MainLayout from '@/components/MainLayout';
import SearchableSelect from '@/components/SearchableSelect';

const ESTADOS = [
    { key: 'abierta', label: 'Abierta', bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
    { key: 'en_revision', label: 'En revisión', bg: '#FFFBEB', fg: '#B45309', border: '#FCD34D' },
    { key: 'reparada', label: 'Reparada', bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
    { key: 'reemplazada', label: 'Reemplazada', bg: '#F1F5F9', fg: '#475569', border: '#CBD5E1' },
    { key: 'descartada', label: 'Descartada', bg: '#F8FAFC', fg: '#94A3B8', border: '#E2E8F0' },
];
const ESTADO_BY_KEY = Object.fromEntries(ESTADOS.map(e => [e.key, e]));
const isOpenEstado = (e) => e === 'abierta' || e === 'en_revision';

function EstadoBadge({ estado }) {
    const e = ESTADO_BY_KEY[estado] || ESTADOS[0];
    return (
        <span style={{
            display: 'inline-block', padding: '0.18rem 0.55rem', borderRadius: '999px',
            fontSize: '0.72rem', fontWeight: 700,
            background: e.bg, color: e.fg, border: `1px solid ${e.border}`,
            whiteSpace: 'nowrap',
        }}>
            {e.label}
        </span>
    );
}

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

function MatrixCell({ quantity, hasOpenIncident, onClick }) {
    const active = quantity > 0;
    return (
        <td style={{
            textAlign: 'center', verticalAlign: 'middle',
            padding: 0,
            borderBottom: '1px solid var(--border-color)',
            borderRight: '1px solid var(--border-color)',
            minWidth: '80px',
            position: 'relative',
        }}>
            <button
                type="button"
                onClick={onClick}
                style={{
                    width: '100%', height: '100%', minHeight: '40px',
                    border: 'none', cursor: 'pointer',
                    background: active ? 'rgba(0,174,239,0.08)' : 'transparent',
                    padding: '0.6rem 0.5rem',
                    position: 'relative',
                    transition: 'background 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = active ? 'rgba(0,174,239,0.18)' : 'var(--color-muted-surface)'}
                onMouseLeave={e => e.currentTarget.style.background = active ? 'rgba(0,174,239,0.08)' : 'transparent'}
                title="Click para editar"
            >
                {active ? (
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: '#00AEEF', lineHeight: 1, letterSpacing: '0.05em' }}>{'X'.repeat(quantity)}</span>
                ) : (
                    <span style={{ fontSize: '0.9rem', color: '#D1D5DB' }}>—</span>
                )}
                {hasOpenIncident && (
                    <span style={{
                        position: 'absolute', top: '6px', right: '6px',
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: '#DC2626',
                        boxShadow: '0 0 0 2px var(--color-surface)',
                    }} />
                )}
            </button>
        </td>
    );
}

function IncidentForm({ initial, onSave, onCancel, saving }) {
    const [descripcion, setDescripcion] = useState(initial?.descripcion || '');
    const [notaInterna, setNotaInterna] = useState(initial?.nota_interna || '');
    const [estado, setEstado] = useState(initial?.estado || 'abierta');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.85rem', background: 'var(--color-muted-surface)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Descripción</label>
                <textarea
                    value={descripcion}
                    onChange={e => setDescripcion(e.target.value)}
                    rows={2}
                    placeholder="Ej: Salta la térmica"
                    style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.88rem', resize: 'vertical', fontFamily: 'inherit' }}
                />
            </div>
            <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Nota interna</label>
                <textarea
                    value={notaInterna}
                    onChange={e => setNotaInterna(e.target.value)}
                    rows={2}
                    placeholder="Detalles, acciones tomadas, etc."
                    style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.88rem', resize: 'vertical', fontFamily: 'inherit' }}
                />
            </div>
            <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estado</label>
                <select
                    value={estado}
                    onChange={e => setEstado(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.88rem', background: 'var(--color-surface)' }}
                >
                    {ESTADOS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem' }}>
                <button
                    onClick={onCancel}
                    disabled={saving}
                    style={{ flex: 1, padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--color-surface)', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
                >
                    Cancelar
                </button>
                <button
                    onClick={() => onSave({ descripcion, nota_interna: notaInterna, estado })}
                    disabled={saving || !descripcion.trim()}
                    style={{ flex: 1, padding: '0.5rem', border: 'none', borderRadius: '6px', background: '#00AEEF', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', opacity: (saving || !descripcion.trim()) ? 0.5 : 1 }}
                >
                    {saving ? 'Guardando...' : 'Guardar'}
                </button>
            </div>
        </div>
    );
}

function CellDrawer({ service, machine, incidents, onClose, onChanged }) {
    const [editingId, setEditingId] = useState(null);
    const [adding, setAdding] = useState(false);
    const [savingInc, setSavingInc] = useState(false);

    const saveIncident = async (incident, payload) => {
        setSavingInc(true);
        try {
            if (incident?.id) {
                await fetch(`/api/machine-incidents/${incident.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else {
                await fetch('/api/machine-incidents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload, service_id: service.id, machine_id: machine.id }),
                });
            }
            setEditingId(null);
            setAdding(false);
            onChanged();
        } finally {
            setSavingInc(false);
        }
    };

    const deleteIncident = async (id) => {
        if (!confirm('¿Eliminar esta incidencia?')) return;
        await fetch(`/api/machine-incidents/${id}`, { method: 'DELETE' });
        onChanged();
    };

    const changeEstado = async (id, estado) => {
        await fetch(`/api/machine-incidents/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado }),
        });
        onChanged();
    };

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 50 }} />
            <div style={{
                position: 'fixed', top: 0, right: 0, bottom: 0,
                width: 'min(460px, 100vw)',
                background: 'var(--color-surface)',
                boxShadow: '0 0 40px rgba(0,0,0,0.18)',
                zIndex: 51, display: 'flex', flexDirection: 'column',
                animation: 'slideInDrawer 0.22s cubic-bezier(.2,.8,.2,1)',
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{machine.nombre}</p>
                        <h2 style={{ margin: '0.15rem 0 0', fontSize: '1.05rem', fontWeight: 700 }}>{service.name}</h2>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0.25rem' }}>×</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Incidencias */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Incidencias ({incidents.length})
                            </label>
                            {!adding && editingId === null && (
                                <button
                                    onClick={() => setAdding(true)}
                                    style={{ padding: '0.35rem 0.7rem', border: '1px solid #00AEEF', borderRadius: '6px', background: 'transparent', color: '#00AEEF', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem' }}
                                >
                                    + Nueva
                                </button>
                            )}
                        </div>

                        {adding && (
                            <div style={{ marginBottom: '0.75rem' }}>
                                <IncidentForm
                                    onSave={(payload) => saveIncident(null, payload)}
                                    onCancel={() => setAdding(false)}
                                    saving={savingInc}
                                />
                            </div>
                        )}

                        {incidents.length === 0 && !adding && (
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, padding: '0.85rem', background: 'var(--color-muted-surface)', borderRadius: '8px', textAlign: 'center' }}>
                                Sin incidencias para esta máquina.
                            </p>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                            {incidents.map(inc => editingId === inc.id ? (
                                <IncidentForm
                                    key={inc.id}
                                    initial={inc}
                                    onSave={(payload) => saveIncident(inc, payload)}
                                    onCancel={() => setEditingId(null)}
                                    saving={savingInc}
                                />
                            ) : (
                                <div key={inc.id} style={{ padding: '0.75rem 0.85rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--color-surface)' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
                                        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>{inc.descripcion}</p>
                                        <select
                                            value={inc.estado}
                                            onChange={e => changeEstado(inc.id, e.target.value)}
                                            style={{
                                                padding: '0.2rem 0.45rem', borderRadius: '999px',
                                                border: `1px solid ${(ESTADO_BY_KEY[inc.estado] || ESTADOS[0]).border}`,
                                                background: (ESTADO_BY_KEY[inc.estado] || ESTADOS[0]).bg,
                                                color: (ESTADO_BY_KEY[inc.estado] || ESTADOS[0]).fg,
                                                fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', outline: 'none',
                                            }}
                                        >
                                            {ESTADOS.map(e => <option key={e.key} value={e.key} style={{ color: '#000' }}>{e.label}</option>)}
                                        </select>
                                    </div>
                                    {inc.nota_interna && (
                                        <p style={{ margin: '0 0 0.4rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                            {inc.nota_interna}
                                        </p>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.4rem' }}>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            {new Date(inc.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </span>
                                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                                            <button
                                                onClick={() => setEditingId(inc.id)}
                                                style={{ padding: '0.25rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: '5px', background: 'var(--color-surface)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                                            >Editar</button>
                                            <button
                                                onClick={() => deleteIncident(inc.id)}
                                                style={{ padding: '0.25rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: '5px', background: 'var(--color-surface)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, color: 'var(--error)' }}
                                            >×</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideInDrawer { from { transform: translateX(100%); } to { transform: translateX(0); } }
            `}</style>
        </>
    );
}

function NewIncidentDrawer({ services, machines, onClose, onChanged }) {
    const [serviceId, setServiceId] = useState('');
    const [machineId, setMachineId] = useState('');
    const [saving, setSaving] = useState(false);

    const save = async (payload) => {
        if (!serviceId || !machineId) return;
        setSaving(true);
        try {
            await fetch('/api/machine-incidents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, service_id: Number(serviceId), machine_id: Number(machineId) }),
            });
            onChanged();
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 50 }} />
            <div style={{
                position: 'fixed', top: 0, right: 0, bottom: 0,
                width: 'min(460px, 100vw)',
                background: 'var(--color-surface)',
                boxShadow: '0 0 40px rgba(0,0,0,0.18)',
                zIndex: 51, display: 'flex', flexDirection: 'column',
                animation: 'slideInDrawer 0.22s cubic-bezier(.2,.8,.2,1)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Nueva incidencia</h2>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0.25rem' }}>×</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Servicio</label>
                        <SearchableSelect
                            options={services.map(s => ({ value: s.id, label: s.name }))}
                            value={serviceId}
                            onChange={(v) => setServiceId(v)}
                            placeholder="Seleccionar servicio..."
                            searchPlaceholder="Buscar servicio..."
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Máquina</label>
                        <select
                            value={machineId}
                            onChange={e => setMachineId(e.target.value)}
                            style={{ width: '100%', padding: '0.55rem 0.7rem', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.9rem', background: 'var(--color-surface)' }}
                        >
                            <option value="">Seleccionar...</option>
                            {machines.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                        </select>
                    </div>
                    {serviceId && machineId && (
                        <IncidentForm
                            onSave={save}
                            onCancel={onClose}
                            saving={saving}
                        />
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

export default function MaquinariaPage() {
    const [machines, setMachines] = useState([]);
    const [services, setServices] = useState([]);
    const [relations, setRelations] = useState(new Map()); // "sid-mid" -> quantity
    const [incidents, setIncidents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [drawerMachine, setDrawerMachine] = useState(null);
    const [cellDrawer, setCellDrawer] = useState(null); // {service, machine}
    const [newIncidentOpen, setNewIncidentOpen] = useState(false);
    const [tab, setTab] = useState('matriz');
    const [searchServicio, setSearchServicio] = useState('');
    const [filterEstado, setFilterEstado] = useState('');
    const [filterMachine, setFilterMachine] = useState('');
    const [filterServiceInc, setFilterServiceInc] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const [mRes, sRes, rRes, iRes] = await Promise.all([
                fetch('/api/machines'),
                fetch('/api/services'),
                fetch('/api/service-machines'),
                fetch('/api/machine-incidents'),
            ]);
            const [mData, sData, rData, iData] = await Promise.all([mRes.json(), sRes.json(), rRes.json(), iRes.json()]);
            setMachines(Array.isArray(mData) ? mData : []);
            setServices(Array.isArray(sData) ? sData : []);
            const rel = new Map();
            for (const r of Array.isArray(rData) ? rData : []) {
                rel.set(`${r.service_id}-${r.machine_id}`, r.quantity ?? 1);
            }
            setRelations(rel);
            setIncidents(Array.isArray(iData) ? iData : []);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const activeMachines = useMemo(() => machines.filter(m => m.activo !== false), [machines]);
    const filteredServices = useMemo(
        () => services.filter(s => s.name.toLowerCase().includes(searchServicio.toLowerCase())),
        [services, searchServicio]
    );

    // Index: para mostrar punto rojo en celda + para CellDrawer
    const incidentsByPair = useMemo(() => {
        const map = new Map();
        for (const inc of incidents) {
            const k = `${inc.service_id}-${inc.machine_id}`;
            if (!map.has(k)) map.set(k, []);
            map.get(k).push(inc);
        }
        return map;
    }, [incidents]);

    const filteredIncidents = useMemo(() => {
        return incidents.filter(i => {
            if (filterEstado && i.estado !== filterEstado) return false;
            if (filterMachine && i.machine_id !== Number(filterMachine)) return false;
            if (filterServiceInc) {
                const name = (i.service_name || '').toLowerCase();
                if (!name.includes(filterServiceInc.toLowerCase())) return false;
            }
            return true;
        });
    }, [incidents, filterEstado, filterMachine, filterServiceInc]);

    const openCellDrawer = (service, machine) => setCellDrawer({ service, machine });
    const openCellFromIncident = (inc) => {
        const service = services.find(s => s.id === inc.service_id);
        const machine = machines.find(m => m.id === inc.machine_id);
        if (service && machine) setCellDrawer({ service, machine });
    };

    const cellIncidents = cellDrawer
        ? (incidentsByPair.get(`${cellDrawer.service.id}-${cellDrawer.machine.id}`) || [])
        : [];

    return (
        <MainLayout>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 0.2rem' }}>Maquinaria</h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', margin: 0 }}>
                            {activeMachines.length} máquinas activas · {services.length} servicios · {incidents.filter(i => isOpenEstado(i.estado)).length} incidencias abiertas
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                        {tab === 'incidencias' ? (
                            <button
                                onClick={() => setNewIncidentOpen(true)}
                                style={{
                                    padding: '0.65rem 1.25rem', background: '#DC2626', color: '#fff',
                                    border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.92rem',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(220,38,38,0.25)',
                                }}
                            >
                                + Nueva incidencia
                            </button>
                        ) : (
                            <button
                                onClick={() => { setDrawerMachine({}); setTab('catalogo'); }}
                                style={{
                                    padding: '0.65rem 1.25rem', background: '#00AEEF', color: '#fff',
                                    border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.92rem',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(0,174,239,0.25)',
                                }}
                            >
                                + Nueva máquina
                            </button>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    {[
                        { key: 'matriz', label: 'Matriz de servicios' },
                        { key: 'catalogo', label: 'Catálogo de Máquinas' },
                        { key: 'incidencias', label: `Incidencias${incidents.filter(i => isOpenEstado(i.estado)).length ? ` (${incidents.filter(i => isOpenEstado(i.estado)).length})` : ''}` },
                    ].map(t => (
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
                                    }}
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
                                                        minWidth: '80px',
                                                    }}
                                                    title="Click para editar la máquina en el catálogo"
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
                                                {activeMachines.map(m => {
                                                    const key = `${s.id}-${m.id}`;
                                                    const qty = relations.get(key) || 0;
                                                    const incs = incidentsByPair.get(key) || [];
                                                    const hasOpen = incs.some(i => isOpenEstado(i.estado));
                                                    return (
                                                        <MatrixCell
                                                            key={m.id}
                                                            quantity={qty}
                                                            hasOpenIncident={hasOpen}
                                                            onClick={() => openCellDrawer(s, m)}
                                                        />
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )
                ) : tab === 'catalogo' ? (
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
                ) : (
                    // Tab Incidencias
                    <>
                        <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                            <input
                                type="text"
                                value={filterServiceInc}
                                onChange={e => setFilterServiceInc(e.target.value)}
                                placeholder="Buscar servicio..."
                                style={{ flex: '1 1 200px', minWidth: '180px', padding: '0.55rem 0.85rem', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem', background: 'var(--color-surface)' }}
                            />
                            <select
                                value={filterMachine}
                                onChange={e => setFilterMachine(e.target.value)}
                                style={{ padding: '0.55rem 0.85rem', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem', background: 'var(--color-surface)' }}
                            >
                                <option value="">Todas las máquinas</option>
                                {machines.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                            </select>
                            <select
                                value={filterEstado}
                                onChange={e => setFilterEstado(e.target.value)}
                                style={{ padding: '0.55rem 0.85rem', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem', background: 'var(--color-surface)' }}
                            >
                                <option value="">Todos los estados</option>
                                {ESTADOS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                            </select>
                        </div>

                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            {filteredIncidents.length === 0 ? (
                                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {incidents.length === 0 ? 'No hay incidencias cargadas.' : 'Ninguna incidencia coincide con los filtros.'}
                                </div>
                            ) : (
                                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--color-muted-surface)' }}>
                                            <th style={{ textAlign: 'left', padding: '0.65rem 1rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)' }}>Servicio</th>
                                            <th style={{ textAlign: 'left', padding: '0.65rem 1rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)' }}>Máquina</th>
                                            <th style={{ textAlign: 'left', padding: '0.65rem 1rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)' }}>Descripción</th>
                                            <th style={{ textAlign: 'left', padding: '0.65rem 1rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)' }}>Estado</th>
                                            <th style={{ textAlign: 'left', padding: '0.65rem 1rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)' }}>Fecha</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredIncidents.map(inc => (
                                            <tr
                                                key={inc.id}
                                                onClick={() => openCellFromIncident(inc)}
                                                style={{ cursor: 'pointer', transition: 'background 0.1s' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-muted-surface)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <td style={{ padding: '0.65rem 1rem', fontSize: '0.88rem', fontWeight: 600, borderBottom: '1px solid var(--border-color)' }}>{inc.service_name || '—'}</td>
                                                <td style={{ padding: '0.65rem 1rem', fontSize: '0.88rem', borderBottom: '1px solid var(--border-color)' }}>{inc.machine_nombre || '—'}</td>
                                                <td style={{ padding: '0.65rem 1rem', fontSize: '0.85rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.descripcion}</td>
                                                <td style={{ padding: '0.65rem 1rem', borderBottom: '1px solid var(--border-color)' }}><EstadoBadge estado={inc.estado} /></td>
                                                <td style={{ padding: '0.65rem 1rem', fontSize: '0.82rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                                                    {new Date(inc.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
                )}
            </div>

            {drawerMachine !== null && (
                <MachineDrawer
                    machine={drawerMachine}
                    onClose={() => setDrawerMachine(null)}
                    onSaved={() => { setDrawerMachine(null); load(); }}
                />
            )}
            {cellDrawer && (
                <CellDrawer
                    service={cellDrawer.service}
                    machine={cellDrawer.machine}
                    incidents={cellIncidents}
                    onClose={() => setCellDrawer(null)}
                    onChanged={load}
                />
            )}
            {newIncidentOpen && (
                <NewIncidentDrawer
                    services={services}
                    machines={machines}
                    onClose={() => setNewIncidentOpen(false)}
                    onChanged={() => { setNewIncidentOpen(false); load(); }}
                />
            )}
        </MainLayout>
    );
}
