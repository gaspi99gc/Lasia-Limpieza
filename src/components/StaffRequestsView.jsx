'use client';

import { useEffect, useMemo, useState } from 'react';
import { notify } from '@/lib/toast';
import { getSessionUser } from '@/lib/session';
import { useCatalog } from '@/lib/CatalogContext';
import { formatArgentinaDate, formatArgentinaDateTime } from '@/lib/datetime';
import SearchableSelect from '@/components/SearchableSelect';

const ESTADOS = [
    { key: 'pendiente', label: 'Pendiente', bg: '#FEF3C7', fg: '#92400E' },
    { key: 'en_proceso', label: 'Entrevista agendada', bg: '#DBEAFE', fg: '#1E40AF' },
    { key: 'cubierta', label: 'Cubierta', bg: '#DCFCE7', fg: '#166534' },
];
const ESTADO_BY_KEY = Object.fromEntries(ESTADOS.map(e => [e.key, e]));

const JORNADAS = [
    { key: 'completa', label: 'Jornada completa (8h)' },
    { key: 'media', label: 'Media jornada (4h)' },
    { key: 'turno', label: 'Turno' },
];
const JORNADA_LABEL = Object.fromEntries(JORNADAS.map(j => [j.key, j.label]));

const fieldLabel = { margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 };

const emptyForm = () => ({
    service_id: '', cantidad: 1, tipo_jornada: 'completa', urgencia: 'normal',
    fecha_necesaria: '', motivo: '', notas: '', estado: 'pendiente',
});

export default function StaffRequestsView() {
    const { services } = useCatalog();
    const [role, setRole] = useState(null);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterEstado, setFilterEstado] = useState('todos');
    const [pageSize, setPageSize] = useState(25);
    const [page, setPage] = useState(1);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyForm());
    const [saving, setSaving] = useState(false);

    // RRHH gestiona el estado (ver + cambiar estado), pero NO crea/edita/borra.
    // El jefe operativo crea/edita/borra sus solicitudes, pero no cambia el estado.
    // Admin puede todo.
    const canManageEstado = role === 'rrhh' || role === 'admin';
    const canEdit = role === 'jefe_operativo' || role === 'admin';

    useEffect(() => { setRole(getSessionUser()?.role || null); }, []);

    const loadRequests = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/staff-requests');
            const data = await res.json().catch(() => []);
            setRequests(Array.isArray(data) ? data : []);
        } catch {
            setRequests([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadRequests(); }, []);

    const filtered = useMemo(() => {
        // "Todas" muestra solo las activas (pendiente/en proceso); las cubiertas
        // salen de la pantalla principal y se consultan en el filtro "Cubierta".
        if (filterEstado === 'todos') return requests.filter(r => r.estado !== 'cubierta');
        return requests.filter(r => r.estado === filterEstado);
    }, [requests, filterEstado]);

    // Al cambiar de filtro o tamaño de hoja, volvemos a la primera página.
    useEffect(() => { setPage(1); }, [filterEstado, pageSize]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const paginated = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    }, [filtered, currentPage, pageSize]);

    const serviceName = (r) => r.service_name || services.find(s => Number(s.id) === Number(r.service_id))?.name || '—';

    const openNew = () => { setEditingId(null); setForm(emptyForm()); setModalOpen(true); };
    const openEdit = (r) => {
        setEditingId(r.id);
        setForm({
            service_id: r.service_id ? String(r.service_id) : '',
            cantidad: r.cantidad || 1,
            tipo_jornada: r.tipo_jornada || 'completa',
            urgencia: r.urgencia || 'normal',
            fecha_necesaria: r.fecha_necesaria || '',
            motivo: r.motivo || '',
            notas: r.notas || '',
            estado: r.estado || 'pendiente',
        });
        setModalOpen(true);
    };
    const closeModal = () => { setModalOpen(false); setEditingId(null); };

    const handleSave = async () => {
        if (!form.service_id) { notify.error('Elegí el servicio.'); return; }
        const user = getSessionUser();
        const payload = {
            ...form,
            cantidad: Number(form.cantidad) || 1,
            creado_por_nombre: `${user?.name || ''} ${user?.surname || ''}`.trim() || null,
            creado_por_rol: user?.role || null,
        };
        setSaving(true);
        try {
            const res = await fetch(editingId ? `/api/staff-requests/${editingId}` : '/api/staff-requests', {
                method: editingId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(data.error || 'No se pudo guardar la solicitud.'); return; }
            notify.success(editingId ? 'Solicitud actualizada' : 'Solicitud creada');
            closeModal();
            loadRequests();
        } catch {
            notify.error('Error de red al guardar.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (r) => {
        if (!confirm(`¿Eliminar la solicitud de ${serviceName(r)}? Esta acción no se puede deshacer.`)) return;
        try {
            const res = await fetch(`/api/staff-requests/${r.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                notify.error(data.error || 'No se pudo eliminar la solicitud.');
                return;
            }
            notify.success('Solicitud eliminada');
            loadRequests();
        } catch {
            notify.error('Error de red al eliminar.');
        }
    };

    // Cambio rapido de estado (solo RRHH/admin) desde la lista.
    const changeEstado = async (r, estado) => {
        try {
            const res = await fetch(`/api/staff-requests/${r.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...r, estado }),
            });
            if (!res.ok) { notify.error('No se pudo cambiar el estado.'); return; }
            loadRequests();
        } catch {
            notify.error('Error de red.');
        }
    };

    // Reabrir una solicitud cubierta (por si se marcó por error): vuelve a Pendiente.
    // El backend limpia cubierta_at al salir de 'cubierta'.
    const reabrir = async (r) => {
        if (!confirm(`¿Reabrir la solicitud de ${serviceName(r)}? Volverá a estado Pendiente.`)) return;
        changeEstado(r, 'pendiente');
    };

    const fmt = (d) => d ? formatArgentinaDate(d) : '—';

    return (
        <div className="solicitud-personal-view">
            <header className="page-header" style={{ marginBottom: '1.5rem' }}>
                <div>
                    <h1>Solicitud de Personal</h1>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Pedidos de operarios para los servicios. {canEdit ? 'Creá una solicitud cuando un servicio necesite más personal.' : 'Gestioná el estado de cada solicitud.'}
                    </p>
                </div>
                {canEdit && (
                    <div className="page-header-actions">
                        <button className="btn btn-primary" onClick={openNew}>+ Nueva solicitud</button>
                    </div>
                )}
            </header>

            {/* Filtro por estado + selector de tamaño de hoja */}
            <div className="card" style={{ padding: '0.9rem 1.25rem', marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                <button className={`btn ${filterEstado === 'todos' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }} onClick={() => setFilterEstado('todos')}>Todas</button>
                {ESTADOS.map(e => (
                    <button key={e.key} className={`btn ${filterEstado === e.key ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }} onClick={() => setFilterEstado(e.key)}>{e.label}</button>
                ))}
                {filtered.length > 0 && (
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        <span>Mostrar</span>
                        <select
                            value={pageSize}
                            onChange={(e) => setPageSize(Number(e.target.value))}
                            className="card"
                            style={{ margin: 0, padding: '0.25rem 0.5rem', fontSize: '0.82rem', fontWeight: 600 }}
                        >
                            {[25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <span>· {filtered.length} en total</span>
                    </div>
                )}
            </div>

            <div className="card" style={{ padding: 0 }}>
                <div className="table-container">
                    <table className="table mobile-cards-table">
                        <thead>
                            <tr>
                                <th>Servicio</th>
                                <th style={{ textAlign: 'center' }}>Cantidad</th>
                                <th>Jornada</th>
                                <th>Urgencia</th>
                                <th>Necesario para</th>
                                <th>Estado</th>
                                {canEdit && <th style={{ textAlign: 'right' }}>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {paginated.map(r => {
                                const est = ESTADO_BY_KEY[r.estado] || ESTADOS[0];
                                return (
                                    <tr key={r.id}>
                                        <td data-label="Servicio" style={{ fontWeight: 600 }}>{serviceName(r)}</td>
                                        <td data-label="Cantidad" style={{ textAlign: 'center' }}>{r.cantidad}</td>
                                        <td data-label="Jornada">{JORNADA_LABEL[r.tipo_jornada] || '—'}</td>
                                        <td data-label="Urgencia">
                                            {r.urgencia === 'urgente'
                                                ? <span style={{ color: 'var(--error)', fontWeight: 600 }}>Urgente</span>
                                                : 'Normal'}
                                        </td>
                                        <td data-label="Necesario para">{fmt(r.fecha_necesaria)}</td>
                                        <td data-label="Estado">
                                            {r.estado === 'cubierta' ? (
                                                // Cubierta: queda cerrada (badge fijo). Solo quien gestiona el estado puede reabrirla.
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    <span className="badge" style={{ background: est.bg, color: est.fg }}>🔒 {est.label}</span>
                                                    {canManageEstado && (
                                                        <button
                                                            className="btn btn-secondary"
                                                            style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem' }}
                                                            onClick={() => reabrir(r)}
                                                            title="Reabrir esta solicitud (volver a Pendiente)"
                                                        >
                                                            Reabrir
                                                        </button>
                                                    )}
                                                </div>
                                            ) : canManageEstado ? (
                                                <select
                                                    value={r.estado}
                                                    onChange={(e) => changeEstado(r, e.target.value)}
                                                    className="card"
                                                    style={{ margin: 0, padding: '0.3rem 0.5rem', fontSize: '0.82rem', fontWeight: 600 }}
                                                >
                                                    {ESTADOS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                                                </select>
                                            ) : (
                                                <span className="badge" style={{ background: est.bg, color: est.fg }}>{est.label}</span>
                                            )}
                                            {r.estado === 'cubierta' && r.cubierta_at && (
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                                                    Cubierta el {formatArgentinaDateTime(r.cubierta_at)}
                                                </div>
                                            )}
                                        </td>
                                        {canEdit && (
                                            <td data-label="Acciones" className="mobile-hide-label" style={{ textAlign: 'right' }}>
                                                <div className="table-action-group">
                                                    <button className="btn btn-secondary" onClick={() => openEdit(r)}>✏️</button>
                                                    <button className="btn btn-secondary" style={{ color: 'var(--error)' }} onClick={() => handleDelete(r)}>🗑️</button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                            {!loading && filtered.length === 0 && (
                                <tr>
                                    <td colSpan={canEdit ? 7 : 6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                                        {filterEstado === 'todos' ? 'No hay solicitudes de personal todavía.' : 'No hay solicitudes en este estado.'}
                                    </td>
                                </tr>
                            )}
                            {loading && (
                                <tr><td colSpan={canEdit ? 7 : 6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>Cargando…</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Navegación entre hojas */}
            {totalPages > 1 && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                    gap: '0.4rem', marginTop: '0.9rem',
                    fontSize: '0.82rem', color: 'var(--text-muted)',
                }}>
                    <button
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                    >
                        ‹ Anterior
                    </button>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                        Hoja {currentPage} de {totalPages}
                    </span>
                    <button
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                    >
                        Siguiente ›
                    </button>
                </div>
            )}

            {modalOpen && (
                <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
                    <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
                        <h2 style={{ margin: 0 }}>{editingId ? 'Editar solicitud' : 'Nueva solicitud de personal'}</h2>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', marginTop: '1rem' }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', ...fieldLabel }}>
                                Servicio
                                <SearchableSelect
                                    options={[...services].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(s => ({ value: s.id, label: s.name }))}
                                    value={form.service_id}
                                    onChange={(val) => setForm(f => ({ ...f, service_id: val }))}
                                    placeholder="Elegí un servicio…"
                                    searchPlaceholder="Escribí 3 letras del servicio..."
                                    minChars={3}
                                />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', ...fieldLabel }}>
                                Cantidad
                                <input type="number" min="1" step="1" className="card" style={{ margin: 0, fontWeight: 'normal', width: '90px' }} value={form.cantidad} onChange={(e) => setForm(f => ({ ...f, cantidad: e.target.value }))} />
                            </label>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', ...fieldLabel }}>
                                Tipo de jornada
                                <select className="card" style={{ margin: 0, fontWeight: 'normal' }} value={form.tipo_jornada} onChange={(e) => setForm(f => ({ ...f, tipo_jornada: e.target.value }))}>
                                    {JORNADAS.map(j => <option key={j.key} value={j.key}>{j.label}</option>)}
                                </select>
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', ...fieldLabel }}>
                                Urgencia
                                <select className="card" style={{ margin: 0, fontWeight: 'normal' }} value={form.urgencia} onChange={(e) => setForm(f => ({ ...f, urgencia: e.target.value }))}>
                                    <option value="normal">Normal</option>
                                    <option value="urgente">Urgente</option>
                                </select>
                            </label>
                        </div>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.75rem', ...fieldLabel }}>
                            Necesario para (fecha)
                            <input type="date" className="card" style={{ margin: 0, fontWeight: 'normal' }} value={form.fecha_necesaria} onChange={(e) => setForm(f => ({ ...f, fecha_necesaria: e.target.value }))} />
                        </label>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.75rem', ...fieldLabel }}>
                            Motivo
                            <input type="text" className="card" style={{ margin: 0, fontWeight: 'normal' }} placeholder="Ej. Reemplazo por baja, ampliación, cliente nuevo…" value={form.motivo} onChange={(e) => setForm(f => ({ ...f, motivo: e.target.value }))} />
                        </label>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.75rem', ...fieldLabel }}>
                            Notas / observaciones
                            <textarea className="card" style={{ margin: 0, fontWeight: 'normal', minHeight: '70px', resize: 'vertical' }} placeholder="Detalles adicionales…" value={form.notas} onChange={(e) => setForm(f => ({ ...f, notas: e.target.value }))} />
                        </label>

                        {canManageEstado && editingId && (
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.75rem', ...fieldLabel }}>
                                Estado
                                <select className="card" style={{ margin: 0, fontWeight: 'normal' }} value={form.estado} onChange={(e) => setForm(f => ({ ...f, estado: e.target.value }))}>
                                    {ESTADOS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                                </select>
                            </label>
                        )}

                        <div className="config-modal-actions" style={{ marginTop: '1.25rem' }}>
                            <button className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'Guardando…' : 'Guardar solicitud'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
