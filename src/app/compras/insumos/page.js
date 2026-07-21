'use client';

import { useState, useEffect, useRef } from 'react';
import MainLayout from '@/components/MainLayout';
import { useCatalog } from '@/lib/CatalogContext';
import { getArgentinaDateStamp } from '@/lib/datetime';
import { downloadWorkbook } from '@/lib/xlsx-download';

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

const inputStyle = {
    width: '100%', padding: '0.65rem 0.85rem',
    border: '1px solid var(--border-color)', borderRadius: '8px',
    fontSize: '0.95rem', background: 'var(--color-surface)',
    color: 'var(--text-main)', outline: 'none', transition: 'border-color 0.12s, box-shadow 0.12s',
};
const labelStyle = {
    display: 'block', fontSize: '0.82rem', fontWeight: 600,
    color: 'var(--text-muted)', marginBottom: '0.4rem',
    textTransform: 'uppercase', letterSpacing: '0.04em',
};

function SupplyRow({ supply, onEdit, onToggleActive }) {
    const [toggling, setToggling] = useState(false);
    const handleToggle = async (val) => { setToggling(true); await onToggleActive(supply, val); setToggling(false); };
    return (
        <div
            style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.95rem 1.5rem', borderBottom: '1px solid var(--border-color)', transition: 'background 0.12s', background: 'transparent' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-muted-surface)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
            <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{supply.nombre}</span>
                {supply.providers?.name && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                        {supply.providers.name}
                    </span>
                )}
            </div>
            <span style={{ fontSize: '0.82rem', color: Number(supply.precio) > 0 ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: 600, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                {Number(supply.precio) > 0
                    ? Number(supply.precio).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
                    : 'Sin precio'}
            </span>
            <span style={{ fontSize: '0.82rem', color: supply.activo !== false ? 'var(--success)' : 'var(--text-muted)', fontWeight: 500, flexShrink: 0 }}>
                {supply.activo !== false ? 'Activo' : 'Inactivo'}
            </span>
            <button
                onClick={() => onEdit(supply)}
                style={{ border: '1px solid var(--border-color)', background: 'var(--color-surface)', borderRadius: '8px', padding: '0.38rem 0.85rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', cursor: 'pointer', flexShrink: 0, transition: 'border-color 0.12s, background 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#00AEEF'; e.currentTarget.style.color = '#00AEEF'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-main)'; }}
            >
                Editar
            </button>
        </div>
    );
}

function ProviderModal({ onClose, onCreated }) {
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef(null);

    useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, []);

    const handleSave = async () => {
        if (!name.trim()) { setError('Ingresá el nombre del proveedor.'); return; }
        setSaving(true);
        setError('');
        try {
            const res = await fetch('/api/providers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim() }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setError(data.error || 'Error al guardar.'); return; }
            onCreated(data);
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 60 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(380px, 90vw)', background: 'var(--color-surface)', borderRadius: '14px', boxShadow: '0 8px 40px rgba(0,0,0,0.22)', zIndex: 61, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Nuevo proveedor</h2>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)', lineHeight: 1 }}>×</button>
                </div>
                <div>
                    <label style={labelStyle}>Nombre</label>
                    <input
                        ref={inputRef}
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSave()}
                        placeholder="Ej: Química del Sur SA"
                        style={inputStyle}
                        onFocus={e => { e.target.style.borderColor = '#00AEEF'; e.target.style.boxShadow = '0 0 0 3px rgba(0,174,239,0.15)'; }}
                        onBlur={e => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }}
                    />
                </div>
                {error && <p style={{ color: 'var(--error)', fontSize: '0.88rem', margin: 0, padding: '0.6rem 0.85rem', background: '#FEF2F2', borderRadius: '8px' }}>{error}</p>}
                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{ width: '100%', padding: '0.7rem', background: '#00AEEF', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.95rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
                >
                    {saving ? 'Guardando...' : 'Crear proveedor'}
                </button>
            </div>
        </>
    );
}

function SupplyDrawer({ supply, providers, onClose, onSaved, onNeedRefreshProviders }) {
    const isNew = !supply?.id;
    const [nombre, setNombre] = useState(supply?.nombre || '');
    const [unidad, setUnidad] = useState(supply?.unidad || 'unidades');
    const [providerId, setProviderId] = useState(supply?.provider_id ? String(supply.provider_id) : '');
    const [activo, setActivo] = useState(supply?.activo !== false);
    const [precio, setPrecio] = useState(supply?.precio != null ? String(supply.precio) : '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [importState, setImportState] = useState(null);
    const [pendingFile, setPendingFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const inputRef = useRef(null);

    useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, []);

    const handleSave = async () => {
        if (!nombre.trim()) { setError('Ingresá el nombre del insumo.'); return; }
        if (!providerId) { setError('Seleccioná un proveedor.'); return; }
        setSaving(true); setError('');
        try {
            const url = isNew ? '/api/supplies' : `/api/supplies/${supply.id}`;
            const method = isNew ? 'POST' : 'PUT';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: nombre.trim(), unidad: unidad.trim() || 'unidades', provider_id: Number(providerId), activo, precio: Number(precio) || 0 }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setError(data.error || 'Error al guardar.'); return; }
            onSaved();
        } finally { setSaving(false); }
    };

    const handleDelete = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/supplies/${supply.id}`, { method: 'DELETE' });
            if (res.ok) onSaved();
            else {
                const data = await res.json().catch(() => ({}));
                setError(data.error || 'No se pudo eliminar el insumo.');
            }
        } finally { setSaving(false); }
    };

    const handlePreview = async (file) => {
        setImportState({ status: 'loading' });
        setSaving(true);
        try {
            const body = new FormData();
            body.append('file', file);
            const res = await fetch('/api/supplies/import?preview=true', { method: 'POST', body });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setImportState(null);
                setError(data.error || 'No se pudo leer el archivo.');
                return;
            }
            setPreview(data);
            setImportState(null);
        } catch (err) {
            setImportState(null);
            setError(err.message || 'Error al leer el archivo.');
        } finally {
            setSaving(false);
        }
    };

    const handleImport = async () => {
        if (!pendingFile) return;
        setImportState({ status: 'loading' });
        setSaving(true);
        try {
            const body = new FormData();
            body.append('file', pendingFile);
            const res = await fetch('/api/supplies/import', { method: 'POST', body });
            const data = await res.json().catch(() => ({}));
            const { default: Swal } = await import('sweetalert2');
            if (!res.ok) {
                setImportState(null);
                Swal.fire({ title: 'Error', text: data.error || 'No se pudo importar.', icon: 'error', confirmButtonColor: '#ef4444' });
                return;
            }
            const { imported, failedRows = [] } = data;
            setImportState({ status: 'done', failedRows });
            setPreview(null);
            setPendingFile(null);
            if (imported > 0) onSaved();
            Swal.fire({
                title: imported > 0 ? '¡Insumos creados!' : 'Sin insumos nuevos',
                text: imported > 0
                    ? `Se crearon ${imported} insumo${imported !== 1 ? 's' : ''} correctamente.${failedRows.length > 0 ? ` ${failedRows.length} con error.` : ''}`
                    : `No se importó ningún insumo.`,
                icon: imported > 0 ? 'success' : 'warning',
                confirmButtonColor: imported > 0 ? '#10b981' : '#f59e0b',
            });
        } catch (err) {
            setImportState(null);
        } finally {
            setSaving(false);
        }
    };

    const downloadFailedCsv = (failedRows) => {
        const header = ['fila', 'nombre', 'proveedor', 'motivo'];
        const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [header.join(','), ...failedRows.map(r => header.map(k => escape(r[k])).join(','))];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'insumos-no-importados.csv'; a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 50, animation: 'fadeIn 0.18s ease-out' }} />
            <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(420px, 100vw)', background: 'var(--color-surface)', boxShadow: '0 0 40px rgba(0,0,0,0.18)', zIndex: 51, display: 'flex', flexDirection: 'column', animation: 'slideInDrawer 0.22s cubic-bezier(.2,.8,.2,1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{isNew ? 'Nuevo insumo' : 'Editar insumo'}</h2>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0.25rem' }}>×</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Nombre */}
                    <div>
                        <label style={labelStyle}>Nombre</label>
                        <input ref={inputRef} type="text" value={nombre} onChange={e => setNombre(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="Ej: Lavandina, Detergente..." style={inputStyle}
                            onFocus={e => { e.target.style.borderColor = '#00AEEF'; e.target.style.boxShadow = '0 0 0 3px rgba(0,174,239,0.15)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }} />
                    </div>

                    {/* Proveedor */}
                    <div>
                        <label style={labelStyle}>Proveedor <span style={{ color: 'var(--error)' }}>*</span></label>
                        <select
                            value={providerId}
                            onChange={e => setProviderId(e.target.value)}
                            style={{ ...inputStyle, cursor: 'pointer' }}
                            onFocus={e => { e.target.style.borderColor = '#00AEEF'; e.target.style.boxShadow = '0 0 0 3px rgba(0,174,239,0.15)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }}
                        >
                            <option value="">Seleccioná un proveedor...</option>
                            {providers.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Unidad */}
                    <div>
                        <label style={labelStyle}>Unidad de medida</label>
                        <input type="text" value={unidad} onChange={e => setUnidad(e.target.value)} placeholder="Ej: litros, kg, unidades..." style={inputStyle}
                            onFocus={e => { e.target.style.borderColor = '#00AEEF'; e.target.style.boxShadow = '0 0 0 3px rgba(0,174,239,0.15)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }} />
                    </div>

                    {/* Precio */}
                    <div>
                        <label style={labelStyle}>Precio por unidad</label>
                        <input type="number" min="0" step="0.01" value={precio} onChange={e => setPrecio(e.target.value)} placeholder="Ej: 1500.00" style={inputStyle}
                            onFocus={e => { e.target.style.borderColor = '#00AEEF'; e.target.style.boxShadow = '0 0 0 3px rgba(0,174,239,0.15)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }} />
                        <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Costo de una {unidad?.trim() || 'unidad'}. Se usa para calcular el gasto de insumos por servicio.
                        </p>
                    </div>

                    {/* Activo */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--color-muted-surface)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                        <div>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>Insumo activo</p>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{activo ? 'Aparece en los pedidos' : 'Oculto en los pedidos'}</p>
                        </div>
                        <ToggleSwitch checked={activo} onChange={setActivo} />
                    </div>

                    {error && <p style={{ color: 'var(--error)', fontSize: '0.88rem', margin: 0, padding: '0.6rem 0.85rem', background: '#FEF2F2', borderRadius: '8px', border: '1px solid #FECACA' }}>{error}</p>}

                    {/* Importar CSV — solo en nuevo */}
                    {isNew && (
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Importar desde CSV</p>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                Columnas: <strong>insumo</strong>, <strong>proveedor</strong> (el proveedor debe estar dado de alta).
                            </p>
                            <a href="/api/supplies/import" download className="btn btn-secondary" style={{ alignSelf: 'flex-start', fontSize: '0.85rem' }}>Descargar plantilla</a>

                            {/* Selector de archivo */}
                            {!preview && importState?.status !== 'done' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer' }}>
                                        Seleccionar archivo (.csv o .xlsx)
                                        <input type="file" accept=".csv,.xlsx" style={{ fontWeight: 'normal', cursor: 'pointer' }}
                                            onChange={e => {
                                                const f = e.target.files?.[0];
                                                if (f) { setPendingFile(f); setPreview(null); handlePreview(f); }
                                            }} />
                                    </label>
                                </div>
                            )}

                            {/* Spinner */}
                            {importState?.status === 'loading' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
                                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                                    </svg>
                                    Analizando archivo...
                                    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                                </div>
                            )}

                            {/* Preview */}
                            {preview && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#166534' }}>
                                            {preview.validRows.length} insumo{preview.validRows.length !== 1 ? 's' : ''} listos para crear
                                        </span>
                                        <button onClick={() => { setPreview(null); setPendingFile(null); }} style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--color-surface)', cursor: 'pointer' }}>Cambiar archivo</button>
                                    </div>

                                    {preview.validRows.length > 0 && (
                                        <div style={{ maxHeight: '130px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            {preview.validRows.map((r, i) => (
                                                <div key={i} style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', background: '#DCFCE7', color: '#166534', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>{r.nombre}</span>
                                                    <span style={{ opacity: 0.7 }}>{r.proveedor}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {preview.failedRows.length > 0 && (
                                        <>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--error)' }}>
                                                    {preview.failedRows.length} fila{preview.failedRows.length !== 1 ? 's' : ''} con error (no se van a crear)
                                                </span>
                                                <button onClick={() => downloadFailedCsv(preview.failedRows)} style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--color-surface)', cursor: 'pointer' }}>Descargar errores</button>
                                            </div>
                                            <div style={{ maxHeight: '130px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                {preview.failedRows.map((r, i) => (
                                                    <div key={i} style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', background: '#FEE2E2', color: '#991B1B', fontSize: '0.8rem' }}>
                                                        <strong>Fila {r.fila} — {r.nombre || '(sin nombre)'}:</strong> {r.motivo}
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Resultado final */}
                            {importState?.status === 'done' && importState.failedRows?.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--error)' }}>{importState.failedRows.length} fila{importState.failedRows.length !== 1 ? 's' : ''} con error</span>
                                        <button onClick={() => downloadFailedCsv(importState.failedRows)} style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--color-surface)', cursor: 'pointer' }}>Descargar errores</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <button
                        onClick={() => preview ? handleImport() : handleSave()}
                        disabled={saving || (isNew && !!pendingFile && !preview)}
                        style={{ width: '100%', padding: '0.7rem', background: '#00AEEF', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.95rem', cursor: (saving || (isNew && !!pendingFile && !preview)) ? 'not-allowed' : 'pointer', opacity: (saving || (isNew && !!pendingFile && !preview)) ? 0.7 : 1 }}
                    >
                        {saving ? 'Guardando...' : preview ? 'Crear insumos' : isNew ? 'Crear insumo' : 'Guardar cambios'}
                    </button>
                    {!isNew && (
                        confirmDelete ? (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '0.6rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--color-surface)', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>Cancelar</button>
                                <button onClick={handleDelete} disabled={saving} style={{ flex: 1, padding: '0.6rem', border: 'none', borderRadius: '8px', background: 'var(--error)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>Sí, eliminar</button>
                            </div>
                        ) : (
                            <button onClick={() => setConfirmDelete(true)} style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'transparent', color: 'var(--error)', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', transition: 'background 0.12s' }}
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
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [drawerSupply, setDrawerSupply] = useState(null);
    const [showProviderModal, setShowProviderModal] = useState(false);
    const [search, setSearch] = useState('');
    const [filterActivo, setFilterActivo] = useState('todos');

    const loadSupplies = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/supplies');
            if (res.ok) setSupplies(await res.json());
        } finally { setLoading(false); }
    };

    const loadProviders = async () => {
        const res = await fetch('/api/providers');
        if (res.ok) setProviders(await res.json());
    };

    useEffect(() => { loadSupplies(); loadProviders(); }, []);

    const handleToggleActive = async (supply, newVal) => {
        const res = await fetch(`/api/supplies/${supply.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: supply.nombre, unidad: supply.unidad, provider_id: supply.provider_id, activo: newVal, precio: supply.precio }),
        });
        if (res.ok) {
            setSupplies(prev => prev.map(s => s.id === supply.id ? { ...s, activo: newVal } : s));
            refetchCatalog();
        }
    };

    const exportSuppliesExcel = async () => {
        const XLSX = await import('xlsx');
        const rows = [...supplies]
            .sort((a, b) =>
                (a.providers?.name || '').localeCompare(b.providers?.name || '') ||
                a.nombre.localeCompare(b.nombre))
            .map(s => ({
                Insumo: s.nombre,
                Proveedor: s.providers?.name || 'Sin proveedor',
                Unidad: s.unidad || 'unidades',
                Precio: Number(s.precio) || 0,
                Estado: s.activo !== false ? 'Activo' : 'Inactivo',
            }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 40 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Insumos');
        downloadWorkbook(XLSX, wb, `Listado_Insumos_${getArgentinaDateStamp()}.xlsx`);
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
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 0.2rem' }}>Insumos</h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', margin: 0 }}>
                            {activeCount} de {supplies.length} insumos activos
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                        <button
                            onClick={exportSuppliesExcel}
                            disabled={supplies.length === 0}
                            style={{ padding: '0.65rem 1.1rem', background: 'var(--color-surface)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '10px', fontWeight: 600, fontSize: '0.92rem', cursor: supplies.length === 0 ? 'not-allowed' : 'pointer', opacity: supplies.length === 0 ? 0.6 : 1, transition: 'border-color 0.12s' }}
                            onMouseEnter={e => { if (supplies.length) e.currentTarget.style.borderColor = '#00AEEF'; }}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                        >
                            Descargar listado
                        </button>
                        <button
                            onClick={() => setShowProviderModal(true)}
                            style={{ padding: '0.65rem 1.1rem', background: 'var(--color-surface)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '10px', fontWeight: 600, fontSize: '0.92rem', cursor: 'pointer', transition: 'border-color 0.12s' }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = '#00AEEF'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                        >
                            + Nuevo proveedor
                        </button>
                        <button
                            onClick={() => setDrawerSupply({})}
                            style={{ padding: '0.65rem 1.25rem', background: '#00AEEF', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,174,239,0.25)', transition: 'opacity 0.15s, box-shadow 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,174,239,0.35)'}
                            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,174,239,0.25)'}
                        >
                            + Nuevo insumo
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar insumo..."
                        style={{ flex: '1 1 200px', padding: '0.55rem 0.85rem', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem', background: 'var(--color-surface)', color: 'var(--text-main)', outline: 'none', transition: 'border-color 0.12s' }}
                        onFocus={e => e.target.style.borderColor = '#00AEEF'}
                        onBlur={e => e.target.style.borderColor = 'var(--border-color)'} />
                    {['todos', 'activos', 'inactivos'].map(f => (
                        <button key={f} onClick={() => setFilterActivo(f)}
                            style={{ padding: '0.55rem 1rem', border: '1px solid', borderColor: filterActivo === f ? '#00AEEF' : 'var(--border-color)', borderRadius: '8px', background: filterActivo === f ? '#FDF4EC' : 'var(--color-surface)', color: filterActivo === f ? '#00AEEF' : 'var(--text-muted)', fontWeight: filterActivo === f ? 700 : 500, fontSize: '0.88rem', cursor: 'pointer', transition: 'all 0.12s', textTransform: 'capitalize' }}>
                            {f}
                        </button>
                    ))}
                </div>

                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
                        <SupplyRow key={s.id} supply={s} onEdit={setDrawerSupply} onToggleActive={handleToggleActive} />
                    ))}
                </div>
            </div>

            {drawerSupply !== null && (
                <SupplyDrawer
                    supply={drawerSupply}
                    providers={providers}
                    onClose={() => setDrawerSupply(null)}
                    onSaved={() => { setDrawerSupply(null); loadSupplies(); refetchCatalog(); }}
                />
            )}

            {showProviderModal && (
                <ProviderModal
                    onClose={() => setShowProviderModal(false)}
                    onCreated={(newProvider) => {
                        setProviders(prev => [...prev, newProvider].sort((a, b) => a.name.localeCompare(b.name)));
                        setShowProviderModal(false);
                    }}
                />
            )}
        </MainLayout>
    );
}
