'use client';

import { useState, useEffect, useMemo } from 'react';
import LicenseForm from './LicenseForm';

const LICENSE_CONFIG = {
    vacaciones:   { label: 'Vacaciones',   color: '#22c55e' },
    enfermedad:   { label: 'Enfermedad',   color: '#3b82f6' },
    art:          { label: 'ART',          color: '#f97316' },
    maternidad:   { label: 'Maternidad',   color: '#a855f7' },
    paternidad:   { label: 'Paternidad',   color: '#f59e0b' },
    psiquiatrica: { label: 'Psiquiátrica', color: '#ef4444' },
    sin_goce:     { label: 'Sin goce',     color: '#6b7280' },
    estudio:      { label: 'Estudio',      color: '#8b5cf6' },
};

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const LEFT_W = 220;
const ROW_H = 68;
const HEADER_H = 72;

function getPeriod() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 26);
    const end   = new Date(now.getFullYear(), now.getMonth(), 25);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return { start, end };
}

function diffDays(a, b) {
    return Math.floor((b - a) / 86400000);
}

function parseDate(str) {
    return new Date(str + 'T12:00:00');
}

function fmtDate(str) {
    const d = str instanceof Date ? str : parseDate(str);
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '');
}

function StatCard({ value, label, sub, color, icon }) {
    return (
        <div className="card" style={{ padding: '0.85rem 1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            <div style={{
                width: '34px', height: '34px', borderRadius: '8px', flexShrink: 0,
                background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.95rem',
            }}>
                {icon}
            </div>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, lineHeight: 1, color: 'var(--text-main)' }}>{value}</div>
                <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '0.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                {sub && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{sub}</div>}
            </div>
        </div>
    );
}

function DetailRow({ label, value, color, children }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
            {children ?? (
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: color || 'var(--text-main)', textAlign: 'right' }}>
                    {value}
                </span>
            )}
        </div>
    );
}

export default function LicensesGantt({ employees }) {
    const [licenses, setLicenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterEmployee, setFilterEmployee] = useState('');
    const [filterType, setFilterType] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingLicense, setEditingLicense] = useState(null);
    const [viewingLicense, setViewingLicense] = useState(null);

    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    const { start: periodStart, end: periodEnd } = useMemo(() => getPeriod(), []);
    const totalDays = diffDays(periodStart, periodEnd) + 1;

    const days = useMemo(() => {
        const result = [];
        for (let i = 0; i < totalDays; i++) {
            const d = new Date(periodStart);
            d.setDate(d.getDate() + i);
            result.push(d);
        }
        return result;
    }, [periodStart, totalDays]);

    const todayPct = useMemo(() => {
        const idx = diffDays(periodStart, today);
        if (idx < 0 || idx >= totalDays) return null;
        return ((idx + 0.5) / totalDays) * 100;
    }, [periodStart, today, totalDays]);

    const monthGroups = useMemo(() => {
        const groups = [];
        let cur = null;
        days.forEach(d => {
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            if (!cur || cur.key !== key) {
                cur = { key, label: `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`, count: 0 };
                groups.push(cur);
            }
            cur.count++;
        });
        return groups;
    }, [days]);

    useEffect(() => { fetchLicenses(); }, []);

    const fetchLicenses = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/licenses?status=activa');
            if (res.ok) setLicenses(await res.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const stats = useMemo(() => {
        const art = licenses.filter(l => l.type === 'art').length;

        // Monday–Sunday of current week
        const dow = today.getDay(); // 0=Sun
        const monday = new Date(today);
        monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        const reintegros = licenses.filter(l => {
            const end = parseDate(l.end_date);
            return end >= monday && end <= sunday;
        }).length;

        const prolongadas = licenses.filter(l =>
            diffDays(parseDate(l.start_date), parseDate(l.end_date)) + 1 > 15
        ).length;

        return { total: licenses.length, art, reintegros, prolongadas };
    }, [licenses, today]);

    const filtered = useMemo(() => {
        return licenses.filter(l => {
            if (filterEmployee && String(l.employee_id) !== filterEmployee) return false;
            if (filterType && l.type !== filterType) return false;
            const s = parseDate(l.start_date);
            const e = parseDate(l.end_date);
            return e >= periodStart && s <= periodEnd;
        }).sort((a, b) => a.start_date.localeCompare(b.start_date));
    }, [licenses, filterEmployee, filterType, periodStart, periodEnd]);

    if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Cargando licencias...</div>;

    const selectStyle = {
        padding: '0.4rem 0.7rem',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        fontSize: '0.85rem',
        background: 'var(--color-surface)',
        color: 'var(--text-main)',
        cursor: 'pointer',
    };

    return (
        <div>
            {showForm && (
                <LicenseForm
                    license={editingLicense}
                    employees={employees}
                    onSave={(saved) => {
                        const emp = employees.find(e => e.id == saved.employee_id);
                        const full = { ...saved, nombre: emp?.nombre, apellido: emp?.apellido };
                        setLicenses(prev =>
                            editingLicense
                                ? prev.map(l => l.id === saved.id ? { ...l, ...full } : l)
                                : [full, ...prev]
                        );
                        setShowForm(false);
                        setEditingLicense(null);
                    }}
                    onClose={() => { setShowForm(false); setEditingLicense(null); }}
                />
            )}

            {viewingLicense && (() => {
                const lic = viewingLicense;
                const cfg = LICENSE_CONFIG[lic.type] || { label: lic.type, color: '#6b7280' };
                return (
                    <div className="modal-overlay" onClick={() => setViewingLicense(null)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                <div style={{
                                    width: '10px', height: '10px', borderRadius: '50%',
                                    background: cfg.color, flexShrink: 0,
                                }} />
                                <h2 style={{ margin: 0 }}>Detalle de Licencia</h2>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                                <DetailRow label="Empleado" value={`${lic.apellido}, ${lic.nombre}`} />
                                <DetailRow label="Tipo" value={cfg.label} color={cfg.color} />
                                <DetailRow label="Fecha inicio" value={fmtDate(lic.start_date)} />
                                <DetailRow label="Fecha fin" value={fmtDate(lic.end_date)} />
                                <DetailRow label="Duración" value={`${diffDays(parseDate(lic.start_date), parseDate(lic.end_date)) + 1} días`} />
                                <DetailRow label="Estado">
                                    <span className={`badge ${lic.status === 'activa' ? 'badge-success' : 'badge-secondary'}`}>
                                        {lic.status === 'activa' ? 'Activa' : 'Finalizada'}
                                    </span>
                                </DetailRow>
                                {lic.notes && <DetailRow label="Observaciones" value={lic.notes} />}
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.75rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setViewingLicense(null)}>
                                    Cerrar
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => {
                                        setViewingLicense(null);
                                        setEditingLicense(lic);
                                        setShowForm(true);
                                    }}
                                >
                                    Editar
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Stats — 4 cards compactas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
                <StatCard icon="📋" value={stats.total}       label="Licencias activas"   sub="Período actual"         color="#3b82f6" />
                <StatCard icon="🦺" value={stats.art}         label="Licencias ART"       sub="Activas actualmente"    color="#f97316" />
                <StatCard icon="🔄" value={stats.reintegros}  label="Reintegros esta sem." sub="Lunes a domingo"       color="#22c55e" />
                <StatCard icon="📆" value={stats.prolongadas} label="Licencias prolongadas" sub="Más de 15 días"       color="#a855f7" />
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '1rem', alignItems: 'center' }}>
                <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} style={selectStyle}>
                    <option value="">Todos los empleados</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.apellido}, {e.nombre}</option>)}
                </select>
                <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selectStyle}>
                    <option value="">Todos los tipos</option>
                    {Object.entries(LICENSE_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
                </select>
                <div style={{ flex: 1 }} />
                <button
                    onClick={() => { setEditingLicense(null); setShowForm(true); }}
                    className="btn btn-primary"
                    style={{ fontSize: '0.85rem' }}
                >
                    + Nueva Licencia
                </button>
            </div>

            {/* Gantt */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Period bar */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.6rem 1rem', borderBottom: '1px solid var(--border-color)',
                }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Período:</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        {fmtDate(periodStart)} — {fmtDate(periodEnd)}
                    </span>
                    <span style={{
                        fontSize: '0.72rem', color: 'var(--text-muted)',
                        background: 'var(--color-muted-surface)',
                        border: '1px solid var(--border-color)',
                        padding: '0.1rem 0.5rem', borderRadius: '4px',
                    }}>
                        {filtered.length} licencias
                    </span>
                </div>

                {filtered.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No hay licencias activas en este período.
                    </div>
                ) : (
                    <div style={{ display: 'flex', overflow: 'hidden' }}>

                        {/* Left column — fixed */}
                        <div style={{ width: `${LEFT_W}px`, flexShrink: 0, borderRight: '1px solid var(--border-color)' }}>
                            <div style={{
                                height: `${HEADER_H}px`, borderBottom: '1px solid var(--border-color)',
                                background: 'var(--color-surface)',
                                display: 'flex', alignItems: 'flex-end',
                                justifyContent: 'space-between', padding: '0 1rem 0.5rem',
                            }}>
                                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Empleado</span>
                                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo</span>
                            </div>
                            {filtered.map(lic => {
                                const cfg = LICENSE_CONFIG[lic.type] || { label: lic.type, color: '#6b7280' };
                                const initials = `${(lic.apellido || '')[0] || ''}${(lic.nombre || '')[0] || ''}`.toUpperCase();
                                return (
                                    <div key={lic.id} style={{
                                        height: `${ROW_H}px`, borderBottom: '1px solid var(--border-color)',
                                        display: 'flex', alignItems: 'center',
                                        padding: '0 1rem', gap: '0.6rem',
                                        background: 'var(--color-surface)',
                                    }}>
                                        <div style={{
                                            width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                                            background: cfg.color + '22', color: cfg.color,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.7rem', fontWeight: 700,
                                        }}>
                                            {initials}
                                        </div>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {lic.apellido}, {lic.nombre}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.15rem' }}>
                                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cfg.label}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Timeline — flex, no scroll */}
                        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                            {/* Month row */}
                            <div style={{ display: 'flex', height: '28px', borderBottom: '1px solid var(--border-color)', background: 'var(--color-surface)' }}>
                                {monthGroups.map(g => (
                                    <div key={g.key} style={{
                                        flex: g.count, overflow: 'hidden',
                                        borderRight: '1px solid var(--border-color)',
                                        display: 'flex', alignItems: 'center', paddingLeft: '0.5rem',
                                        fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-main)',
                                        textTransform: 'capitalize',
                                    }}>
                                        {g.label}
                                    </div>
                                ))}
                            </div>

                            {/* Day row */}
                            <div style={{ display: 'flex', height: '44px', borderBottom: '1px solid var(--border-color)', background: 'var(--color-surface)' }}>
                                {days.map((d, i) => {
                                    const isToday = diffDays(today, d) === 0;
                                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                    return (
                                        <div key={i} style={{
                                            flex: 1, display: 'flex', flexDirection: 'column',
                                            alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                                            background: isToday ? 'var(--color-primary)' : isWeekend ? 'rgba(0,0,0,0.03)' : 'transparent',
                                            borderRadius: isToday ? '4px' : 0,
                                        }}>
                                            {isToday && <div style={{ fontSize: '0.45rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>HOY</div>}
                                            <div style={{ fontSize: '0.58rem', color: isToday ? '#fff' : 'var(--text-muted)', lineHeight: 1 }}>
                                                {DOW[d.getDay()].slice(0, 3)}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', fontWeight: isToday ? 700 : 500, color: isToday ? '#fff' : isWeekend ? 'var(--text-muted)' : 'var(--text-main)', lineHeight: 1.2 }}>
                                                {d.getDate()}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Today line */}
                            {todayPct !== null && (
                                <div style={{
                                    position: 'absolute',
                                    left: `${todayPct}%`,
                                    top: `${HEADER_H}px`, bottom: 0,
                                    width: '2px', background: 'var(--color-primary)',
                                    opacity: 0.35, pointerEvents: 'none', zIndex: 1,
                                }} />
                            )}

                            {/* License bars */}
                            {filtered.map(lic => {
                                const cfg = LICENSE_CONFIG[lic.type] || { label: lic.type, color: '#6b7280' };
                                const startDate = parseDate(lic.start_date);
                                const endDate   = parseDate(lic.end_date);
                                const clampedStart = startDate < periodStart ? periodStart : startDate;
                                const clampedEnd   = endDate   > periodEnd   ? periodEnd   : endDate;
                                const startIdx = diffDays(periodStart, clampedStart);
                                const endIdx   = diffDays(periodStart, clampedEnd);
                                const leftPct  = (startIdx / totalDays) * 100;
                                const widthPct = ((endIdx - startIdx + 1) / totalDays) * 100;
                                const clippedL = startDate < periodStart;
                                const clippedR = endDate > periodEnd;
                                const br = `${clippedL ? 0 : 6}px ${clippedR ? 0 : 6}px ${clippedR ? 0 : 6}px ${clippedL ? 0 : 6}px`;

                                return (
                                    <div key={lic.id} style={{
                                        height: `${ROW_H}px`, borderBottom: '1px solid var(--border-color)',
                                        position: 'relative',
                                    }}>
                                        {/* Weekend shading */}
                                        {days.map((d, i) => (d.getDay() === 0 || d.getDay() === 6) ? (
                                            <div key={i} style={{
                                                position: 'absolute',
                                                left: `${(i / totalDays) * 100}%`,
                                                width: `${(1 / totalDays) * 100}%`,
                                                top: 0, height: '100%',
                                                background: 'rgba(0,0,0,0.025)',
                                                pointerEvents: 'none',
                                            }} />
                                        ) : null)}

                                        {widthPct > 0 && (
                                            <div
                                                onClick={() => setViewingLicense(lic)}
                                                title={`${cfg.label} · Finaliza: ${fmtDate(lic.end_date)}`}
                                                style={{
                                                    position: 'absolute',
                                                    left: `calc(${leftPct}% + 3px)`,
                                                    width: `calc(${widthPct}% - 6px)`,
                                                    top: '50%', transform: 'translateY(-50%)',
                                                    height: '36px',
                                                    background: cfg.color,
                                                    borderRadius: br,
                                                    display: 'flex', alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '0 0.55rem',
                                                    overflow: 'hidden', cursor: 'pointer', zIndex: 2,
                                                    color: '#fff',
                                                    boxShadow: `0 2px 8px ${cfg.color}55`,
                                                    gap: '0.4rem',
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
                                                onMouseLeave={e => e.currentTarget.style.filter = ''}
                                            >
                                                <span style={{ fontSize: '0.73rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {cfg.label}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.68rem', fontWeight: 500, flexShrink: 0,
                                                    background: 'rgba(255,255,255,0.22)',
                                                    borderRadius: '4px', padding: '1px 5px',
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    Finaliza: {fmtDate(lic.end_date)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
