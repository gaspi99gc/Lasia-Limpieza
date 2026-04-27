'use client';

import { useState, useEffect } from 'react';

const LICENSE_TYPES = [
    { value: 'vacaciones', label: 'Vacaciones', color: '#3b82f6' },
    { value: 'enfermedad', label: 'Enfermedad', color: '#eab308' },
    { value: 'maternidad', label: 'Maternidad', color: '#a855f7' },
    { value: 'paternidad', label: 'Paternidad', color: '#a855f7' },
    { value: 'psiquiatrica', label: 'Psiquiátrica', color: '#ef4444' },
    { value: 'sin_goce', label: 'Sin goce', color: '#6b7280' }
];

export default function LicenseForm({ license, employees, onSave, onClose }) {
    const [formData, setFormData] = useState({
        employee_id: '',
        type: 'vacaciones',
        start_date: '',
        end_date: '',
        notes: '',
        status: 'activa'
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    
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
        }
    }, [license]);
    
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
                    <div className="form-group">
                        <label>Empleado *</label>
                        <select
                            value={formData.employee_id}
                            onChange={e => setFormData({ ...formData, employee_id: e.target.value })}
                            required
                        >
                            <option value="">Seleccionar empleado...</option>
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.id}>
                                    {emp.apellido}, {emp.nombre} (Legajo: {emp.legajo})
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    <div className="form-group">
                        <label>Tipo de Licencia *</label>
                        <select
                            value={formData.type}
                            onChange={e => setFormData({ ...formData, type: e.target.value })}
                            required
                        >
                            {LICENSE_TYPES.map(type => (
                                <option key={type.value} value={type.value}>
                                    {type.label}
                                </option>
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
                                <option value="cancelada">Cancelada</option>
                            </select>
                        </div>
                    )}
                    
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Guardando...' : (license ? 'Actualizar' : 'Crear Licencia')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
