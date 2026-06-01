'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEmployees } from '@/hooks/queries/useEmployees';

const CATEGORIES = [
    { key: 'sancion', label: 'Sanción', bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
    { key: 'suspension', label: 'Suspensión', bg: '#F3E8FF', fg: '#7C3AED', border: '#DDD6FE' },
    { key: 'advertencia', label: 'Advertencia', bg: '#FFFBEB', fg: '#B45309', border: '#FCD34D' },
    { key: 'felicitacion', label: 'Felicitación', bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
    { key: 'incidente', label: 'Incidente', bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE' },
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

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetch('/api/employee-reports')
            .then(r => r.ok ? r.json() : [])
            .then(data => { if (!cancelled) setReports(Array.isArray(data) ? data : []); })
            .catch(() => { if (!cancelled) setReports([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

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
                                    <div className="hr-reports__item-desc">{r.descripcion}</div>
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
        </div>
    );
}
