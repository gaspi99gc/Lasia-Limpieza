'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import LicensesCalendar from './LicensesCalendar';
import LicenseForm from './LicenseForm';

const LICENSE_TYPES = {
    vacaciones: { label: 'Vacaciones', color: '#3b82f6' },
    enfermedad: { label: 'Enfermedad', color: '#eab308' },
    maternidad: { label: 'Maternidad', color: '#a855f7' },
    paternidad: { label: 'Paternidad', color: '#a855f7' },
    psiquiatrica: { label: 'Psiquiátrica', color: '#ef4444' },
    sin_goce: { label: 'Sin goce', color: '#6b7280' }
};

export default function LicensesView({ employees }) {
    const [licenses, setLicenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingLicense, setEditingLicense] = useState(null);
    const [filterType, setFilterType] = useState('all');
    const [filterEmployee, setFilterEmployee] = useState('all');
    const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'list'
    const [alerts, setAlerts] = useState({ upcoming: [], ending: [] });
    const fileInputRef = useRef(null);
    
    useEffect(() => {
        loadLicenses();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    
    const loadLicenses = async () => {
        try {
            const res = await fetch('/api/licenses');
            if (res.ok) {
                const data = await res.json();
                setLicenses(data);
                calculateAlerts(data);
            }
        } catch (err) {
            console.error('Error loading licenses:', err);
        } finally {
            setLoading(false);
        }
    };
    
    const calculateAlerts = (data) => {
        const today = new Date();
        const threeDays = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
        
        const upcoming = data.filter(l => {
            const start = new Date(l.start_date);
            return l.status === 'activa' && start >= today && start <= threeDays;
        });
        
        const ending = data.filter(l => {
            const end = new Date(l.end_date);
            return l.status === 'activa' && end >= today && end <= threeDays;
        });
        
        setAlerts({ upcoming, ending });
    };
    
    const filteredLicenses = useMemo(() => {
        return licenses.filter(l => {
            const matchesType = filterType === 'all' || l.type === filterType;
            const matchesEmployee = filterEmployee === 'all' || l.employee_id?.toString() === filterEmployee;
            return matchesType && matchesEmployee;
        });
    }, [licenses, filterType, filterEmployee]);
    
    const handleDelete = async (id) => {
        if (!confirm('¿Estás seguro de eliminar esta licencia?')) return;
        
        try {
            const res = await fetch(`/api/licenses/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setLicenses(licenses.filter(l => l.id !== id));
            }
        } catch (err) {
            console.error('Error deleting license:', err);
        }
    };
    
    const handleImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const res = await fetch('/api/licenses/import', {
                method: 'POST',
                body: formData
            });
            
            const result = await res.json();
            if (res.ok) {
                alert(result.message);
                loadLicenses();
            } else {
                alert(result.error || 'Error al importar');
            }
        } catch (err) {
            console.error('Error importing:', err);
            alert('Error al importar licencias');
        }
    };
    
    const handleExport = async () => {
        try {
            const res = await fetch('/api/licenses/import');
            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `licencias_${new Date().toISOString().split('T')[0]}.xlsx`;
                a.click();
            }
        } catch (err) {
            console.error('Error exporting:', err);
            alert('Error al exportar');
        }
    };
    
    const activeLicenses = licenses.filter(l => l.status === 'activa');
    
    return (
        <div className="licenses-view">
            <header className="page-header" style={{ marginBottom: '2rem' }}>
                <div>
                    <h1>Licencias</h1>
                    <p style={{ color: 'var(--text-muted)' }}>
                        {activeLicenses.length} licencias activas
                    </p>
                </div>
                <div className="page-header-actions">
                    <input
                        type="file"
                        ref={fileInputRef}
                        hidden
                        onChange={handleImport}
                        accept=".xlsx,.xls"
                    />
                    <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                        📥 Importar Excel
                    </button>
                    <button className="btn btn-secondary" onClick={handleExport}>
                        📤 Exportar Excel
                    </button>
                    <button className="btn btn-primary" onClick={() => { setEditingLicense(null); setShowForm(true); }}>
                        + Nueva Licencia
                    </button>
                </div>
            </header>
            
            {/* Alertas */}
            {(alerts.upcoming.length > 0 || alerts.ending.length > 0) && (
                <div className="licenses-alerts" style={{ marginBottom: '1.5rem' }}>
                    {alerts.upcoming.length > 0 && (
                        <div className="alert alert-info">
                            <strong>⚠️ Próximas licencias:</strong> {' '}
                            {alerts.upcoming.map(l => `${l.apellido}, ${l.nombre} (${l.start_date})`).join('; ')}
                        </div>
                    )}
                    {alerts.ending.length > 0 && (
                        <div className="alert alert-warning">
                            <strong>🔔 Licencias por finalizar:</strong> {' '}
                            {alerts.ending.map(l => `${l.apellido}, ${l.nombre} (${l.end_date})`).join('; ')}
                        </div>
                    )}
                </div>
            )}
            
            {/* Filtros */}
            <div className="card hr-filters-bar" style={{ marginBottom: '1.5rem' }}>
                <select value={filterType} onChange={e => setFilterType(e.target.value)}>
                    <option value="all">Todos los tipos</option>
                    {Object.entries(LICENSE_TYPES).map(([key, type]) => (
                        <option key={key} value={key}>{type.label}</option>
                    ))}
                </select>
                
                <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
                    <option value="all">Todos los empleados</option>
                    {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                            {emp.apellido}, {emp.nombre}
                        </option>
                    ))}
                </select>
                
                <div className="view-toggle">
                    <button
                        className={`btn ${viewMode === 'calendar' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setViewMode('calendar')}
                    >
                        📅 Calendario
                    </button>
                    <button
                        className={`btn ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setViewMode('list')}
                    >
                        📋 Lista
                    </button>
                </div>
            </div>
            
            {/* Vista Calendario */}
            {viewMode === 'calendar' && (
                <LicensesCalendar
                    licenses={filteredLicenses}
                    onLicenseClick={(license) => {
                        setEditingLicense(license);
                        setShowForm(true);
                    }}
                />
            )}
            
            {/* Vista Lista */}
            {viewMode === 'list' && (
                <div className="card" style={{ padding: 0 }}>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Empleado</th>
                                    <th>Tipo</th>
                                    <th>Inicio</th>
                                    <th>Fin</th>
                                    <th>Días</th>
                                    <th>Estado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLicenses.map(license => {
                                    const days = Math.ceil((new Date(license.end_date) - new Date(license.start_date)) / (1000 * 60 * 60 * 24)) + 1;
                                    return (
                                        <tr key={license.id}>
                                            <td>
                                                <strong>{license.apellido}, {license.nombre}</strong>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    Legajo: {license.legajo}
                                                </div>
                                            </td>
                                            <td>
                                                <span
                                                    className="badge"
                                                    style={{
                                                        background: LICENSE_TYPES[license.type]?.color + '20',
                                                        color: LICENSE_TYPES[license.type]?.color
                                                    }}
                                                >
                                                    {LICENSE_TYPES[license.type]?.label || license.type}
                                                </span>
                                            </td>
                                            <td>{license.start_date}</td>
                                            <td>{license.end_date}</td>
                                            <td>{days}</td>
                                            <td>
                                                <span className={`badge badge-${license.status === 'activa' ? 'success' : license.status === 'finalizada' ? 'secondary' : 'danger'}`}>
                                                    {license.status}
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        className="btn btn-secondary"
                                                        style={{ padding: '0.4rem' }}
                                                        onClick={() => {
                                                            setEditingLicense(license);
                                                            setShowForm(true);
                                                        }}
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        className="btn btn-secondary"
                                                        style={{ padding: '0.4rem', color: 'var(--error)' }}
                                                        onClick={() => handleDelete(license.id)}
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredLicenses.length === 0 && (
                                    <tr>
                                        <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                                            No hay licencias registradas.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            {/* Modal Form */}
            {showForm && (
                <LicenseForm
                    license={editingLicense}
                    employees={employees}
                    onSave={(saved) => {
                        if (editingLicense) {
                            setLicenses(licenses.map(l => l.id === saved.id ? saved : l));
                        } else {
                            setLicenses([...licenses, saved]);
                        }
                        loadLicenses();
                    }}
                    onClose={() => { setShowForm(false); setEditingLicense(null); }}
                />
            )}
        </div>
    );
}
