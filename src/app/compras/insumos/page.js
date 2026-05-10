'use client';

import { useState, useEffect, useRef } from 'react';
import MainLayout from '@/components/MainLayout';
import { useCatalog } from '@/lib/CatalogContext';

function ToggleSwitch({ checked, onChange, disabled }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            style={{
                width: '40px',
                height: '22px',
                borderRadius: '999px',
                border: 'none',
                background: checked ? '#00AEEF' : '#E2E8F0',
                position: 'relative',
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'background 0.18s',
                flexShrink: 0,
                padding: 0,
            }}
        >
            <span style={{
                position: 'absolute',
                top: '3px',
                left: checked ? '21px' : '3px',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                transition: 'left 0.18s',
                display: 'block',
            }} />
        </button>
    );
}

function SupplyRow({ supply, onEdit, onToggleActive }) {
    const [toggling, setToggling] = useState(false);

    const handleToggle = async (val) => {
        setToggling(true);
        await onToggleActive(supply, val);
        setToggling(false);
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '0.95rem 1.5rem',
            borderBottom: '1px solid var(--border-color)',
            transition: 'background 0.12s',
            background: 'transparent',
        }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-muted-surface)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
            <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{supply.nombre}</span>
                {supply.unidad && (
                    <span style={{
                        display: 'inline-block',
                        marginLeft: '0.5rem',
                        fontSize: '0.78rem',
                        color: 'var(--text-muted)',
                        background: 'var(--color-muted-surface)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        padding: '0.1rem 0.45rem',
                        fontWeight: 500,
                    }}>{supply.unidad}</span>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                <span style={{ fontSize: '0.82rem', color: supply.activo !== false ? 'var(--success)' : 'var(--text-muted)', fontWeight: 500, minWidth: '50px', textAlign: 'right' }}>
                    {supply.activo !== false ? 'Activo' : 'Inactivo'}
                </span>
                <ToggleSwitch
                    checked={supply.activo !== false}
                    onChange={handleToggle}
                    disabled={toggling}
                />
            </div>

            <button
                onClick={() => onEdit(supply)}
                style={{
                    border: '1px solid var(--border-color)',
                    background: 'var(--color-surface)',
                    borderRadius: '8px',
                    padding: '0.38rem 0.85rem',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'border-color 0.12s, background 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#00AEEF'; e.currentTarget.style.color = '#00AEEF'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-main)'; }}
            >
                Editar
            </button>
        </div>
    );
}

function SupplyDrawer({ supply, onClose, onSaved }) {
    const isNew = !supply?.id;
    const [nombre, setNombre] = useState(supply?.nombre || '');
    const [unidad, setUnidad] = useState(supply?.unidad || 'unidades');
    const [activo, setActivo] = useState(supply?.activo !== false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        setTimeout(() => inputRef.current?.focus(), 80);
    }, []);

    const handleSave = async () => {
        if (!nombre.trim()) { setError('Ingresá el nombre del insumo.'); return; }
        setSaving(true);
        setError('');
        try {
            const url = isNew ? '/api/supplies' : `/api/supplies/${supply.id}`;
            const method = isNew ? 'POST' : 'PUT';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: nombre.trim(), unidad: unidad.trim() || 'unidades', activo }),
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
            const res = await fetch(`/api/supplies/${supply.id}`, { method: 'DELETE' });
            if (res.ok) onSaved();
            else setError('No se pudo eliminar el insumo.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 50,
                    animation: 'fadeIn 0.18s ease-out',
                }}
            />
            {/* Drawer */}
            <div style={{
                position: 'fixed', top: 0, right: 0, bottom: 0,
                width: 'min(400px, 100vw)',
                background: 'var(--color-surface)',
                boxShadow: '0 0 40px rgba(0,0,0,0.18)',
                zIndex: 51,
                display: 'flex',
                flexDirection: 'column',
                animation: 'slideInDrawer 0.22s cubic-bezier(.2,.8,.2,1)',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                        {isNew ? 'Nuevo insumo' : 'Editar insumo'}
                    </h2>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0.25rem' }}>×</button>
                </div>

                {/* Body */}
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
                            placeholder="Ej: Lavandina, Detergente..."
                            style={{
                                width: '100%',
                                padding: '0.65rem 0.85rem',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                fontSize: '0.95rem',
                                background: 'var(--color-surface)',
                                color: 'var(--text-main)',
                                outline: 'none',
                                transition: 'border-color 0.12s, box-shadow 0.12s',
                            }}
                            onFocus={e => { e.target.style.borderColor = '#00AEEF'; e.target.style.boxShadow = '0 0 0 3px rgba(0,174,239,0.15)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Unidad de medida
                        </label>
                        <input
                            type="text"
                            value={unidad}
                            onChange={e => setUnidad(e.target.value)}
                            placeholder="Ej: litros, kg, unidades..."
                            style={{
                                width: '100%',
                                padding: '0.65rem 0.85rem',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                fontSize: '0.95rem',
                                background: 'var(--color-surface)',
                                color: 'var(--text-main)',
                                outline: 'none',
                                transition: 'border-color 0.12s, box-shadow 0.12s',
                            }}
                            onFocus={e => { e.target.style.borderColor = '#00AEEF'; e.target.style.boxShadow = '0 0 0 3px rgba(0,174,239,0.15)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--color-muted-surface)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                        <div>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>Insumo activo</p>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {activo ? 'Aparece en los pedidos' : 'Oculto en los pedidos'}
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

                {/* Footer */}
                <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            width: '100%',
                            padding: '0.7rem',
                            background: '#00AEEF',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            opacity: saving ? 0.7 : 1,
                            transition: 'opacity 0.15s',
                        }}
                    >
                        {saving ? 'Guardando...' : isNew ? 'Crear insumo' : 'Guardar cambios'}
                    </button>

                    {!isNew && (
                        confirmDelete ? (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => setConfirmDelete(false)}
                                    style={{ flex: 1, padding: '0.6rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--color-surface)', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={saving}
                                    style={{ flex: 1, padding: '0.6rem', border: 'none', borderRadius: '8px', background: 'var(--error)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem' }}
                                >
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
                                Eliminar insumo
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

export default function InsumosPurchasesPage() {
    const { refetch: refetchCatalog } = useCatalog();
    const [supplies, setSupplies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [drawerSupply, setDrawerSupply] = useState(null);
    const [search, setSearch] = useState('');
    const [filterActivo, setFilterActivo] = useState('todos');

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/supplies');
            if (res.ok) setSupplies(await res.json());
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleToggleActive = async (supply, newVal) => {
        const res = await fetch(`/api/supplies/${supply.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: supply.nombre, unidad: supply.unidad, activo: newVal }),
        });
        if (res.ok) {
            setSupplies(prev => prev.map(s => s.id === supply.id ? { ...s, activo: newVal } : s));
            refetchCatalog();
        }
    };

    const filtered = supplies.filter(s => {
        const matchSearch = s.nombre.toLowerCase().includes(search.toLowerCase());
        const matchFilter = filterActivo === 'todos' || (filterActivo === 'activos' ? s.activo !== false : s.activo === false);
        return matchSearch && matchFilter;
    });

    const activeCount = supplies.filter(s => s.activo !== false).length;

    return (
        <MainLayout>
            <div style={{ maxWidth: '860px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 0.2rem' }}>Insumos</h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', margin: 0 }}>
                            {activeCount} de {supplies.length} insumos activos
                        </p>
                    </div>
                    <button
                        onClick={() => setDrawerSupply({})}
                        style={{
                            padding: '0.65rem 1.25rem',
                            background: '#00AEEF',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '10px',
                            fontWeight: 700,
                            fontSize: '0.92rem',
                            cursor: 'pointer',
                            flexShrink: 0,
                            boxShadow: '0 2px 8px rgba(0,174,239,0.25)',
                            transition: 'opacity 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,174,239,0.35)'}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,174,239,0.25)'}
                    >
                        + Nuevo insumo
                    </button>
                </div>

                {/* Filtros */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar insumo..."
                        style={{
                            flex: '1 1 200px',
                            padding: '0.55rem 0.85rem',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            fontSize: '0.9rem',
                            background: 'var(--color-surface)',
                            color: 'var(--text-main)',
                            outline: 'none',
                            transition: 'border-color 0.12s',
                        }}
                        onFocus={e => e.target.style.borderColor = '#00AEEF'}
                        onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                    />
                    {['todos', 'activos', 'inactivos'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilterActivo(f)}
                            style={{
                                padding: '0.55rem 1rem',
                                border: '1px solid',
                                borderColor: filterActivo === f ? '#00AEEF' : 'var(--border-color)',
                                borderRadius: '8px',
                                background: filterActivo === f ? '#FDF4EC' : 'var(--color-surface)',
                                color: filterActivo === f ? '#00AEEF' : 'var(--text-muted)',
                                fontWeight: filterActivo === f ? 700 : 500,
                                fontSize: '0.88rem',
                                cursor: 'pointer',
                                transition: 'all 0.12s',
                                textTransform: 'capitalize',
                            }}
                        >
                            {f}
                        </button>
                    ))}
                </div>

                {/* Lista */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {/* Column headers */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--color-muted-surface)' }}>
                        <span style={{ flex: 1, fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Insumo</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '90px', textAlign: 'right' }}>Estado</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '60px' }}></span>
                    </div>

                    {loading ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</div>
                    ) : filtered.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            {search ? `Sin resultados para "${search}"` : 'No hay insumos cargados.'}
                        </div>
                    ) : filtered.map(s => (
                        <SupplyRow
                            key={s.id}
                            supply={s}
                            onEdit={setDrawerSupply}
                            onToggleActive={handleToggleActive}
                        />
                    ))}
                </div>
            </div>

            {drawerSupply !== null && (
                <SupplyDrawer
                    supply={drawerSupply}
                    onClose={() => setDrawerSupply(null)}
                    onSaved={() => { setDrawerSupply(null); load(); refetchCatalog(); }}
                />
            )}
        </MainLayout>
    );
}
