'use client';

import { useState, useEffect, useRef } from 'react';

const LICENSE_TYPES = [
    { value: 'vacaciones',   label: 'Vacaciones' },
    { value: 'enfermedad',   label: 'Enfermedad' },
    { value: 'art',          label: 'ART' },
    { value: 'maternidad',   label: 'Maternidad' },
    { value: 'paternidad',   label: 'Paternidad' },
    { value: 'psiquiatrica', label: 'Psiquiátrica' },
    { value: 'sin_goce',     label: 'Sin goce' },
    { value: 'estudio',      label: 'Estudio' },
];

function normalize(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export default function LicenseForm({ license, employees, onSave, onClose, defaultEmployeeId }) {
    const [formData, setFormData] = useState({
        employee_id: defaultEmployeeId?.toString() || '',
        type: 'vacaciones',
        start_date: '',
        end_date: '',
        notes: '',
        status: 'activa'
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [empSearch, setEmpSearch] = useState('');
    const [empSuggestions, setEmpSuggestions] = useState([]);
    const [empSelected, setEmpSelected] = useState(null);
    const suggRef = useRef(null);

    useEffect(() => {
        if (license) {
            setFormData({
                employee_id: license.employee_id?.toString() || '',
                type: license.type || 'vacaciones',
                start_date: license.start_date || '',
                end_date: license.end_date || '',
                notes: license.notes || '',
                status: license.status || 'activa'
            });
            if (employees && license.employee_id) {
                const emp = employees.find(e => String(e.id) === String(license.employee_id));
                if (emp) {
                    setEmpSelected(emp);
                    setEmpSearch(`${emp.apellido}, ${emp.nombre}`);
                }
            }
        }
    }, [license, employees]);

    useEffect(() => {
        if (empSearch.length < 3 || empSelected) {
            setEmpSuggestions([]);
            return;
        }
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
            if (suggRef.current && !suggRef.current.contains(e.target)) {
                setEmpSuggestions([]);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const selectEmployee = (emp) => {
        setEmpSelected(emp);
        setEmpSearch(`${emp.apellido}, ${emp.nombre}`);
        setFormData(f => ({ ...f, employee_id: String(emp.id) }));
        setEmpSuggestions([]);
    };

    const clearEmployee = () => {
        setEmpSelected(null);
        setEmpSearch('');
        setFormData(f => ({ ...f, employee_id: '' }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const url = license ? `/api/licenses/${license.id}` : '/api/licenses';
            const method = license ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Error al guardar la licencia');
            }

            const saved = await res.json();
            onSave(saved);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>{license ? 'Editar Licencia' : 'Nueva Licencia'}</h2>

                {error && <div className="error-message" style={{ color: 'var(--error)', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

                <form onSubmit={handleSubmit}>
                    {!defaultEmployeeId && (
                        <div className="form-group">
                            <label>Empleado *</label>
                            <div ref={suggRef} style={{ position: 'relative' }}>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="text"
                                        value={empSearch}
                                        onChange={e => { setEmpSelected(null); setEmpSearch(e.target.value); }}
                                        placeholder="Escribí al menos 3 letras para buscar..."
                                        required={!formData.employee_id}
                                        autoComplete="off"
                                        style={{ paddingRight: empSelected ? '2rem' : undefined }}
                                    />
                                    {empSelected && (
                                        <button
                                            type="button"
                                            onClick={clearEmployee}
                                            style={{
                                                position: 'absolute', right: '0.5rem', top: '50%',
                                                transform: 'translateY(-50%)', background: 'none',
                                                border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                                                fontSize: '1rem', lineHeight: 1, padding: '0.1rem 0.2rem',
                                            }}
                                            title="Limpiar"
                                        >×</button>
                                    )}
                                </div>
                                {empSuggestions.length > 0 && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                        background: 'var(--color-surface)',
                                        border: '1px solid var(--border-color)',
                                        borderTop: 'none', borderRadius: '0 0 8px 8px',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                        maxHeight: '200px', overflowY: 'auto',
                                    }}>
                                        {empSuggestions.map(emp => (
                                            <div
                                                key={emp.id}
                                                onMouseDown={() => selectEmployee(emp)}
                                                style={{
                                                    padding: '0.55rem 0.85rem', cursor: 'pointer',
                                                    fontSize: '0.875rem', color: 'var(--text-main)',
                                                    borderBottom: '1px solid var(--border-color)',
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-muted-surface)'}
                                                onMouseLeave={e => e.currentTarget.style.background = ''}
                                            >
                                                <span><strong>{emp.apellido}</strong>, {emp.nombre}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Leg. {emp.legajo}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {empSearch.length > 0 && empSearch.length < 3 && !empSelected && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                                        Escribí al menos 3 caracteres
                                    </div>
                                )}
                                {/* Hidden input to enforce required validation */}
                                <input type="hidden" value={formData.employee_id} required />
                            </div>
                        </div>
                    )}

                    <div className="form-group">
                        <label>Tipo de Licencia *</label>
                        <select
                            value={formData.type}
                            onChange={e => setFormData({ ...formData, type: e.target.value })}
                            required
                        >
                            {LICENSE_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label>Fecha Inicio *</label>
                            <input
                                type="date"
                                value={formData.start_date}
                                onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Fecha Fin *</label>
                            <input
                                type="date"
                                value={formData.end_date}
                                onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Observaciones</label>
                        <textarea
                            value={formData.notes}
                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                            rows="3"
                            placeholder="Notas adicionales..."
                        />
                    </div>

                    {license && (
                        <div className="form-group">
                            <label>Estado</label>
                            <select
                                value={formData.status}
                                onChange={e => setFormData({ ...formData, status: e.target.value })}
                            >
                                <option value="activa">Activa</option>
                                <option value="finalizada">Finalizada</option>
                            </select>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading || (!defaultEmployeeId && !formData.employee_id)}>
                            {loading ? 'Guardando...' : (license ? 'Actualizar' : 'Crear Licencia')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
