'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import MainLayout from '@/components/MainLayout';
import { getSessionUser } from '@/lib/session';
import { formatArgentinaDateTime } from '@/lib/datetime';

const REPORT_CATEGORIES = [
    { key: 'sancion', label: 'Sanción', bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
    { key: 'advertencia', label: 'Advertencia', bg: '#FFFBEB', fg: '#B45309', border: '#FCD34D' },
    { key: 'felicitacion', label: 'Felicitación', bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
    { key: 'incidente', label: 'Incidente', bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE' },
];
// Suspensión existe como categoría pero solo se crea desde RRHH (legajo).
// La incluimos aparte para poder renderizarla bien en el listado.
const SUSPENSION_CATEGORY = { key: 'suspension', label: 'Suspensión', bg: '#F3E8FF', fg: '#7C3AED', border: '#DDD6FE' };
const REPORT_CATEGORY_BY_KEY = Object.fromEntries([...REPORT_CATEGORIES, SUSPENSION_CATEGORY].map(c => [c.key, c]));

const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g');
const normalize = s => (s || '').toString().toLowerCase().normalize('NFD').replace(COMBINING, '');

export default function InformesPage() {
    const [employees, setEmployees] = useState([]);
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);

    const [soloMisInformes, setSoloMisInformes] = useState(false);
    const [empSearch, setEmpSearch] = useState('');
    const [empSuggestions, setEmpSuggestions] = useState([]);
    const [empSelected, setEmpSelected] = useState(null);
    const suggRef = useRef(null);

    const [categoria, setCategoria] = useState('incidente');
    const [descripcion, setDescripcion] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const loadReports = useCallback(async () => {
        try {
            const user = getSessionUser();
            // El supervisor solo ve los informes que él mismo cargó; el resto ve todos.
            const soloMios = user?.role === 'supervisor' && user?.app_user_id;
            const url = soloMios
                ? `/api/employee-reports?autor_id=${user.app_user_id}`
                : '/api/employee-reports';
            const res = await fetch(url);
            if (res.ok) setReports(await res.json());
        } catch (_) {}
    }, []);

    useEffect(() => {
        const user = getSessionUser();
        setSoloMisInformes(user?.role === 'supervisor');
        (async () => {
            setLoading(true);
            try {
                const [empRes] = await Promise.all([fetch('/api/employees'), loadReports()]);
                if (empRes.ok) setEmployees(await empRes.json());
            } finally {
                setLoading(false);
            }
        })();
    }, [loadReports]);

    useEffect(() => {
        if (empSearch.length < 3 || empSelected) { setEmpSuggestions([]); return; }
        const q = normalize(empSearch);
        const matches = (employees || []).filter(e =>
            normalize(e.apellido).includes(q) ||
            normalize(e.nombre).includes(q) ||
            normalize(`${e.apellido} ${e.nombre}`).includes(q) ||
            String(e.legajo || '').includes(empSearch)
        ).slice(0, 8);
        setEmpSuggestions(matches);
    }, [empSearch, empSelected, employees]);

    useEffect(() => {
        function handleClick(e) {
            if (suggRef.current && !suggRef.current.contains(e.target)) setEmpSuggestions([]);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const selectEmployee = (emp) => {
        setEmpSelected(emp);
        setEmpSearch(`${emp.apellido}, ${emp.nombre}`);
        setEmpSuggestions([]);
    };

    const clearEmployee = () => {
        setEmpSelected(null);
        setEmpSearch('');
    };

    const submit = async () => {
        if (!empSelected || !descripcion.trim()) return;
        const user = getSessionUser();
        setSaving(true);
        setError('');
        try {
            const res = await fetch('/api/employee-reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    empleado_id: empSelected.id,
                    categoria,
                    descripcion,
                    autor: user ? `${user.name} ${user.surname}` : null,
                    autor_rol: user?.role || null,
                    autor_id: user?.app_user_id ?? null,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setError(data.error || 'Error al crear el informe'); return; }
            const empleadoNombre = `${empSelected.apellido}, ${empSelected.nombre}`;
            await loadReports();
            setDescripcion('');
            setCategoria('incidente');
            clearEmployee();
            const { default: Swal } = await import('sweetalert2');
            Swal.fire({
                title: 'Cargado en el legajo',
                text: `El informe de ${empleadoNombre} se guardó correctamente.`,
                icon: 'success',
                confirmButtonColor: '#00AEEF',
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <MainLayout>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                <header className="page-header" style={{ marginBottom: '1.5rem' }}>
                    <div>
                        <h1>Informes</h1>
                        <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontSize: '0.9rem' }}>
                            Cargá un informe sobre un operario. Buscalo por nombre, apellido o legajo.
                        </p>
                    </div>
                </header>

                {/* Formulario de carga */}
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div className="form-group" ref={suggRef} style={{ position: 'relative' }}>
                        <label>Operario *</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="text"
                                value={empSearch}
                                onChange={e => { setEmpSelected(null); setEmpSearch(e.target.value); }}
                                placeholder="Escribí al menos 3 letras para buscar..."
                                autoComplete="off"
                                style={{ paddingRight: empSelected ? '2rem' : undefined }}
                            />
                            {empSelected && (
                                <button type="button" onClick={clearEmployee} title="Limpiar"
                                    style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1 }}>×</button>
                            )}
                        </div>
                        {empSuggestions.length > 0 && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--color-surface)', border: '1px solid var(--border-color)', borderTop: 'none', borderRadius: '0 0 8px 8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '220px', overflowY: 'auto' }}>
                                {empSuggestions.map(emp => (
                                    <div key={emp.id} onMouseDown={() => selectEmployee(emp)}
                                        style={{ padding: '0.55rem 0.85rem', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-muted-surface)'}
                                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                                        <span><strong>{emp.apellido}</strong>, {emp.nombre}</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Leg. {emp.legajo}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {empSearch.length > 0 && empSearch.length < 3 && !empSelected && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>Escribí al menos 3 caracteres</div>
                        )}
                    </div>

                    <div className="form-group">
                        <label>Categoría *</label>
                        <select value={categoria} onChange={e => setCategoria(e.target.value)}>
                            {REPORT_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Descripción *</label>
                        <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={4} placeholder="Detalle del informe..." style={{ resize: 'vertical' }} />
                    </div>

                    {error && <div style={{ color: 'var(--error)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</div>}

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn btn-primary" disabled={saving || !empSelected || !descripcion.trim()} onClick={submit}>
                            {saving ? 'Guardando...' : 'Crear informe'}
                        </button>
                    </div>
                </div>

                {/* Lista de informes */}
                <h3 style={{ marginBottom: '0.75rem' }}>{soloMisInformes ? 'Mis informes' : 'Últimos informes'}</h3>
                {loading ? (
                    <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Cargando...</div>
                ) : reports.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: 'var(--text-muted)' }}>Todavía no hay informes cargados.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {reports.map(rep => {
                            const cat = REPORT_CATEGORY_BY_KEY[rep.categoria] || REPORT_CATEGORIES[0];
                            return (
                                <div key={rep.id} className="card" style={{ marginBottom: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                                        <strong style={{ fontSize: '0.95rem' }}>{rep.empleado_nombre || 'Operario'}</strong>
                                        {rep.empleado_legajo && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Leg. {rep.empleado_legajo}</span>}
                                        <span style={{ marginLeft: 'auto', display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700, background: cat.bg, color: cat.fg, border: `1px solid ${cat.border}` }}>
                                            {cat.label}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.88rem', whiteSpace: 'pre-wrap', marginBottom: '0.4rem' }}>{rep.descripcion}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                        {rep.autor ? `${rep.autor} · ` : ''}{formatArgentinaDateTime(rep.created_at)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </MainLayout>
    );
}
