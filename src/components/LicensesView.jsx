'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import LicensesCalendar from './LicensesCalendar';
import LicenseForm from './LicenseForm';
import { notify } from '@/lib/toast';
import { downloadWorkbook } from '@/lib/xlsx-download';

// El status en la DB no se actualiza solo. Una licencia "activa" en la DB
// puede tener end_date pasado: la consideramos finalizada para mostrar.
function isReallyActive(license) {
    if (!license || license.status !== 'activa') return false;
    const today = new Date().toISOString().slice(0, 10);
    return (license.end_date || '').slice(0, 10) >= today;
}
function isReallyFinished(license) {
    if (!license || license.status === 'cancelada') return false;
    return !isReallyActive(license);
}

const LICENSE_TYPES = {
    vacaciones: { label: 'Vacaciones', color: '#3b82f6' },
    enfermedad: { label: 'Enfermedad', color: '#eab308' },
    maternidad: { label: 'Maternidad', color: '#a855f7' },
    paternidad: { label: 'Paternidad', color: '#a855f7' },
    psiquiatrica: { label: 'Psiquiátrica', color: '#ef4444' },
    sin_goce: { label: 'Sin goce', color: '#6b7280' },
};

function LicenseTypeBadge({ type }) {
    const t = LICENSE_TYPES[type];
    return (
        <span
            className="badge"
            style={{ background: (t?.color || '#666') + '22', color: t?.color || '#666' }}
        >
            {t?.label || type}
        </span>
    );
}

function LicenseTable({ licenses, onEdit, onDelete, showStatus = false }) {
    return (
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
                            {showStatus && <th>Estado</th>}
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {licenses.map(license => {
                            const days = Math.ceil(
                                (new Date(license.end_date) - new Date(license.start_date)) / (1000 * 60 * 60 * 24)
                            ) + 1;
                            return (
                                <tr key={license.id}>
                                    <td>
                                        <strong>{license.apellido}, {license.nombre}</strong>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            Legajo: {license.legajo}
                                        </div>
                                    </td>
                                    <td><LicenseTypeBadge type={license.type} /></td>
                                    <td>{license.start_date}</td>
                                    <td>{license.end_date}</td>
                                    <td>{days}</td>
                                    {showStatus && (
                                        <td>
                                            {(() => {
                                                const active = isReallyActive(license);
                                                const cancelled = license.status === 'cancelada';
                                                const label = cancelled ? 'cancelada' : active ? 'activa' : 'finalizada';
                                                return <span className={`badge ${active ? 'badge-success' : 'badge-secondary'}`}>{label}</span>;
                                            })()}
                                        </td>
                                    )}
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '0.4rem' }}
                                                onClick={() => onEdit(license)}
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '0.4rem', color: 'var(--error)' }}
                                                onClick={() => onDelete(license.id)}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {licenses.length === 0 && (
                            <tr>
                                <td colSpan={showStatus ? 7 : 6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                    No hay licencias registradas.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function LicensesView({ employees }) {
    const [licenses, setLicenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingLicense, setEditingLicense] = useState(null);
    const [filterEmployee, setFilterEmployee] = useState('all');
    const [viewMode, setViewMode] = useState('calendar');
    const [mainTab, setMainTab] = useState('activas');
    const [alerts, setAlerts] = useState({ upcoming: [], ending: [] });
    // Terminadas filters
    const [finFilterType, setFinFilterType] = useState('all');
    const [finFilterFrom, setFinFilterFrom] = useState('');
    const [finFilterTo, setFinFilterTo] = useState('');
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
                // Delete cancelled licenses from DB silently
                const cancelled = data.filter(l => l.status === 'cancelada');
                if (cancelled.length > 0) {
                    await Promise.all(
                        cancelled.map(l => fetch(`/api/licenses/${l.id}`, { method: 'DELETE' }))
                    );
                }
                const visible = data.filter(l => l.status !== 'cancelada');
                setLicenses(visible);
                calculateAlerts(visible);
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
        setAlerts({
            upcoming: data.filter(l => {
                const start = new Date(l.start_date);
                return isReallyActive(l) && start >= today && start <= threeDays;
            }),
            ending: data.filter(l => {
                const end = new Date(l.end_date);
                return isReallyActive(l) && end >= today && end <= threeDays;
            }),
        });
    };

    const handleSave = (saved) => {
        // If the saved license was set to cancelled, remove it
        if (saved.status === 'cancelada') {
            setLicenses(prev => prev.filter(l => l.id !== saved.id));
            fetch(`/api/licenses/${saved.id}`, { method: 'DELETE' });
        } else {
            setLicenses(prev => {
                const exists = prev.find(l => l.id === saved.id);
                return exists
                    ? prev.map(l => l.id === saved.id ? { ...l, ...saved } : l)
                    : [...prev, saved];
            });
        }
        loadLicenses();
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Estás seguro de eliminar esta licencia?')) return;
        try {
            const res = await fetch(`/api/licenses/${id}`, { method: 'DELETE' });
            if (res.ok) setLicenses(prev => prev.filter(l => l.id !== id));
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
            const res = await fetch('/api/licenses/import', { method: 'POST', body: formData });
            const result = await res.json();
            if (res.ok) { notify.success(result.message); loadLicenses(); }
            else notify.error(result.error || 'Error al importar');
        } catch {
            notify.error('Error al importar licencias');
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
        } catch {
            notify.error('Error al exportar');
        }
    };

    const openEdit = (license) => { setEditingLicense(license); setShowForm(true); };

    const activeLicenses = useMemo(() =>
        licenses.filter(l => isReallyActive(l) &&
            (filterEmployee === 'all' || l.employee_id?.toString() === filterEmployee)),
        [licenses, filterEmployee]);

    const finishedLicenses = useMemo(() =>
        licenses.filter(l => {
            if (!isReallyFinished(l)) return false;
            if (filterEmployee !== 'all' && l.employee_id?.toString() !== filterEmployee) return false;
            if (finFilterType !== 'all' && l.type !== finFilterType) return false;
            if (finFilterFrom && l.end_date < finFilterFrom) return false;
            if (finFilterTo && l.start_date > finFilterTo) return false;
            return true;
        }),
        [licenses, filterEmployee, finFilterType, finFilterFrom, finFilterTo]);

    const activeCount = licenses.filter(isReallyActive).length;
    const finishedCount = licenses.filter(isReallyFinished).length;

    const exportActivasExcel = () => {
        import('xlsx').then(XLSX => {
            const toAR = (d) => {
                if (!d) return '';
                const [y, m, day] = d.split('-');
                return `${day}/${m}/${y}`;
            };
            const rows = activeLicenses.map(l => ({
                'Nombre y Apellido': `${l.apellido}, ${l.nombre}`,
                'Tipo de Licencia': LICENSE_TYPES[l.type]?.label || l.type,
                'Detalles': l.notes || '',
                'Finaliza': toAR(l.end_date),
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 40 }, { wch: 14 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Licencias Activas');
            downloadWorkbook(XLSX, wb, `licencias_activas_${new Date().toISOString().split('T')[0]}.xlsx`);
        });
    };

    const exportExcel = () => {
        import('xlsx').then(XLSX => {
            const rows = finishedLicenses.map(l => ({
                Empleado: `${l.apellido}, ${l.nombre}`,
                Legajo: l.legajo || '',
                Tipo: LICENSE_TYPES[l.type]?.label || l.type,
                'Fecha Inicio': l.start_date,
                'Fecha Fin': l.end_date,
                Días: Math.ceil((new Date(l.end_date) - new Date(l.start_date)) / 86400000) + 1,
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Licencias Terminadas');
            downloadWorkbook(XLSX, wb, `licencias_terminadas_${new Date().toISOString().split('T')[0]}.xlsx`);
        });
    };

    const exportPDF = () => {
        import('jspdf').then(({ jsPDF }) => {
            import('jspdf-autotable').then(() => {
                const doc = new jsPDF();
                doc.setFontSize(14);
                doc.text('Licencias Terminadas', 14, 16);
                doc.setFontSize(9);
                doc.setTextColor(120);
                doc.text(`Generado: ${new Date().toLocaleDateString('es-AR')}`, 14, 22);
                doc.autoTable({
                    startY: 28,
                    head: [['Empleado', 'Legajo', 'Tipo', 'Inicio', 'Fin', 'Días']],
                    body: finishedLicenses.map(l => [
                        `${l.apellido}, ${l.nombre}`,
                        l.legajo || '',
                        LICENSE_TYPES[l.type]?.label || l.type,
                        l.start_date,
                        l.end_date,
                        Math.ceil((new Date(l.end_date) - new Date(l.start_date)) / 86400000) + 1,
                    ]),
                    styles: { fontSize: 9 },
                    headStyles: { fillColor: [59, 130, 246] },
                    alternateRowStyles: { fillColor: [245, 247, 250] },
                });
                doc.save(`licencias_terminadas_${new Date().toISOString().split('T')[0]}.pdf`);
            });
        });
    };

    return (
        <div className="licenses-view">
            <header className="page-header" style={{ marginBottom: '1.5rem' }}>
                <div>
                    <h1>Licencias</h1>
                    <p style={{ color: 'var(--text-muted)' }}>{activeCount} activas</p>
                </div>
                <div className="page-header-actions">
                    <input type="file" ref={fileInputRef} hidden onChange={handleImport} accept=".xlsx,.xls" />
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
                            <strong>⚠️ Próximas licencias:</strong>{' '}
                            {alerts.upcoming.map(l => `${l.apellido}, ${l.nombre} (${l.start_date})`).join('; ')}
                        </div>
                    )}
                    {alerts.ending.length > 0 && (
                        <div className="alert alert-warning">
                            <strong>🔔 Licencias por finalizar:</strong>{' '}
                            {alerts.ending.map(l => `${l.apellido}, ${l.nombre} (${l.end_date})`).join('; ')}
                        </div>
                    )}
                </div>
            )}

            {/* Tabs principales */}
            <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.25rem', borderBottom: '2px solid var(--border-color)' }}>
                <button
                    className="btn"
                    onClick={() => setMainTab('activas')}
                    style={{
                        borderRadius: '6px 6px 0 0',
                        borderBottom: mainTab === 'activas' ? '2px solid var(--color-primary)' : '2px solid transparent',
                        marginBottom: '-2px',
                        color: mainTab === 'activas' ? 'var(--color-primary)' : 'var(--text-muted)',
                        fontWeight: mainTab === 'activas' ? 700 : 400,
                        background: 'none',
                        padding: '0.5rem 1.1rem',
                    }}
                >
                    Activas {activeCount > 0 && <span style={{ fontSize: '0.75rem', marginLeft: '0.3rem', background: 'var(--color-primary)', color: '#fff', borderRadius: 10, padding: '1px 6px' }}>{activeCount}</span>}
                </button>
                <button
                    className="btn"
                    onClick={() => setMainTab('terminadas')}
                    style={{
                        borderRadius: '6px 6px 0 0',
                        borderBottom: mainTab === 'terminadas' ? '2px solid var(--color-primary)' : '2px solid transparent',
                        marginBottom: '-2px',
                        color: mainTab === 'terminadas' ? 'var(--color-primary)' : 'var(--text-muted)',
                        fontWeight: mainTab === 'terminadas' ? 700 : 400,
                        background: 'none',
                        padding: '0.5rem 1.1rem',
                    }}
                >
                    Terminadas {finishedCount > 0 && <span style={{ fontSize: '0.75rem', marginLeft: '0.3rem', background: 'var(--text-muted)', color: '#fff', borderRadius: 10, padding: '1px 6px' }}>{finishedCount}</span>}
                </button>
            </div>

            {/* Filtros */}
            <div className="card hr-filters-bar" style={{ marginBottom: '1.5rem' }}>
                <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
                    <option value="all">Todos los empleados</option>
                    {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                            {emp.apellido}, {emp.nombre}
                        </option>
                    ))}
                </select>

                {mainTab === 'activas' && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto' }}>
                        <button
                            className="btn btn-secondary"
                            onClick={exportActivasExcel}
                            disabled={activeLicenses.length === 0}
                        >
                            📥 Exportar Excel
                        </button>
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
                )}
            </div>

            {/* Tab: Activas */}
            {mainTab === 'activas' && (
                <>
                    {viewMode === 'calendar' && (
                        <LicensesCalendar
                            licenses={activeLicenses}
                            onLicenseClick={openEdit}
                        />
                    )}
                    {viewMode === 'list' && (
                        <LicenseTable
                            licenses={activeLicenses}
                            onEdit={openEdit}
                            onDelete={handleDelete}
                            showStatus={false}
                        />
                    )}
                </>
            )}

            {/* Tab: Terminadas */}
            {mainTab === 'terminadas' && (
                <>
                    {/* Filtros terminadas */}
                    <div className="card hr-filters-bar" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <select value={finFilterType} onChange={e => setFinFilterType(e.target.value)}>
                            <option value="all">Todos los tipos</option>
                            {Object.entries(LICENSE_TYPES).map(([key, t]) => (
                                <option key={key} value={key}>{t.label}</option>
                            ))}
                        </select>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Desde</label>
                            <input type="date" value={finFilterFrom} onChange={e => setFinFilterFrom(e.target.value)} style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Hasta</label>
                            <input type="date" value={finFilterTo} onChange={e => setFinFilterTo(e.target.value)} style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }} />
                        </div>
                        {(finFilterType !== 'all' || finFilterFrom || finFilterTo) && (
                            <button className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem' }}
                                onClick={() => { setFinFilterType('all'); setFinFilterFrom(''); setFinFilterTo(''); }}>
                                Limpiar
                            </button>
                        )}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                            <button className="btn btn-secondary" onClick={exportExcel} disabled={finishedLicenses.length === 0}>
                                📥 Excel
                            </button>
                            <button className="btn btn-secondary" onClick={exportPDF} disabled={finishedLicenses.length === 0}>
                                📄 PDF
                            </button>
                        </div>
                    </div>
                    <LicenseTable
                        licenses={finishedLicenses}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        showStatus={false}
                    />
                </>
            )}

            {showForm && (
                <LicenseForm
                    license={editingLicense}
                    employees={employees}
                    onSave={handleSave}
                    onClose={() => { setShowForm(false); setEditingLicense(null); }}
                />
            )}
        </div>
    );
}
