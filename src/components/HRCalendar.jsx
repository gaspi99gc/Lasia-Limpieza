'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { useEmployees } from '@/hooks/queries/useEmployees';
import { notify } from '@/lib/toast';

const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const WEEKDAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const TIPOS = [
    { key: 'entrevista', label: 'Entrevista', color: '#2563EB', bg: '#DBEAFE', fg: '#1E3A8A' },
    { key: 'cita', label: 'Cita', color: '#D97706', bg: '#FEF3C7', fg: '#92400E' },
    { key: 'desvinculacion', label: 'Desvinculación', color: '#DC2626', bg: '#FEE2E2', fg: '#991B1B' },
    { key: 'sancion_programada', label: 'Sanción programada', color: '#7C3AED', bg: '#EDE9FE', fg: '#5B21B6' },
    { key: 'recordatorio', label: 'Recordatorio', color: '#6B7280', bg: '#F3F4F6', fg: '#374151' },
];
const TIPO_BY_KEY = Object.fromEntries(TIPOS.map(t => [t.key, t]));

// Slots de horario: 09:00 a 17:00 cada 15 min, excluyendo almuerzo 14:45-15:30.
const HORA_SLOTS = (() => {
    const slots = [];
    for (let m = 9 * 60; m <= 17 * 60; m += 15) {
        const h = String(Math.floor(m / 60)).padStart(2, '0');
        const mm = String(m % 60).padStart(2, '0');
        const t = `${h}:${mm}`;
        if (t >= '14:45' && t <= '15:30') continue;
        slots.push(t);
    }
    return slots;
})();

function getTodayYMD() {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric', month: '2-digit', day: '2-digit',
    });
    return fmt.format(new Date());
}

function mondayIndex(jsDay) {
    return (jsDay + 6) % 7;
}

function buildMonthGrid(year, month) {
    const firstOfMonth = new Date(year, month, 1);
    const leadingBlanks = mondayIndex(firstOfMonth.getDay());
    const gridStart = new Date(year, month, 1 - leadingBlanks);
    const cells = [];
    for (let i = 0; i < 42; i++) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + i);
        const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        cells.push({
            date: d,
            ymd,
            day: d.getDate(),
            inMonth: d.getMonth() === month,
            weekday: mondayIndex(d.getDay()),
        });
    }
    return cells;
}

function fmtHora(t) {
    if (!t) return '';
    return t.slice(0, 5); // HH:MM
}

function canCreateTipo(rol, tipo) {
    if (rol === 'admin' || rol === 'rrhh') return true;
    if (rol === 'jefe_operativo') return tipo !== 'entrevista';
    return false;
}

function tiposPermitidos(rol) {
    return TIPOS.filter(t => canCreateTipo(rol, t.key));
}

export default function HRCalendar() {
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState(null);
    useEffect(() => {
        setCurrentUser(getSessionUser());
    }, []);

    const today = getTodayYMD();
    const [todayY, todayM] = today.split('-').map(Number);
    const [cursor, setCursor] = useState({ year: todayY, month: todayM - 1 });

    const cells = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);

    const rangeFrom = cells[0].ymd;
    const rangeTo = cells[cells.length - 1].ymd;

    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshTick, setRefreshTick] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetch(`/api/hr-calendar?from=${rangeFrom}&to=${rangeTo}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => { if (!cancelled) setEvents(Array.isArray(data) ? data : []); })
            .catch(() => { if (!cancelled) setEvents([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [rangeFrom, rangeTo, refreshTick]);

    const eventsByDay = useMemo(() => {
        const m = new Map();
        for (const ev of events) {
            const list = m.get(ev.fecha) || [];
            list.push(ev);
            m.set(ev.fecha, list);
        }
        return m;
    }, [events]);

    const rol = currentUser?.role;
    const puedeCrear = rol === 'admin' || rol === 'rrhh' || rol === 'jefe_operativo';

    const [showCreate, setShowCreate] = useState(false);
    const [createDate, setCreateDate] = useState(today);
    const [detailEvent, setDetailEvent] = useState(null);
    const [dayListDate, setDayListDate] = useState(null);

    const goPrev = () => setCursor(c => {
        const m = c.month - 1;
        return m < 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: m };
    });
    const goNext = () => setCursor(c => {
        const m = c.month + 1;
        return m > 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: m };
    });
    const goToday = () => setCursor({ year: todayY, month: todayM - 1 });

    const openCreate = (ymd) => {
        if (!puedeCrear) return;
        setCreateDate(ymd || today);
        setShowCreate(true);
    };

    const openDayList = (ymd) => {
        setDayListDate(ymd);
    };

    const onCreated = () => {
        setShowCreate(false);
        setRefreshTick(t => t + 1);
    };

    const onDeleted = () => {
        setDetailEvent(null);
        setRefreshTick(t => t + 1);
    };

    return (
        <div className="hr-calendar">
            {puedeCrear && (
                <button
                    className="btn btn-primary hr-calendar__cta"
                    onClick={() => openCreate(today)}
                >
                    + Nuevo evento
                </button>
            )}

            <div className="hr-calendar__toolbar">
                <div className="hr-calendar__nav">
                    <button className="btn btn-secondary" onClick={goPrev} aria-label="Mes anterior">‹</button>
                    <button className="btn btn-secondary" onClick={goToday}>Hoy</button>
                    <button className="btn btn-secondary" onClick={goNext} aria-label="Mes siguiente">›</button>
                </div>
                <h2 className="hr-calendar__title">
                    {MONTH_NAMES[cursor.month]} {cursor.year}
                </h2>
                <div className="hr-calendar__actions" />
            </div>

            <div className="hr-calendar__legend">
                {TIPOS.map(t => (
                    <span key={t.key} className="hr-calendar__legend-item">
                        <span className="hr-calendar__legend-dot" style={{ background: t.color }} />
                        {t.label}
                    </span>
                ))}
            </div>

            <div className="hr-calendar__weekdays">
                {WEEKDAY_NAMES.map(w => (
                    <div key={w} className="hr-calendar__weekday">{w}</div>
                ))}
            </div>

            <div className="hr-calendar__grid">
                {cells.map(cell => {
                    const isToday = cell.ymd === today;
                    const isWeekend = cell.weekday >= 5;
                    const dayEvents = eventsByDay.get(cell.ymd) || [];
                    const visibles = dayEvents.slice(0, 3);
                    const restantes = dayEvents.length - visibles.length;
                    const classes = [
                        'hr-calendar__cell',
                        cell.inMonth ? '' : 'hr-calendar__cell--outside',
                        isToday ? 'hr-calendar__cell--today' : '',
                        isWeekend ? 'hr-calendar__cell--weekend' : '',
                        cell.inMonth ? 'hr-calendar__cell--clickable' : '',
                    ].filter(Boolean).join(' ');
                    return (
                        <div
                            key={cell.ymd}
                            className={classes}
                            onClick={() => cell.inMonth && openDayList(cell.ymd)}
                        >
                            <div className="hr-calendar__cell-header">
                                <span className="hr-calendar__day-number">{cell.day}</span>
                            </div>
                            <div className="hr-calendar__cell-body">
                                {visibles.map(ev => {
                                    const tipo = TIPO_BY_KEY[ev.tipo] || TIPO_BY_KEY.recordatorio;
                                    return (
                                        <button
                                            key={ev.id}
                                            className="hr-calendar__pill"
                                            style={{ background: tipo.bg, color: tipo.fg, borderLeftColor: tipo.color }}
                                            onClick={(e) => { e.stopPropagation(); setDetailEvent(ev); }}
                                            title={ev.titulo}
                                        >
                                            {ev.hora_inicio && <strong>{fmtHora(ev.hora_inicio)} </strong>}
                                            <span className="hr-calendar__pill-text">{ev.titulo}</span>
                                        </button>
                                    );
                                })}
                                {restantes > 0 && (
                                    <span className="hr-calendar__more">+{restantes} más</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {loading && <div className="hr-calendar__loading">Cargando…</div>}

            {showCreate && (
                <CreateEventModal
                    date={createDate}
                    currentUser={currentUser}
                    onClose={() => setShowCreate(false)}
                    onCreated={onCreated}
                />
            )}

            {detailEvent && (
                <EventDetailModal
                    event={detailEvent}
                    currentUser={currentUser}
                    onClose={() => setDetailEvent(null)}
                    onDeleted={onDeleted}
                    onGoLegajo={(empId) => {
                        router.push(`/rrhh?tab=personal&empleado=${empId}`);
                    }}
                />
            )}

            {dayListDate && (
                <DayEventsModal
                    date={dayListDate}
                    events={eventsByDay.get(dayListDate) || []}
                    puedeCrear={puedeCrear}
                    onClose={() => setDayListDate(null)}
                    onSelectEvent={(ev) => { setDayListDate(null); setDetailEvent(ev); }}
                    onCreateForDay={() => { setDayListDate(null); openCreate(dayListDate); }}
                />
            )}
        </div>
    );
}

function DayEventsModal({ date, events, puedeCrear, onClose, onSelectEvent, onCreateForDay }) {
    const [y, m, d] = date.split('-');
    const titulo = `${d}/${m}/${y}`;
    const ordenados = [...events].sort((a, b) => (a.hora_inicio || '99:99').localeCompare(b.hora_inicio || '99:99'));

    return (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal-content hr-calendar__day-modal" onClick={e => e.stopPropagation()}>
                <div className="hr-calendar__day-modal-header">
                    <h2 style={{ margin: 0 }}>Eventos del {titulo}</h2>
                    {puedeCrear && (
                        <button className="btn btn-primary" onClick={onCreateForDay}>+ Nuevo evento</button>
                    )}
                </div>

                {ordenados.length === 0 ? (
                    <p className="hr-calendar__day-empty">No hay eventos cargados para este día.</p>
                ) : (
                    <ul className="hr-calendar__day-list">
                        {ordenados.map(ev => {
                            const tipo = TIPO_BY_KEY[ev.tipo] || TIPO_BY_KEY.recordatorio;
                            return (
                                <li key={ev.id}>
                                    <button
                                        className="hr-calendar__day-item"
                                        style={{ borderLeftColor: tipo.color }}
                                        onClick={() => onSelectEvent(ev)}
                                    >
                                        <div className="hr-calendar__day-item-top">
                                            <span className="hr-calendar__day-item-hora">
                                                {ev.hora_inicio ? fmtHora(ev.hora_inicio) : '—'}
                                            </span>
                                            <span
                                                className="hr-calendar__day-item-badge"
                                                style={{ background: tipo.bg, color: tipo.fg }}
                                            >
                                                {tipo.label}
                                            </span>
                                        </div>
                                        <div className="hr-calendar__day-item-titulo">{ev.titulo}</div>
                                        {(ev.empleado_nombre || ev.candidato_nombre) && (
                                            <div className="hr-calendar__day-item-sub">
                                                {ev.empleado_nombre || ev.candidato_nombre}
                                            </div>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
                </div>
            </div>
        </div>
    );
}

function CreateEventModal({ date, currentUser, onClose, onCreated }) {
    const rol = currentUser?.role;
    const opciones = tiposPermitidos(rol);
    const [tipo, setTipo] = useState(opciones[0]?.key || 'recordatorio');
    const [fecha, setFecha] = useState(date);
    const [hora, setHora] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [empleadoId, setEmpleadoId] = useState('');
    const [empleadoSearch, setEmpleadoSearch] = useState('');
    const [candidatoNombre, setCandidatoNombre] = useState('');
    const [candidatoTelefono, setCandidatoTelefono] = useState('');
    const [saving, setSaving] = useState(false);

    const { data: employees = [] } = useEmployees();

    const empleadosFiltrados = useMemo(() => {
        const q = empleadoSearch.trim().toLowerCase();
        if (q.length < 3) return [];
        return employees
            .filter(e => e.estado === 'Activo' || !e.estado)
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

    const requiereEmpleado = tipo !== 'entrevista' && tipo !== 'recordatorio';

    // Validaciones de horario.
    const horaError = useMemo(() => {
        if (!hora) return null;
        if (hora < '09:00' || hora > '17:00') {
            return 'Los eventos solo pueden cargarse entre las 09:00 y las 17:00.';
        }
        if (fecha) {
            const [fy, fm, fd] = fecha.split('-').map(Number);
            const weekday = new Date(fy, fm - 1, fd).getDay();
            const esLaboral = weekday >= 1 && weekday <= 5;
            if (esLaboral && hora >= '14:45' && hora < '15:45') {
                return 'No se pueden crear eventos entre las 14:45 y las 15:45.';
            }
        }
        return null;
    }, [hora, fecha]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (tipo === 'entrevista' && !candidatoNombre.trim()) {
            notify.error('Indicá el nombre del candidato.');
            return;
        }
        if (requiereEmpleado && !empleadoId) {
            notify.error('Seleccioná un empleado.');
            return;
        }
        if (horaError) {
            return;
        }

        setSaving(true);
        try {
            const tipoLabel = TIPO_BY_KEY[tipo]?.label || tipo;
            const body = {
                tipo,
                fecha,
                hora_inicio: hora || null,
                titulo: tipoLabel,
                descripcion: descripcion.trim() || null,
                empleado_id: tipo === 'entrevista' ? null : (empleadoId || null),
                candidato_nombre: tipo === 'entrevista' ? candidatoNombre.trim() : null,
                candidato_telefono: tipo === 'entrevista' ? (candidatoTelefono.trim() || null) : null,
                creado_por_id: currentUser?.app_user_id || currentUser?.id || null,
                creado_por_rol: rol || null,
                creado_por_nombre: currentUser ? `${currentUser.name || ''} ${currentUser.surname || ''}`.trim() : null,
            };
            const res = await fetch('/api/hr-calendar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                notify.error(data.error || 'No se pudo crear el evento.');
                return;
            }
            notify.success('Evento creado.');
            onCreated();
        } catch {
            notify.error('Error de conexión.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal-content hr-calendar__create-modal" onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 1rem' }}>Nuevo evento</h2>
                <form onSubmit={handleSubmit} className="hr-calendar__create-form">
                    <div className="hr-calendar__create-grid">
                        <div className="form-group">
                            <label>Tipo</label>
                            <select value={tipo} onChange={e => setTipo(e.target.value)}>
                                {opciones.map(o => (
                                    <option key={o.key} value={o.key}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Fecha</label>
                            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label>Hora de inicio</label>
                            <input
                                type="time"
                                value={hora}
                                onChange={e => setHora(e.target.value)}
                                min="09:00"
                                max="17:00"
                                step={900}
                            />
                        </div>
                        {horaError && (
                            <div className="hr-calendar__hora-error hr-calendar__col-span-2">
                                {horaError}
                            </div>
                        )}

                        {tipo === 'entrevista' ? (
                            <>
                                <div className="form-group hr-calendar__col-span-2">
                                    <label>Nombre del candidato *</label>
                                    <input
                                        value={candidatoNombre}
                                        onChange={e => setCandidatoNombre(e.target.value)}
                                        placeholder="Nombre y apellido"
                                        required
                                    />
                                </div>
                                <div className="form-group hr-calendar__col-span-2">
                                    <label>Teléfono</label>
                                    <input
                                        value={candidatoTelefono}
                                        onChange={e => setCandidatoTelefono(e.target.value)}
                                        placeholder="Opcional"
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="form-group hr-calendar__col-span-2">
                                <label>Empleado {requiereEmpleado && '*'}</label>
                                {empleadoSeleccionado ? (
                                    <div className="hr-calendar__chip">
                                        <span>{empleadoSeleccionado.apellido}, {empleadoSeleccionado.nombre} {empleadoSeleccionado.legajo ? `· Leg. ${empleadoSeleccionado.legajo}` : ''}</span>
                                        <button type="button" onClick={() => { setEmpleadoId(''); setEmpleadoSearch(''); }}>×</button>
                                    </div>
                                ) : (
                                    <>
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
                                    </>
                                )}
                            </div>
                        )}

                        <div className="form-group hr-calendar__col-span-2">
                            <label>Descripción</label>
                            <textarea
                                value={descripcion}
                                onChange={e => setDescripcion(e.target.value)}
                                rows={2}
                                placeholder="Detalles, motivo, lugar..."
                            />
                        </div>
                    </div>

                    <div className="hr-calendar__create-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
                        <button type="submit" className="btn btn-primary" disabled={saving || !!horaError}>
                            {saving ? 'Guardando…' : 'Crear evento'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function EventDetailModal({ event, currentUser, onClose, onDeleted, onGoLegajo }) {
    const tipo = TIPO_BY_KEY[event.tipo] || TIPO_BY_KEY.recordatorio;
    const rol = currentUser?.role;
    const userId = currentUser?.app_user_id || currentUser?.id;
    const puedeBorrar = rol === 'admin' || rol === 'rrhh' || (userId && event.creado_por_id === userId);
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async () => {
        if (!confirm('¿Eliminar este evento?')) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/hr-calendar/${event.id}?user_rol=${encodeURIComponent(rol || '')}&user_id=${encodeURIComponent(userId || '')}`, {
                method: 'DELETE',
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                notify.error(data.error || 'No se pudo eliminar.');
                return;
            }
            notify.success('Evento eliminado.');
            onDeleted();
        } catch {
            notify.error('Error de conexión.');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                    <span className="hr-calendar__legend-dot" style={{ background: tipo.color, width: 14, height: 14 }} />
                    <h2 style={{ margin: 0 }}>{event.titulo}</h2>
                </div>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                    <div>
                        <strong>Tipo:</strong> {tipo.label}
                    </div>
                    <div>
                        <strong>Fecha:</strong> {event.fecha}{event.hora_inicio ? ` · ${fmtHora(event.hora_inicio)} hs` : ''}
                    </div>
                    {event.empleado_nombre && (
                        <div>
                            <strong>Empleado:</strong> {event.empleado_nombre} {event.empleado_legajo ? `· Leg. ${event.empleado_legajo}` : ''}
                        </div>
                    )}
                    {event.candidato_nombre && (
                        <div>
                            <strong>Candidato:</strong> {event.candidato_nombre}
                            {event.candidato_telefono && <> · 📞 {event.candidato_telefono}</>}
                        </div>
                    )}
                    {event.descripcion && (
                        <div>
                            <strong>Descripción:</strong>
                            <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{event.descripcion}</div>
                        </div>
                    )}
                    {event.creado_por_nombre && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #6b7280)' }}>
                            Cargado por {event.creado_por_nombre}{event.creado_por_rol ? ` (${event.creado_por_rol})` : ''}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                    {event.empleado_id && (
                        <button className="btn btn-secondary" onClick={() => onGoLegajo(event.empleado_id)}>
                            Ver legajo
                        </button>
                    )}
                    {puedeBorrar && (
                        <button className="btn btn-secondary" onClick={handleDelete} disabled={deleting} style={{ color: '#B91C1C' }}>
                            {deleting ? 'Eliminando…' : 'Eliminar'}
                        </button>
                    )}
                    <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
                </div>
            </div>
        </div>
    );
}
