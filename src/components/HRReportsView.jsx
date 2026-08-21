'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEmployees } from '@/hooks/queries/useEmployees';
import { getSessionUser } from '@/lib/session';
import { useCatalog } from '@/lib/CatalogContext';
import { notify } from '@/lib/toast';
import SearchableSelect from '@/components/SearchableSelect';

const CATEGORIES = [
    { key: 'sancion', label: 'Sanción', bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
    { key: 'suspension', label: 'Suspensión', bg: '#F3E8FF', fg: '#7C3AED', border: '#DDD6FE' },
    { key: 'advertencia', label: 'Advertencia', bg: '#FFFBEB', fg: '#B45309', border: '#FCD34D' },
    { key: 'felicitacion', label: 'Felicitación', bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
    { key: 'incidente', label: 'Incidente', bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE' },
    { key: 'cambio_servicio', label: 'Cambio de servicio', bg: '#F0FDFA', fg: '#0F766E', border: '#99F6E4' },
];
const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

function fmtFecha(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const fmt = new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
    return fmt.format(d);
}

function fmtRange(desde, hasta) {
    if (!desde || !hasta) return '';
    const [y1, m1, d1] = desde.split('-');
    const [y2, m2, d2] = hasta.split('-');
    return `${d1}/${m1}/${y1} → ${d2}/${m2}/${y2}`;
}

export default function HRReportsView() {
    const router = useRouter();
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filtroCat, setFiltroCat] = useState('todos');
    const [empleadoId, setEmpleadoId] = useState('');
    const [empleadoSearch, setEmpleadoSearch] = useState('');
    const { data: employees = [] } = useEmployees();
    const { services = [] } = useCatalog();

    // Solo RRHH/admin pueden cargar el informe de "cambio de servicio".
    const [role, setRole] = useState(null);
    useEffect(() => { setRole(getSessionUser()?.role || null); }, []);
    const puedeCargarCambio = role === 'rrhh' || role === 'admin';
    const [cambioModal, setCambioModal] = useState(false);
    const [informeModal, setInformeModal] = useState(false);

    const empleadosFiltrados = useMemo(() => {
        const q = empleadoSearch.trim().toLowerCase();
        if (q.length < 3) return [];
        return employees
            .filter(e => {
                const full = `${e.apellido} ${e.nombre} ${e.legajo || ''} ${e.dni || ''}`.toLowerCase();
                return full.includes(q);
            })
            .slice(0, 8);
    }, [employees, empleadoSearch]);

    const empleadoSeleccionado = useMemo(
        () => employees.find(e => String(e.id) === String(empleadoId)),
        [employees, empleadoId]
    );

    const loadReports = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/employee-reports');
            const data = res.ok ? await res.json() : [];
            setReports(Array.isArray(data) ? data : []);
        } catch {
            setReports([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadReports(); }, []);

    const filtrados = useMemo(() => {
        return reports
            .filter(r => filtroCat === 'todos' || r.categoria === filtroCat)
            .filter(r => !empleadoId || String(r.empleado_id) === String(empleadoId));
    }, [reports, filtroCat, empleadoId]);

    const counts = useMemo(() => {
        const base = empleadoId
            ? reports.filter(r => String(r.empleado_id) === String(empleadoId))
            : reports;
        const m = { todos: base.length };
        for (const c of CATEGORIES) m[c.key] = 0;
        for (const r of base) {
            if (m[r.categoria] !== undefined) m[r.categoria] += 1;
        }
        return m;
    }, [reports, empleadoId]);

    return (
        <div className="hr-reports">
            <header className="page-header" style={{ marginBottom: '1.5rem' }}>
                <div>
                    <h1>Informes</h1>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-muted, #6b7280)', fontSize: '0.9rem' }}>
                        Todos los informes cargados sobre operarios, ordenados del más nuevo al más viejo.
                    </p>
                </div>
                {puedeCargarCambio && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" onClick={() => setInformeModal(true)}>
                            + Nuevo informe
                        </button>
                        <button className="btn btn-secondary" onClick={() => setCambioModal(true)}>
                            + Cambio de servicio
                        </button>
                    </div>
                )}
            </header>

            <div className="hr-reports__operario-filter">
                <label>Filtrar por operario</label>
                {empleadoSeleccionado ? (
                    <div className="hr-calendar__chip">
                        <span>
                            {empleadoSeleccionado.apellido}, {empleadoSeleccionado.nombre}
                            {empleadoSeleccionado.legajo ? ` · Leg. ${empleadoSeleccionado.legajo}` : ''}
                        </span>
                        <button type="button" onClick={() => { setEmpleadoId(''); setEmpleadoSearch(''); }}>×</button>
                    </div>
                ) : (
                    <div className="hr-reports__operario-input-wrap">
                        <input
                            value={empleadoSearch}
                            onChange={e => setEmpleadoSearch(e.target.value)}
                            placeholder="Escribí al menos 3 letras (apellido, nombre, legajo o DNI)"
                        />
                        {empleadosFiltrados.length > 0 && (
                            <div className="hr-calendar__autocomplete">
                                {empleadosFiltrados.map(e => (
                                    <button
                                        type="button"
                                        key={e.id}
                                        className="hr-calendar__autocomplete-item"
                                        onClick={() => { setEmpleadoId(e.id); setEmpleadoSearch(''); }}
                                    >
                                        {e.apellido}, {e.nombre} {e.legajo ? `· Leg. ${e.legajo}` : ''}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="hr-reports__filters">
                <button
                    className={`hr-reports__chip ${filtroCat === 'todos' ? 'hr-reports__chip--active' : ''}`}
                    onClick={() => setFiltroCat('todos')}
                >
                    Todos <span className="hr-reports__chip-count">{counts.todos}</span>
                </button>
                {CATEGORIES.map(c => (
                    <button
                        key={c.key}
                        className={`hr-reports__chip ${filtroCat === c.key ? 'hr-reports__chip--active' : ''}`}
                        onClick={() => setFiltroCat(c.key)}
                        style={filtroCat === c.key
                            ? { background: c.bg, color: c.fg, borderColor: c.border }
                            : undefined}
                    >
                        {c.label} <span className="hr-reports__chip-count">{counts[c.key] || 0}</span>
                    </button>
                ))}
            </div>

            {loading ? (
                <p className="hr-reports__empty">Cargando…</p>
            ) : filtrados.length === 0 ? (
                <p className="hr-reports__empty">No hay informes para mostrar.</p>
            ) : (
                <ul className="hr-reports__list">
                    {filtrados.map(r => {
                        const cat = CATEGORY_BY_KEY[r.categoria] || { label: r.categoria, bg: '#F3F4F6', fg: '#374151', border: '#E5E7EB' };
                        return (
                            <li key={r.id}>
                                <button
                                    className="hr-reports__item"
                                    style={{ borderLeftColor: cat.fg }}
                                    onClick={() => {
                                        if (r.empleado_id) {
                                            router.push(`/rrhh?tab=personal&empleado=${r.empleado_id}`);
                                        }
                                    }}
                                >
                                    <div className="hr-reports__item-top">
                                        <span
                                            className="hr-reports__badge"
                                            style={{ background: cat.bg, color: cat.fg, borderColor: cat.border }}
                                        >
                                            {cat.label}
                                        </span>
                                        <span className="hr-reports__item-date">{fmtFecha(r.created_at)}</span>
                                    </div>
                                    <div className="hr-reports__item-empleado">
                                        {r.empleado_nombre || 'Sin empleado'}
                                        {r.empleado_legajo ? ` · Leg. ${r.empleado_legajo}` : ''}
                                    </div>
                                    {r.categoria === 'suspension' && r.fecha_desde && r.fecha_hasta && (
                                        <div className="hr-reports__item-range">
                                            Período: {fmtRange(r.fecha_desde, r.fecha_hasta)}
                                        </div>
                                    )}
                                    {r.categoria === 'cambio_servicio' && (
                                        <div className="hr-reports__item-range" style={{ fontWeight: 600 }}>
                                            {r.servicio_origen_nombre || 'Origen'} → {r.servicio_destino_nombre || 'Destino'}
                                        </div>
                                    )}
                                    {r.descripcion && <div className="hr-reports__item-desc">{r.descripcion}</div>}
                                    {r.autor && (
                                        <div className="hr-reports__item-author">
                                            Cargado por {r.autor}{r.autor_rol ? ` (${r.autor_rol})` : ''}
                                        </div>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {cambioModal && (
                <CambioServicioModal
                    employees={employees}
                    services={services}
                    onClose={() => setCambioModal(false)}
                    onSaved={() => { setCambioModal(false); loadReports(); }}
                />
            )}

            {informeModal && (
                <NuevoInformeModal
                    employees={employees}
                    onClose={() => setInformeModal(false)}
                    onSaved={() => { setInformeModal(false); loadReports(); }}
                />
            )}
        </div>
    );
}

function CambioServicioModal({ employees, services, onClose, onSaved }) {
    const [empSearch, setEmpSearch] = useState('');
    const [empSelected, setEmpSelected] = useState(null);
    const [origenId, setOrigenId] = useState('');
    const [destinoId, setDestinoId] = useState('');
    const [nota, setNota] = useState('');
    const [saving, setSaving] = useState(false);

    const sugerencias = useMemo(() => {
        const q = empSearch.trim().toLowerCase();
        if (q.length < 3 || empSelected) return [];
        return employees
            .filter(e => e.estado_empleado === 'Activo')
            .filter(e => `${e.apellido} ${e.nombre} ${e.legajo || ''} ${e.dni || ''}`.toLowerCase().includes(q))
            .slice(0, 8);
    }, [employees, empSearch, empSelected]);

    const serviceOptions = useMemo(
        () => [...services].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(s => ({ value: s.id, label: s.name })),
        [services]
    );

    const submit = async () => {
        if (!empSelected) { notify.error('Elegí el operario.'); return; }
        if (!origenId || !destinoId) { notify.error('Elegí el servicio de origen y el de destino.'); return; }
        if (String(origenId) === String(destinoId)) { notify.error('El origen y el destino no pueden ser el mismo.'); return; }
        const user = getSessionUser();
        setSaving(true);
        try {
            const res = await fetch('/api/employee-reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    empleado_id: empSelected.id,
                    categoria: 'cambio_servicio',
                    descripcion: nota,
                    servicio_origen_id: origenId,
                    servicio_destino_id: destinoId,
                    autor: user ? `${user.name} ${user.surname}` : null,
                    autor_rol: user?.role || null,
                    autor_id: user?.app_user_id ?? null,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(data.error || 'No se pudo guardar el cambio de servicio.'); return; }
            const { default: Swal } = await import('sweetalert2');
            Swal.fire({ title: 'Cambio de servicio cargado', text: `Registrado en el legajo de ${empSelected.apellido}, ${empSelected.nombre}.`, icon: 'success', confirmButtonColor: '#00AEEF' });
            onSaved();
        } catch {
            notify.error('Error de red al guardar.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                <h2 style={{ margin: '0 0 1rem' }}>Cambio de servicio</h2>

                <div className="form-group" style={{ position: 'relative' }}>
                    <label>Operario *</label>
                    {empSelected ? (
                        <div className="hr-calendar__chip">
                            <span>{empSelected.apellido}, {empSelected.nombre}{empSelected.legajo ? ` · Leg. ${empSelected.legajo}` : ''}</span>
                            <button type="button" onClick={() => { setEmpSelected(null); setEmpSearch(''); }}>×</button>
                        </div>
                    ) : (
                        <>
                            <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Escribí al menos 3 letras..." autoComplete="off" />
                            {sugerencias.length > 0 && (
                                <div className="hr-calendar__autocomplete">
                                    {sugerencias.map(e => (
                                        <button type="button" key={e.id} className="hr-calendar__autocomplete-item" onClick={() => { setEmpSelected(e); setEmpSearch(''); }}>
                                            {e.apellido}, {e.nombre}{e.legajo ? ` · Leg. ${e.legajo}` : ''}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="form-group">
                    <label>Servicio de origen *</label>
                    <SearchableSelect options={serviceOptions} value={origenId} onChange={setOrigenId} placeholder="¿De qué servicio venía?" searchPlaceholder="Escribí 3 letras del servicio..." minChars={3} />
                </div>
                <div className="form-group">
                    <label>Servicio de destino *</label>
                    <SearchableSelect options={serviceOptions} value={destinoId} onChange={setDestinoId} placeholder="¿A qué servicio va?" searchPlaceholder="Escribí 3 letras del servicio..." minChars={3} />
                </div>
                <div className="form-group">
                    <label>Nota (opcional)</label>
                    <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3} placeholder="Aclarar el motivo del cambio…" style={{ resize: 'vertical' }} />
                </div>

                <div className="hr-calendar__create-actions" style={{ marginTop: '1.25rem' }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
                    <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
                        {saving ? 'Guardando…' : 'Cargar cambio'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Tipos de informe que se cargan desde este modal (el cambio de servicio tiene su
// propio botón porque necesita origen/destino).
const TIPOS_INFORME = CATEGORIES.filter(c => c.key !== 'cambio_servicio');

function NuevoInformeModal({ employees, onClose, onSaved }) {
    const [categoria, setCategoria] = useState('sancion');
    const [empSearch, setEmpSearch] = useState('');
    const [empSelected, setEmpSelected] = useState(null);
    const [descripcion, setDescripcion] = useState('');
    const [desde, setDesde] = useState('');
    const [hasta, setHasta] = useState('');
    const [saving, setSaving] = useState(false);

    const sugerencias = useMemo(() => {
        const q = empSearch.trim().toLowerCase();
        if (q.length < 3 || empSelected) return [];
        return employees
            .filter(e => e.estado_empleado === 'Activo')
            .filter(e => `${e.apellido} ${e.nombre} ${e.legajo || ''} ${e.dni || ''}`.toLowerCase().includes(q))
            .slice(0, 8);
    }, [employees, empSearch, empSelected]);

    const esSuspension = categoria === 'suspension';

    const submit = async () => {
        if (!empSelected) { notify.error('Elegí el operario.'); return; }
        if (!descripcion.trim()) { notify.error('Escribí la descripción del informe.'); return; }
        if (esSuspension) {
            if (!desde || !hasta) { notify.error('En una suspensión, indicá el período (desde y hasta).'); return; }
            if (hasta < desde) { notify.error('La fecha "hasta" no puede ser anterior a "desde".'); return; }
        }
        const user = getSessionUser();
        setSaving(true);
        try {
            const res = await fetch('/api/employee-reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    empleado_id: empSelected.id,
                    categoria,
                    descripcion,
                    fecha_desde: esSuspension ? desde : null,
                    fecha_hasta: esSuspension ? hasta : null,
                    autor: user ? `${user.name} ${user.surname}` : null,
                    autor_rol: user?.role || null,
                    autor_id: user?.app_user_id ?? null,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(data.error || 'No se pudo guardar el informe.'); return; }
            const { default: Swal } = await import('sweetalert2');
            const etiqueta = TIPOS_INFORME.find(t => t.key === categoria)?.label || 'Informe';
            Swal.fire({ title: `${etiqueta} cargada`, text: `Registrada en el legajo de ${empSelected.apellido}, ${empSelected.nombre}.`, icon: 'success', confirmButtonColor: '#00AEEF' });
            onSaved();
        } catch {
            notify.error('Error de red al guardar.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                <h2 style={{ margin: '0 0 1rem' }}>Nuevo informe</h2>

                <div className="form-group">
                    <label>Tipo de informe *</label>
                    <select value={categoria} onChange={e => setCategoria(e.target.value)}>
                        {TIPOS_INFORME.map(t => (
                            <option key={t.key} value={t.key}>{t.label}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group" style={{ position: 'relative' }}>
                    <label>Operario *</label>
                    {empSelected ? (
                        <div className="hr-calendar__chip">
                            <span>{empSelected.apellido}, {empSelected.nombre}{empSelected.legajo ? ` · Leg. ${empSelected.legajo}` : ''}</span>
                            <button type="button" onClick={() => { setEmpSelected(null); setEmpSearch(''); }}>×</button>
                        </div>
                    ) : (
                        <>
                            <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Escribí al menos 3 letras..." autoComplete="off" />
                            {sugerencias.length > 0 && (
                                <div className="hr-calendar__autocomplete">
                                    {sugerencias.map(e => (
                                        <button type="button" key={e.id} className="hr-calendar__autocomplete-item" onClick={() => { setEmpSelected(e); setEmpSearch(''); }}>
                                            {e.apellido}, {e.nombre}{e.legajo ? ` · Leg. ${e.legajo}` : ''}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {esSuspension && (
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Desde *</label>
                            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Hasta *</label>
                            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
                        </div>
                    </div>
                )}

                <div className="form-group">
                    <label>Descripción *</label>
                    <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3} placeholder="Detallá el motivo del informe…" style={{ resize: 'vertical' }} />
                </div>

                <div className="hr-calendar__create-actions" style={{ marginTop: '1.25rem' }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
                    <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
                        {saving ? 'Guardando…' : 'Cargar informe'}
                    </button>
                </div>
            </div>
        </div>
    );
}
