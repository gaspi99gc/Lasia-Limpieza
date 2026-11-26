'use client';

import { useEffect, useMemo, useState } from 'react';
import { notify } from '@/lib/toast';
import { getSessionUser } from '@/lib/session';
import { useCatalog } from '@/lib/CatalogContext';
import { formatArgentinaDate, formatArgentinaDateTime } from '@/lib/datetime';
import SearchableSelect from '@/components/SearchableSelect';
import { SEXOS, palabraPersonas } from '@/lib/sexo-solicitud';
import { notaNueva } from '@/lib/nota-solicitud';
// Días, personas al cubrir y PDF: lógica pura con tests (2026-11-27).
import { DIAS, resumenDias, limpiarPersonas } from '@/lib/solicitud-personal';
import { descargarPdfSolicitudes } from '@/lib/pdf-solicitudes';

// Para cubrir vacaciones: violeta, sin emoji (pedido del usuario). El rojo queda
// para urgente.
const VIOLETA = { bg: '#EDE9FE', fg: '#5B21B6', borde: '#7C3AED' };

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
    sexo: 'indistinto',
    hora_desde: '', hora_hasta: '',
    // Segundo servicio: hay gente que sale de un servicio y entra al otro. Es UN
    // puesto con dos lugares, no dos búsquedas: se cubre con una sola persona.
    service_id_2: '', hora_desde_2: '', hora_hasta_2: '',
    // dias_2 vacío = los mismos días que el primer servicio.
    dias: [], dias_2: [],
    fecha_necesaria: '', motivo: '', notas: '', estado: 'pendiente',
    // 2026-11-27: quién recibe a la persona (solo en la solicitud) y si es para
    // cubrir vacaciones.
    encargado_nombre: '', por_vacaciones: false,
});

// Los siete botones de días. Se usan para el servicio principal y para el
// segundo, así que van en un componente: dos copias del mismo bloque terminan
// separándose con el primer cambio.
function SelectorDias({ valor, onChange, onBorrar }) {
    return (
        <>
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                {DIAS.map((d) => {
                    const activo = valor.includes(d.k);
                    const finde = d.k === 'sab' || d.k === 'dom';
                    return (
                        <button
                            key={d.k}
                            type="button"
                            title={d.n}
                            onClick={() => onChange(
                                valor.includes(d.k) ? valor.filter(x => x !== d.k) : [...valor, d.k]
                            )}
                            style={{
                                width: '2.3rem', height: '2.3rem', borderRadius: '8px',
                                cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem',
                                border: `1px solid ${activo ? 'var(--color-primary)' : 'var(--border-color)'}`,
                                background: activo ? 'var(--color-primary)' : 'var(--color-surface)',
                                // El fin de semana se distingue solo, sin leer la letra.
                                color: activo ? '#fff' : (finde ? 'var(--text-muted)' : 'var(--text-main)'),
                            }}
                        >
                            {d.c}
                        </button>
                    );
                })}
                {valor.length > 0 && onBorrar && (
                    <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                        onClick={onBorrar}
                    >
                        Borrar
                    </button>
                )}
            </div>
            <div style={{ fontSize: '0.8rem', color: valor.length ? 'var(--color-primary)' : 'var(--text-muted)', marginTop: '0.35rem', fontWeight: valor.length ? 600 : 400 }}>
                {valor.length ? resumenDias(valor) : 'Sin especificar'}
            </div>
        </>
    );
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
    // Si el segundo servicio va otros días distintos a los del primero.
    const [diasSegundoAparte, setDiasSegundoAparte] = useState(false);
    const [form, setForm] = useState(emptyForm());
    const [saving, setSaving] = useState(false);
    const [notesDetail, setNotesDetail] = useState(null); // solicitud cuyas notas se están viendo
    // "Guardar y cargar otra igual": las que se cargan así comparten este grupo,
    // para que el tablero de rotación las cuente como un solo pedido.
    const [grupoId, setGrupoId] = useState(null);
    // El cuadro "¿Quién entra al puesto?" al pasar una solicitud a Cubierta.
    const [cubriendo, setCubriendo] = useState(null);   // { solicitud, personas: [{dni, nombre}] }
    const [bajandoPdf, setBajandoPdf] = useState(false);

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
        // Las que se piden para cubrir vacaciones y siguen abiertas.
        if (filterEstado === 'vacaciones') return requests.filter(r => r.por_vacaciones && r.estado !== 'cubierta');
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

    const openNew = () => { setEditingId(null); setGrupoId(null); setForm(emptyForm()); setDiasSegundoAparte(false); setModalOpen(true); };
    const openEdit = (r) => {
        setEditingId(r.id);
        // Si la solicitud tiene días propios para el segundo servicio, el bloque
        // se abre ya desplegado.
        setDiasSegundoAparte(!!r.dias_2);
        setForm({
            service_id: r.service_id ? String(r.service_id) : '',
            cantidad: r.cantidad || 1,
            tipo_jornada: r.tipo_jornada || 'completa',
            urgencia: r.urgencia || 'normal',
            sexo: r.sexo || 'indistinto',
            hora_desde: hhmm(r.hora_desde) || '',
            hora_hasta: hhmm(r.hora_hasta) || '',
            service_id_2: r.service_id_2 ? String(r.service_id_2) : '',
            hora_desde_2: hhmm(r.hora_desde_2) || '',
            hora_hasta_2: hhmm(r.hora_hasta_2) || '',
            dias: String(r.dias || '').split(',').filter(Boolean),
            dias_2: String(r.dias_2 || '').split(',').filter(Boolean),
            fecha_necesaria: r.fecha_necesaria || '',
            motivo: r.motivo || '',
            notas: r.notas || '',
            estado: r.estado || 'pendiente',
            encargado_nombre: r.encargado_nombre || '',
            por_vacaciones: !!r.por_vacaciones,
        });
        setModalOpen(true);
    };
    const closeModal = () => { setModalOpen(false); setEditingId(null); setGrupoId(null); };

    // otraIgual: guarda y deja el formulario lleno para cargar la siguiente del
    // mismo pedido (por ejemplo, la misma búsqueda con otro sexo).
    const handleSave = async (otraIgual = false) => {
        if (!form.service_id) { notify.error('Elegí el servicio.'); return; }
        const user = getSessionUser();
        const grupo = !editingId && (otraIgual || grupoId) ? (grupoId || crypto.randomUUID()) : undefined;
        const payload = {
            ...form,
            ...(grupo && { grupo_id: grupo }),
            cantidad: Number(form.cantidad) || 1,
            // El " " es el marcador de "agregué el bloque pero todavía no elegí
            // el servicio": no se manda.
            service_id_2: String(form.service_id_2).trim() || null,
            dias: form.dias.join(','),
            // Solo se manda si de verdad son otros días; si no, queda en null y
            // se entiende como "los mismos del primer servicio".
            dias_2: diasSegundoAparte ? form.dias_2.join(',') : '',
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
            loadRequests();
            if (otraIgual) {
                // El formulario queda como estaba: se cambia lo distinto y se guarda.
                setGrupoId(grupo);
                notify.success('Solicitud creada. Cambiá lo que haga falta y guardá la siguiente.');
                return;
            }
            notify.success(editingId ? 'Solicitud actualizada' : 'Solicitud creada');
            closeModal();
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

    // Cambio rapido de estado (solo RRHH/admin) desde la lista. Pasar a
    // Cubierta abre primero el cuadro "¿Quién entra al puesto?" (2026-11-27).
    const changeEstado = async (r, estado) => {
        if (estado === 'cubierta') {
            const pedidas = Math.max(1, Number(r.cantidad) || 1);
            setCubriendo({ solicitud: r, personas: Array.from({ length: pedidas }, () => ({ dni: '', nombre: '' })) });
            return;
        }
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

    // Guarda quién entró y la marca Cubierta. Si falta algo, el cuadro queda
    // abierto; Cancelar la deja en el estado que tenía.
    const confirmarCubierta = async () => {
        const { solicitud: r, personas } = cubriendo;
        const limpio = limpiarPersonas(personas, r.cantidad);
        if (limpio.error) { notify.error(limpio.error); return; }
        setSaving(true);
        try {
            const res = await fetch(`/api/staff-requests/${r.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...r, estado: 'cubierta', personas_tomadas: limpio.personas }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(data.error || 'No se pudo marcar como cubierta.'); return; }
            notify.success('Solicitud cubierta');
            setCubriendo(null);
            loadRequests();
        } catch {
            notify.error('Error de red.');
        } finally {
            setSaving(false);
        }
    };

    const bajarPdf = async () => {
        setBajandoPdf(true);
        try {
            await descargarPdfSolicitudes(filtered, filterEstado);
        } catch {
            notify.error('No se pudo armar el PDF.');
        } finally {
            setBajandoPdf(false);
        }
    };

    // Reabrir una solicitud cubierta (por si se marcó por error): vuelve a Pendiente.
    // El backend limpia cubierta_at al salir de 'cubierta'.
    const reabrir = async (r) => {
        if (!confirm(`¿Reabrir la solicitud de ${serviceName(r)}? Volverá a estado Pendiente.`)) return;
        changeEstado(r, 'pendiente');
    };

    // Abrir la nota. Si la abre RRHH, deja de ser "Nota nueva" (admin la ve
    // marcada igual, pero abrirla no se la saca a RRHH).
    const abrirNota = async (r) => {
        setNotesDetail(r);
        if (role !== 'rrhh' || !notaNueva(r)) return;
        try {
            const res = await fetch(`/api/staff-requests/${r.id}`, { method: 'PATCH' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.nota_vista_at) return;
            const vista = { nota_vista_at: data.nota_vista_at, nota_vista_por: data.nota_vista_por };
            setRequests(rs => rs.map(x => (x.id === r.id ? { ...x, ...vista } : x)));
            setNotesDetail(d => (d && d.id === r.id ? { ...d, ...vista } : d));
        } catch {
            // Si falla, la etiqueta sigue: se marca la próxima vez que la abra.
        }
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
                {(canEdit || canManageEstado) && (
                    // flexShrink 0: en compu, los dos botones van uno al lado del otro.
                    // flex '0 0 auto' en cada botón: en el celular la regla general
                    // (columna con base de 160px) los estiraba a 160px de alto.
                    <div className="page-header-actions" style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
                        {/* Para tenerlas en papel (RRHH, 2026-11-27): baja lo
                            que se está viendo con el filtro. */}
                        {canManageEstado && (
                            <button className="btn btn-secondary" style={{ flex: '0 0 auto' }} onClick={bajarPdf} disabled={bajandoPdf || !filtered.length}>
                                {bajandoPdf ? 'Armando…' : 'Descargar PDF'}
                            </button>
                        )}
                        {canEdit && (
                            <button
                                className="btn btn-primary"
                                onClick={openNew}
                                style={{
                                    flex: '0 0 auto',
                                    padding: '0.8rem 1.6rem',
                                    fontSize: '1.05rem',
                                    fontWeight: 700,
                                    borderRadius: '10px',
                                }}
                            >
                                + Nueva solicitud
                            </button>
                        )}
                    </div>
                )}
            </header>

            {/* Filtro por estado + selector de tamaño de hoja */}
            <div className="card" style={{ padding: '0.9rem 1.25rem', marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                <button className={`btn ${filterEstado === 'todos' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }} onClick={() => setFilterEstado('todos')}>Todas</button>
                {ESTADOS.map(e => (
                    <button key={e.key} className={`btn ${filterEstado === e.key ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }} onClick={() => setFilterEstado(e.key)}>{e.label}</button>
                ))}
                <button className={`btn ${filterEstado === 'vacaciones' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }} onClick={() => setFilterEstado('vacaciones')}>Vacaciones</button>
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
                                {/* Ancho mínimo: con el estado entero, el servicio quedaba en tres renglones. */}
                                <th style={{ minWidth: '11rem' }}>Servicio</th>
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
                                // Para cubrir vacaciones: fondo violeta suave y raya
                                // violeta, salvo que sea urgente (la raya queda roja).
                                const vacaciones = r.por_vacaciones && r.estado !== 'cubierta';
                                const filaStyle = {
                                    ...(vacaciones && { background: `color-mix(in srgb, ${VIOLETA.borde} 6%, transparent)` }),
                                    ...(urgentePendiente
                                        ? { boxShadow: 'inset 3px 0 0 var(--error)' }
                                        : vacaciones && { boxShadow: `inset 3px 0 0 ${VIOLETA.borde}` }),
                                };
                                return (
                                    <tr key={r.id} style={filaStyle}>
                                        <td data-label="Servicio" style={{ fontWeight: 600 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                {/* El nombre abre el detalle: dirección,
                                                    supervisor, encargado y la nota. */}
                                                <button
                                                    type="button"
                                                    onClick={() => abrirNota(r)}
                                                    title="Ver el detalle de la solicitud"
                                                    style={{
                                                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                                        font: 'inherit', fontWeight: 600, color: 'inherit', textAlign: 'left',
                                                        textDecoration: 'underline', textDecorationColor: 'var(--border-color)', textUnderlineOffset: '3px',
                                                    }}
                                                >
                                                    {serviceName(r)}
                                                </button>
                                                {(r.motivo || r.notas) && (
                                                    <button
                                                        onClick={() => abrirNota(r)}
                                                        title="Ver motivo / notas"
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: 0, lineHeight: 1 }}
                                                    >
                                                        💬
                                                    </button>
                                                )}
                                                {/* "Nota nueva" (2026-11-27): hasta que RRHH la
                                                    abre. El 💬 solo se veía poco. */}
                                                {canManageEstado && notaNueva(r) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => abrirNota(r)}
                                                        title="La jefa operativa dejó una nota que RRHH todavía no abrió"
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                                            background: 'var(--color-primary)', color: '#fff', border: 'none',
                                                            borderRadius: '999px', padding: '0.15rem 0.6rem', cursor: 'pointer',
                                                            fontSize: '0.72rem', fontWeight: 700, lineHeight: 1.4, whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        <span aria-hidden="true" style={{ width: '0.45rem', height: '0.45rem', borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
                                                        Nota nueva
                                                    </button>
                                                )}
                                                {r.por_vacaciones && <EtiquetaVacaciones />}
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
                                                    {/* Solo si van días distintos: si son los mismos
                                                        ya se leen arriba y repetirlos es ruido. */}
                                                    {r.dias_2 && (
                                                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {resumenDias(r.dias_2)}</span>
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
                                        <td data-label="Cantidad" style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.05rem' }}>
                                            {r.cantidad}
                                            {/* Solo si se pidió hombre o mujer: indistinto
                                                es lo normal y no hace falta decirlo. */}
                                            {r.sexo && r.sexo !== 'indistinto' && (
                                                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                                    {palabraPersonas(r.cantidad, r.sexo)}
                                                </div>
                                            )}
                                        </td>
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
                                                    // width auto: la regla general (select al 100%) lo
                                                    // achicaba con la columna y se leía "Pendient".
                                                    // fieldSizing: mide lo que la opción elegida (Chrome y
                                                    // Edge); así la tabla entra a 1280 aun como admin.
                                                    style={{ width: 'auto', fieldSizing: 'content', margin: 0, padding: '0.3rem 0.5rem', fontSize: '0.82rem', fontWeight: 700, background: est.bg, color: est.fg, border: `1px solid ${est.fg}33` }}
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
                                            {/* Quién entró (lo carga RRHH al marcarla Cubierta). */}
                                            {r.estado === 'cubierta' && <PersonasTomadas personas={r.personas_tomadas} />}
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

                        {/* Sexo (2026-11-26): tres botones a la vista, como los días,
                            porque se elige uno de tres y no hace falta abrir nada. */}
                        <div style={{ marginTop: '0.75rem' }}>
                            <div style={{ ...fieldLabel, marginBottom: '0.35rem' }}>Sexo</div>
                            <div role="radiogroup" aria-label="Sexo" style={{ display: 'flex', gap: '0.4rem' }}>
                                {SEXOS.map((s) => {
                                    const activo = form.sexo === s.key;
                                    return (
                                        <button
                                            key={s.key}
                                            type="button"
                                            role="radio"
                                            aria-checked={activo}
                                            onClick={() => setForm(f => ({ ...f, sexo: s.key }))}
                                            style={{
                                                flex: '1 1 0', padding: '0.5rem 0.4rem', borderRadius: '8px',
                                                cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
                                                border: `1px solid ${activo ? 'var(--color-primary)' : 'var(--border-color)'}`,
                                                background: activo ? 'var(--color-primary)' : 'var(--color-surface)',
                                                color: activo ? '#fff' : 'var(--text-main)',
                                            }}
                                        >
                                            {s.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Quién recibe a la persona en el servicio: a RRHH le sirve.
                            Solo en la solicitud, porque el encargado cambia seguido. */}
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', ...fieldLabel, marginTop: '0.75rem' }}>
                            <span>Encargado del servicio <span style={{ fontWeight: 400 }}>(opcional)</span></span>
                            <input
                                type="text"
                                className="card"
                                style={{ margin: 0, fontWeight: 'normal' }}
                                placeholder="Quién recibe a la persona en el servicio"
                                value={form.encargado_nombre}
                                onChange={(e) => setForm(f => ({ ...f, encargado_nombre: e.target.value }))}
                            />
                        </label>

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

                        {/* Para cubrir vacaciones (2026-11-27): esa gente se toma
                            específicamente para eso, y en la lista se ve en violeta. */}
                        <button
                            type="button"
                            role="checkbox"
                            aria-checked={form.por_vacaciones}
                            onClick={() => setForm(f => ({ ...f, por_vacaciones: !f.por_vacaciones }))}
                            style={{
                                marginTop: '0.75rem', width: '100%', display: 'flex', alignItems: 'center', gap: '0.65rem',
                                textAlign: 'left', padding: '0.6rem 0.8rem', borderRadius: '8px', cursor: 'pointer', font: 'inherit',
                                border: `1px solid ${form.por_vacaciones ? VIOLETA.borde : 'var(--border-color)'}`,
                                background: form.por_vacaciones ? VIOLETA.bg : 'var(--color-surface)',
                                color: form.por_vacaciones ? VIOLETA.fg : 'var(--text-main)',
                            }}
                        >
                            <span
                                aria-hidden="true"
                                style={{
                                    width: '1.15rem', height: '1.15rem', borderRadius: '4px', flex: 'none',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.8rem', fontWeight: 800, color: '#fff',
                                    background: form.por_vacaciones ? VIOLETA.borde : 'transparent',
                                    border: form.por_vacaciones ? 'none' : '1.5px solid var(--border-color)',
                                }}
                            >
                                {form.por_vacaciones ? '✓' : ''}
                            </span>
                            <span>
                                <strong style={{ display: 'block', fontSize: '0.9rem' }}>Para cubrir vacaciones</strong>
                                <span style={{ fontSize: '0.78rem', color: form.por_vacaciones ? VIOLETA.fg : 'var(--text-muted)' }}>
                                    La persona se toma para cubrir las vacaciones de otro.
                                </span>
                            </span>
                        </button>

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
                            <SelectorDias
                                valor={form.dias}
                                onChange={(dias) => setForm(f => ({ ...f, dias }))}
                                onBorrar={() => setForm(f => ({ ...f, dias: [] }))}
                            />
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
                                    {/* Los días del segundo servicio heredan los
                                        del primero, que es el caso normal. Los
                                        botones aparecen solo si de verdad son
                                        distintos: si no, serían 14 botones
                                        juntos y habría que marcar dos veces lo
                                        mismo. */}
                                    <div style={{ marginTop: '0.6rem' }}>
                                        {!diasSegundoAparte ? (
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {form.dias.length
                                                    ? <>Los mismos días: <strong style={{ color: 'var(--color-primary)' }}>{resumenDias(form.dias)}</strong></>
                                                    : 'Los mismos días que el primer servicio'}
                                                {' · '}
                                                <button
                                                    type="button"
                                                    onClick={() => { setDiasSegundoAparte(true); setForm(f => ({ ...f, dias_2: [...f.dias] })); }}
                                                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-primary)', font: 'inherit', textDecoration: 'underline' }}
                                                >
                                                    van otros días
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                                                    <div style={{ ...fieldLabel }}>Días de este servicio</div>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setDiasSegundoAparte(false); setForm(f => ({ ...f, dias_2: [] })); }}
                                                        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.78rem', textDecoration: 'underline' }}
                                                    >
                                                        usar los mismos de arriba
                                                    </button>
                                                </div>
                                                <SelectorDias
                                                    valor={form.dias_2}
                                                    onChange={(dias_2) => setForm(f => ({ ...f, dias_2 }))}
                                                />
                                            </>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
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
                                    {/* Cubierta se marca desde la lista, que pide quién
                                        entra. Acá solo aparece si ya lo está. */}
                                    {ESTADOS.filter(e => e.key !== 'cubierta' || form.estado === 'cubierta')
                                        .map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                                </select>
                            </label>
                        )}

                        <div className="config-modal-actions" style={{ marginTop: '1.25rem', flexWrap: 'wrap' }}>
                            <button className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancelar</button>
                            {/* Mismo pedido con otra variante (por ejemplo, otro sexo):
                                guarda y deja todo cargado. Solo al crear. */}
                            {!editingId && (
                                <button className="btn btn-secondary" onClick={() => handleSave(true)} disabled={saving}>
                                    Guardar y cargar otra igual
                                </button>
                            )}
                            <button className="btn btn-primary" onClick={() => handleSave()} disabled={saving}>
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
                        {/* Datos del servicio (2026-11-27): dirección, supervisor según
                            el operativo y quién recibe a la persona. */}
                        <div style={{ margin: '0.35rem 0 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.86rem', color: 'var(--text-main)' }}>
                            {notesDetail.address && <div style={{ color: 'var(--text-muted)' }}>{notesDetail.address}</div>}
                            <div><span style={{ color: 'var(--text-muted)' }}>Supervisor: </span><strong>{notesDetail.supervisor || '—'}</strong></div>
                            <div><span style={{ color: 'var(--text-muted)' }}>Encargado: </span><strong>{notesDetail.encargado_nombre || '—'}</strong></div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Qué se pidió, en una línea: sin esto el detalle
                                mostraba las notas sin decir de qué pedido son. */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.25rem', padding: '0.75rem 0.9rem', background: 'var(--color-muted-surface)', borderRadius: '8px', fontSize: '0.88rem' }}>
                                <span><strong>{notesDetail.cantidad}</strong> {palabraPersonas(notesDetail.cantidad, notesDetail.sexo)}</span>
                                <span>{JORNADA_CORTO[notesDetail.tipo_jornada] || '—'}</span>
                                {horarioTexto(notesDetail) && <span style={{ fontWeight: 700 }}>{horarioTexto(notesDetail)}</span>}
                                {notesDetail.fecha_necesaria && <span>para el {fmt(notesDetail.fecha_necesaria)}</span>}
                                {notesDetail.urgencia === 'urgente' && (
                                    <span className="badge" style={{ background: '#FEE2E2', color: '#991B1B', fontWeight: 700 }}>Urgente</span>
                                )}
                                {notesDetail.por_vacaciones && <EtiquetaVacaciones />}
                            </div>
                            {notesDetail.estado === 'cubierta' && Array.isArray(notesDetail.personas_tomadas) && notesDetail.personas_tomadas.length > 0 && (
                                <div>
                                    <div style={{ ...fieldLabel, marginBottom: '0.25rem' }}>Quién entró</div>
                                    <PersonasTomadas personas={notesDetail.personas_tomadas} />
                                </div>
                            )}
                            <div>
                                <div style={{ ...fieldLabel, marginBottom: '0.25rem' }}>Motivo</div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{notesDetail.motivo || '—'}</div>
                            </div>
                            <div>
                                <div style={{ ...fieldLabel, marginBottom: '0.25rem' }}>Notas / observaciones</div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>{notesDetail.notas || '—'}</div>
                            </div>
                            {(notesDetail.creado_por_nombre || notesDetail.notas) && (
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    {notesDetail.creado_por_nombre && (
                                        <span>
                                            Solicitado por {notesDetail.creado_por_nombre}
                                            {notesDetail.created_at ? ` · ${formatArgentinaDateTime(notesDetail.created_at)}` : ''}
                                        </span>
                                    )}
                                    {/* Así la jefa sabe si RRHH ya la leyó. */}
                                    {notesDetail.notas && (
                                        <span>
                                            {notesDetail.nota_vista_at
                                                ? `Nota leída por ${notesDetail.nota_vista_por || 'RRHH'} · ${formatArgentinaDateTime(notesDetail.nota_vista_at)}`
                                                : 'RRHH todavía no leyó la nota'}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="config-modal-actions" style={{ marginTop: '1.5rem' }}>
                            <button className="btn btn-secondary" onClick={() => setNotesDetail(null)}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ¿Quién entra al puesto? Se abre al pasar una solicitud a Cubierta
                (pedido del usuario, 2026-11-26): un renglón por persona pedida. */}
            {cubriendo && (
                <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setCubriendo(null); }}>
                    <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                        <h2 style={{ margin: 0 }}>Solicitud cubierta</h2>
                        <p style={{ margin: '0.3rem 0 1.2rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                            {[
                                serviceName(cubriendo.solicitud),
                                `${cubriendo.solicitud.cantidad} ${palabraPersonas(cubriendo.solicitud.cantidad, cubriendo.solicitud.sexo)}`,
                                horarioTexto(cubriendo.solicitud),
                            ].filter(Boolean).join(' · ')}
                        </p>
                        <div style={{ margin: '0 0 0.6rem', fontSize: '0.92rem', fontWeight: 700 }}>
                            {cubriendo.personas.length === 1 ? '¿Quién entra al puesto?' : '¿Quiénes entran al puesto?'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {cubriendo.personas.map((p, i) => (
                                <div key={i} className="cubierta-fila" style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 150px) 1fr', gap: '0.75rem' }}>
                                    {['dni', 'nombre'].map((campo) => (
                                        <label key={campo} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', ...fieldLabel }}>
                                            {campo === 'dni' ? 'DNI' : 'Nombre completo'}
                                            {cubriendo.personas.length > 1 && campo === 'dni' ? ` (${i + 1})` : ''}
                                            <input
                                                type="text"
                                                className="card"
                                                inputMode={campo === 'dni' ? 'numeric' : undefined}
                                                autoFocus={i === 0 && campo === 'dni'}
                                                placeholder={campo === 'dni' ? 'Sin puntos' : 'Apellido y nombre'}
                                                style={{ margin: 0, fontWeight: 'normal', width: '100%' }}
                                                value={p[campo]}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setCubriendo(c => ({ ...c, personas: c.personas.map((x, j) => (j === i ? { ...x, [campo]: v } : x)) }));
                                                }}
                                            />
                                        </label>
                                    ))}
                                </div>
                            ))}
                        </div>
                        <div className="config-modal-actions" style={{ marginTop: '1.4rem' }}>
                            <button className="btn btn-secondary" onClick={() => setCubriendo(null)} disabled={saving}>Cancelar</button>
                            <button className="btn btn-primary" onClick={confirmarCubierta} disabled={saving}>
                                {saving ? 'Guardando…' : 'Marcar como cubierta'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// "Vacaciones" en violeta, sin emoji (pedido del usuario).
function EtiquetaVacaciones() {
    return (
        <span
            style={{
                display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: '0.1rem 0.55rem',
                fontSize: '0.72rem', fontWeight: 700, lineHeight: 1.4, whiteSpace: 'nowrap',
                background: VIOLETA.bg, color: VIOLETA.fg, border: `1px solid ${VIOLETA.borde}55`,
            }}
        >
            Vacaciones
        </span>
    );
}

// Quién entró al puesto, debajo de "Cubierta" y en el detalle.
function PersonasTomadas({ personas }) {
    if (!Array.isArray(personas) || !personas.length) return null;
    return (
        <div style={{ marginTop: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {personas.map((p) => (
                <div key={`${p.dni}-${p.nombre}`}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{p.nombre}</div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>DNI {p.dni}</div>
                </div>
            ))}
        </div>
    );
}
