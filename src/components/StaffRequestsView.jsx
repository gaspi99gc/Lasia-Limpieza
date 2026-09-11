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
    { key: 'completa', label: 'Jornada completa (8h)', corto: 'Completa' },
    { key: 'media', label: 'Media jornada (4h)', corto: 'Media' },
    { key: 'turno', label: 'Turno', corto: 'Turno' },
];
const JORNADA_LABEL = Object.fromEntries(JORNADAS.map(j => [j.key, j.label]));
const JORNADA_CORTO = Object.fromEntries(JORNADAS.map(j => [j.key, j.corto]));

// "de 6 a 14" es lo que define si a la persona le sirve el puesto; "8 horas"
// solo no le dice nada a quien tiene que salir a buscar a alguien.
const hhmm = (t) => (t ? String(t).slice(0, 5) : null);
const horarioTexto = (r) => {
    const d = hhmm(r.hora_desde), h = hhmm(r.hora_hasta);
    if (d && h) return `${d} a ${h}`;
    if (d) return `desde ${d}`;
    if (h) return `hasta ${h}`;
    return null;
};
// El horario del segundo servicio, cuando lo hay.
const segundoHorario = (r) =>
    horarioTexto({ hora_desde: r.hora_desde_2, hora_hasta: r.hora_hasta_2 });

const fieldLabel = { margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 };

const emptyForm = () => ({
    service_id: '', cantidad: 1, tipo_jornada: 'completa', urgencia: 'normal',
    hora_desde: '', hora_hasta: '',
    // Segundo servicio: hay gente que sale de un servicio y entra al otro. Es UN
    // puesto con dos lugares, no dos búsquedas: se cubre con una sola persona.
    service_id_2: '', hora_desde_2: '', hora_hasta_2: '',
    dias: [],
    fecha_necesaria: '', motivo: '', notas: '', estado: 'pendiente',
});

// Días de la semana. El orden es el real, no el alfabético.
const DIAS = [
    { k: 'lun', c: 'L', n: 'Lunes' },
    { k: 'mar', c: 'M', n: 'Martes' },
    { k: 'mie', c: 'M', n: 'Miércoles' },
    { k: 'jue', c: 'J', n: 'Jueves' },
    { k: 'vie', c: 'V', n: 'Viernes' },
    { k: 'sab', c: 'S', n: 'Sábado' },
    { k: 'dom', c: 'D', n: 'Domingo' },
];
const SEMANA = ['lun', 'mar', 'mie', 'jue', 'vie'];

// El resumen en palabras de lo marcado. Los botones se leen de un vistazo, pero
// la frase confirma lo elegido sin tener que interpretarlos.
export function resumenDias(dias) {
    const d = Array.isArray(dias) ? dias : String(dias || '').split(',').filter(Boolean);
    if (!d.length) return '';
    const set = new Set(d);
    const enOrden = DIAS.filter(x => set.has(x.k));
    if (enOrden.length === 7) return 'Todos los días';
    if (enOrden.length === 6 && !set.has('dom')) return 'Lunes a sábado';
    if (enOrden.length === 5 && SEMANA.every(k => set.has(k))) return 'Lunes a viernes';
    if (enOrden.length === 2 && set.has('sab') && set.has('dom')) return 'Fines de semana';
    if (enOrden.length === 1) return enOrden[0].n;
    const nombres = enOrden.map(x => x.n);
    return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

export default function StaffRequestsView() {
    const { services } = useCatalog();
    // Las mismas opciones para los dos selectores de servicio.
    const serviceOptions = useMemo(
        () => [...services]
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .map(s => ({ value: s.id, label: s.name })),
        [services]
    );
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
    const [notesDetail, setNotesDetail] = useState(null); // solicitud cuyas notas se están viendo

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
            hora_desde: hhmm(r.hora_desde) || '',
            hora_hasta: hhmm(r.hora_hasta) || '',
            service_id_2: r.service_id_2 ? String(r.service_id_2) : '',
            hora_desde_2: hhmm(r.hora_desde_2) || '',
            hora_hasta_2: hhmm(r.hora_hasta_2) || '',
            dias: String(r.dias || '').split(',').filter(Boolean),
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
            // El " " es el marcador de "agregué el bloque pero todavía no elegí
            // el servicio": no se manda.
            service_id_2: String(form.service_id_2).trim() || null,
            dias: form.dias.join(','),
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
                        <button
                            className="btn btn-primary"
                            onClick={openNew}
                            style={{
                                padding: '0.8rem 1.6rem',
                                fontSize: '1.05rem',
                                fontWeight: 700,
                                borderRadius: '10px',
                            }}
                        >
                            + Nueva solicitud
                        </button>
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
                                // Una urgente sin cubrir tiene que saltar a la vista
                                // sin que haya que leer la columna de urgencia.
                                const urgentePendiente = r.urgencia === 'urgente' && r.estado !== 'cubierta';
                                return (
                                    <tr
                                        key={r.id}
                                        style={urgentePendiente ? { boxShadow: 'inset 3px 0 0 var(--error)' } : undefined}
                                    >
                                        <td data-label="Servicio" style={{ fontWeight: 600 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                {serviceName(r)}
                                                {(r.motivo || r.notas) && (
                                                    <button
                                                        onClick={() => setNotesDetail(r)}
                                                        title="Ver motivo / notas"
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: 0, lineHeight: 1 }}
                                                    >
                                                        💬
                                                    </button>
                                                )}
                                            </div>
                                            {/* El segundo servicio va acá arriba y no en las
                                                notas: cambia a quién se busca, porque la misma
                                                persona tiene que poder cubrir los dos. */}
                                            {r.service_name_2 && (
                                                <div style={{ fontWeight: 600, fontSize: '0.82rem', marginTop: '0.2rem' }}>
                                                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>+ también </span>
                                                    {r.service_name_2}
                                                    {segundoHorario(r) && (
                                                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {segundoHorario(r)}</span>
                                                    )}
                                                </div>
                                            )}
                                            {/* El motivo se lee acá y no escondido detrás del 💬:
                                                es el contexto que necesita RRHH para priorizar. */}
                                            {r.motivo && (
                                                <div style={{ fontWeight: 400, fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                                    {r.motivo}
                                                </div>
                                            )}
                                        </td>
                                        <td data-label="Cantidad" style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.05rem' }}>{r.cantidad}</td>
                                        <td data-label="Jornada">
                                            <div>{JORNADA_CORTO[r.tipo_jornada] || '—'}</div>
                                            {horarioTexto(r) && (
                                                <div style={{ fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                                    {horarioTexto(r)}
                                                </div>
                                            )}
                                            {r.dias && (
                                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                    {resumenDias(r.dias)}
                                                </div>
                                            )}
                                        </td>
                                        <td data-label="Urgencia">
                                            {r.urgencia === 'urgente'
                                                ? <span className="badge" style={{ background: '#FEE2E2', color: '#991B1B', fontWeight: 700 }}>Urgente</span>
                                                : <span style={{ color: 'var(--text-muted)' }}>Normal</span>}
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
                                                    style={{ margin: 0, padding: '0.3rem 0.5rem', fontSize: '0.82rem', fontWeight: 700, background: est.bg, color: est.fg, border: `1px solid ${est.fg}33` }}
                                                >
                                                    {ESTADOS.map(e => <option key={e.key} value={e.key} style={{ background: 'var(--color-surface)', color: 'var(--text-main)' }}>{e.label}</option>)}
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
                                    options={serviceOptions}
                                    value={form.service_id}
                                    onChange={(val) => setForm(f => ({ ...f, service_id: val }))}
                                    placeholder="Elegí un servicio…"
                                    searchPlaceholder="Escribí 3 letras del servicio..."
                                    minChars={3}
                                />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', ...fieldLabel }}>
                                Cantidad
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    className="card"
                                    style={{ margin: 0, fontWeight: 'normal', width: '90px' }}
                                    value={form.cantidad}
                                    onChange={(e) => setForm(f => ({ ...f, cantidad: e.target.value.replace(/\D/g, '') }))}
                                />
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

                        {/* El horario concreto: muchos pedidos no son los clásicos,
                            y para salir a buscar a alguien "de 6 a 14" dice mucho
                            más que "8 horas". */}
                        <div style={{ marginTop: '0.75rem' }}>
                            <div style={{ ...fieldLabel, marginBottom: '0.3rem' }}>
                                Horario que se necesita <span style={{ fontWeight: 400 }}>(opcional, pero ayuda mucho a buscar)</span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <input
                                    type="time"
                                    className="card"
                                    style={{ margin: 0, fontWeight: 'normal', width: '130px' }}
                                    value={form.hora_desde}
                                    onChange={(e) => setForm(f => ({ ...f, hora_desde: e.target.value }))}
                                />
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>a</span>
                                <input
                                    type="time"
                                    className="card"
                                    style={{ margin: 0, fontWeight: 'normal', width: '130px' }}
                                    value={form.hora_hasta}
                                    onChange={(e) => setForm(f => ({ ...f, hora_hasta: e.target.value }))}
                                />
                                {(form.hora_desde || form.hora_hasta) && (
                                    <button
                                        className="btn btn-secondary"
                                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                                        onClick={() => setForm(f => ({ ...f, hora_desde: '', hora_hasta: '' }))}
                                    >
                                        Borrar
                                    </button>
                                )}
                            </div>
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                                Si el turno es partido o cambia según el día, ponelo en las notas.
                            </div>
                        </div>

                        {/* Días de la semana. Siete botones que se prenden y
                            apagan, con el resumen escrito debajo: es el patrón
                            que usan las apps de turnos (Deputy, When I Work) y
                            se lee sin abrir nada. */}
                        <div style={{ marginTop: '0.75rem' }}>
                            <div style={{ ...fieldLabel, marginBottom: '0.35rem' }}>
                                Días que se necesita <span style={{ fontWeight: 400 }}>(opcional)</span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                {DIAS.map((d) => {
                                    const activo = form.dias.includes(d.k);
                                    const finde = d.k === 'sab' || d.k === 'dom';
                                    return (
                                        <button
                                            key={d.k}
                                            type="button"
                                            title={d.n}
                                            onClick={() => setForm(f => ({
                                                ...f,
                                                dias: f.dias.includes(d.k)
                                                    ? f.dias.filter(x => x !== d.k)
                                                    : [...f.dias, d.k],
                                            }))}
                                            style={{
                                                width: '2.3rem', height: '2.3rem', borderRadius: '8px',
                                                cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem',
                                                border: `1px solid ${activo ? 'var(--color-primary)' : 'var(--border-color)'}`,
                                                background: activo ? 'var(--color-primary)' : 'var(--color-surface)',
                                                // El fin de semana se distingue solo, sin tener que leer la letra.
                                                color: activo ? '#fff' : (finde ? 'var(--text-muted)' : 'var(--text-main)'),
                                            }}
                                        >
                                            {d.c}
                                        </button>
                                    );
                                })}
                                {form.dias.length > 0 && (
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                                        onClick={() => setForm(f => ({ ...f, dias: [] }))}
                                    >
                                        Borrar
                                    </button>
                                )}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: form.dias.length ? 'var(--color-primary)' : 'var(--text-muted)', marginTop: '0.35rem', fontWeight: form.dias.length ? 600 : 400 }}>
                                {form.dias.length ? resumenDias(form.dias) : 'Sin especificar'}
                            </div>
                        </div>

                        {/* Segundo servicio: la misma persona cubriendo dos
                            lugares. Aparece solo si se pide, para no cargar el
                            formulario en el caso normal. */}
                        <div style={{ marginTop: '0.75rem' }}>
                            {!form.service_id_2 ? (
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.85rem' }}
                                    onClick={() => setForm(f => ({ ...f, service_id_2: ' ' }))}
                                >
                                    + Agregar un segundo servicio
                                </button>
                            ) : (
                                <div className="card" style={{ padding: '0.85rem', margin: 0, background: 'var(--color-muted-surface)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        <div style={{ ...fieldLabel }}>Segundo servicio</div>
                                        <button
                                            type="button"
                                            onClick={() => setForm(f => ({ ...f, service_id_2: '', hora_desde_2: '', hora_hasta_2: '' }))}
                                            style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: 1 }}
                                            title="Sacar el segundo servicio"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    <SearchableSelect
                                        options={serviceOptions}
                                        value={form.service_id_2.trim()}
                                        onChange={(v) => setForm(f => ({ ...f, service_id_2: v || ' ' }))}
                                        placeholder="Elegí el otro servicio…"
                                        searchPlaceholder="Escribí 3 letras del servicio..."
                                        minChars={3}
                                    />
                                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                                        <input
                                            type="time"
                                            className="card"
                                            style={{ margin: 0, fontWeight: 'normal', width: '130px' }}
                                            value={form.hora_desde_2}
                                            onChange={(e) => setForm(f => ({ ...f, hora_desde_2: e.target.value }))}
                                        />
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>a</span>
                                        <input
                                            type="time"
                                            className="card"
                                            style={{ margin: 0, fontWeight: 'normal', width: '130px' }}
                                            value={form.hora_hasta_2}
                                            onChange={(e) => setForm(f => ({ ...f, hora_hasta_2: e.target.value }))}
                                        />
                                    </div>
                                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                                        Es la misma persona cubriendo los dos servicios: se busca y se cubre una sola vez.
                                    </div>
                                </div>
                            )}
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

            {/* Detalle de motivo / notas (solo lectura) */}
            {notesDetail && (
                <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setNotesDetail(null); }}>
                    <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                        <h2 style={{ margin: 0 }}>{serviceName(notesDetail)}</h2>
                        <p style={{ margin: '0.25rem 0 1.25rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Detalle de la solicitud
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Qué se pidió, en una línea: sin esto el detalle
                                mostraba las notas sin decir de qué pedido son. */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.25rem', padding: '0.75rem 0.9rem', background: 'var(--color-muted-surface)', borderRadius: '8px', fontSize: '0.88rem' }}>
                                <span><strong>{notesDetail.cantidad}</strong> {Number(notesDetail.cantidad) === 1 ? 'persona' : 'personas'}</span>
                                <span>{JORNADA_CORTO[notesDetail.tipo_jornada] || '—'}</span>
                                {horarioTexto(notesDetail) && <span style={{ fontWeight: 700 }}>{horarioTexto(notesDetail)}</span>}
                                {notesDetail.fecha_necesaria && <span>para el {fmt(notesDetail.fecha_necesaria)}</span>}
                                {notesDetail.urgencia === 'urgente' && (
                                    <span className="badge" style={{ background: '#FEE2E2', color: '#991B1B', fontWeight: 700 }}>Urgente</span>
                                )}
                            </div>
                            <div>
                                <div style={{ ...fieldLabel, marginBottom: '0.25rem' }}>Motivo</div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{notesDetail.motivo || '—'}</div>
                            </div>
                            <div>
                                <div style={{ ...fieldLabel, marginBottom: '0.25rem' }}>Notas / observaciones</div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>{notesDetail.notas || '—'}</div>
                            </div>
                            {notesDetail.creado_por_nombre && (
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                                    Solicitado por {notesDetail.creado_por_nombre}
                                    {notesDetail.created_at ? ` · ${formatArgentinaDateTime(notesDetail.created_at)}` : ''}
                                </div>
                            )}
                        </div>

                        <div className="config-modal-actions" style={{ marginTop: '1.5rem' }}>
                            <button className="btn btn-secondary" onClick={() => setNotesDetail(null)}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
