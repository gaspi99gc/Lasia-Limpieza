'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { formatArgentinaDate, formatArgentinaDateTime, getArgentinaDateStamp, parseAppDate, toArgentinaDateInputValue } from '@/lib/datetime';

export default function HRSection({ initialTab = 'personal' }) {
    const [sectionTab, setSectionTab] = useState(initialTab);
    const [subView, setSubView] = useState('nomina');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({ status: 'Todos', semaforo: 'Todos', servicio: 'Todos' });
    const fileInputRef = useRef(null);
    const idRef = useRef(1);

    // Data from DB
    const [employees, setEmployees] = useState([]);
    const [services, setServices] = useState([]);
    const [supervisors, setSupervisors] = useState([]);
    const [documentTypes, setDocumentTypes] = useState([]);
    const [employeeDocuments, setEmployeeDocuments] = useState([]); // In a real app, fetch per employee. Keeping it simple for migration.
    const [auditLogs, setAuditLogs] = useState([]);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const [empRes, servRes, supRes, docTRes, docsRes] = await Promise.all([
                    fetch('/api/employees'),
                    fetch('/api/services'),
                    fetch('/api/supervisors'),
                    fetch('/api/document-types'),
                    fetch('/api/employee-documents').catch(() => ({ json: () => [] })) // If endpoint doesn't exist yet
                ]);

                if (empRes.ok) setEmployees(await empRes.json());
                if (servRes.ok) setServices(await servRes.json());
                if (supRes.ok) setSupervisors(await supRes.json());
                if (docTRes.ok) setDocumentTypes(await docTRes.json());

                // For docs and audits, we might need new endpoints, placeholder for now
                if (docsRes && docsRes.ok) setEmployeeDocuments(await docsRes.json());
            } catch (err) {
                console.error("Error loading HR data", err);
            }
        };
        loadInitialData();
    }, []);

    useEffect(() => {
        setSectionTab(initialTab);
    }, [initialTab]);

    const addAudit = (accion, entidad, entidad_id, detalle) => {
        const newLog = {
                    id: idRef.current++,
            timestamp: new Date().toISOString(),
            accion,
            entidad,
            entidad_id,
            detalle
        };
        setAuditLogs([newLog, ...auditLogs]); // Placeholder until DB audit is implemented
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const bstr = evt.target.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws);

            let addedCount = 0;
            for (const row of data) {
                const legajo = row.Legajo || row.legajo || `IMP-${idRef.current++}-${addedCount}`;
                if (employees.some(emp => emp.legajo === legajo)) continue;

                const fechaIngreso = row['Fecha Ingreso'] || row.fecha_ingreso || getArgentinaDateStamp();

                const empData = {
                    legajo,
                    nombre: row.Nombre || row.nombre || 'N/A',
                    apellido: row.Apellido || row.apellido || 'N/A',
                    dni: row.DNI || row.dni || '',
                    cuil: row.CUIL || row.cuil || '',
                    fecha_ingreso: fechaIngreso,
                    servicio_id: row.ServicioID || row.servicio_id || null,
                    supervisor_id: row.SupervisorID || row.supervisor_id || null,
                };

                try {
                    const res = await fetch('/api/employees', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(empData)
                    });
                    if (res.ok) {
                        const newEmp = await res.json();
                        setEmployees(prev => [...prev, newEmp]);
                        addedCount++;
                    }
                } catch (e) { console.error("Error importing row", e); }
            }

            addAudit('IMPORTAR', 'Empleado', null, `Importados ${addedCount} empleados desde Excel`);
            alert(`Se importaron ${addedCount} empleados correctamente.`);
        };
        reader.readAsBinaryString(file);
    };

    const handleSaveEmployee = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const fechaIngreso = formData.get('fecha_ingreso');

        const empData = {
            legajo: formData.get('legajo'),
            nombre: formData.get('nombre'),
            apellido: formData.get('apellido'),
            dni: formData.get('dni'),
            cuil: formData.get('cuil'),
            fecha_ingreso: fechaIngreso,
            servicio_id: formData.get('servicio_id') || null,
            supervisor_id: formData.get('supervisor_id') || null,
        };

        try {
            if (editingEmployee) {
                // UPDATE logic (To be implemented in API, using placeholder state update for now)
                setEmployees(employees.map(emp => emp.id === editingEmployee.id ? { ...emp, ...empData } : emp));
                addAudit('EDITAR', 'Empleado', editingEmployee.id, `Editado legajo: ${empData.legajo}`);
            } else {
                const res = await fetch('/api/employees', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(empData)
                });
                if (res.ok) {
                    const newEmp = await res.json();
                    setEmployees([...employees, newEmp]);
                    addAudit('CREAR', 'Empleado', newEmp.id, `Creado legajo: ${empData.legajo}`);
                }
            }
        } catch (e) { console.error(e); }

        setShowForm(false);
        setEditingEmployee(null);
    };

    const handleBaja = (id, motivo) => {
        if (confirm('¿Confirmar baja?')) {
            // Update DB state
            setEmployees(employees.map(emp => emp.id === id ? {
                ...emp,
                estado_empleado: 'Baja',
                fecha_baja: getArgentinaDateStamp(),
                motivo_baja: motivo
            } : emp));
            addAudit('BORRAR', 'Empleado', id, `Baja de legajo. Motivo: ${motivo}`);
        }
    };

    const handleUploadDoc = (empId, typeId) => {
        const type = documentTypes.find(t => t.id === typeId);
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,application/pdf';

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                const base64Content = evt.target.result;
                let expiration = null;
                if (type.requiere_vencimiento) {
                    expiration = prompt(`Fecha de vencimiento para ${type.nombre} (YYYY-MM-DD):`);
                    if (!expiration) return;
                }

                const newDoc = {
            id: idRef.current++,
                    empleado_id: empId,
                    documento_tipo_id: typeId,
                    archivo_url: base64Content,
                    archivo_nombre: file.name,
                    fecha_carga: getArgentinaDateStamp(),
                    fecha_vencimiento: expiration
                };

                setEmployeeDocuments([...employeeDocuments, newDoc]);
                addAudit('CREAR', 'Documento', empId, `Cargado documento: ${type.nombre} (${file.name})`);
            };
            reader.readAsDataURL(file);
        };
        input.click();
    };

    const handlePreviewDoc = (doc) => {
        const type = documentTypes.find(t => t.id === doc.documento_tipo_id);
        const newWindow = window.open();
        newWindow.document.write(`
            <html>
                <head><title>Vista Previa: ${type?.nombre}</title></head>
                <body style="margin:0; display:flex; flex-direction:column; height:100vh; font-family: sans-serif;">
                    <div style="padding:1rem; background:#1F3A4A; color:white; display:flex; justify-content:space-between; align-items:center;">
                        <strong>${type?.nombre} - ${doc.archivo_nombre}</strong>
                        <button onclick="window.close()" style="padding:0.5rem 1rem; cursor:pointer; background:#4FA9C6; border:none; color:white; border-radius:4px; font-weight:600;">Cerrar</button>
                    </div>
                    ${doc.archivo_url.startsWith('data:application/pdf')
                ? `<iframe src="${doc.archivo_url}" style="width:100%; height:100%; border:none;"></iframe>`
                : `<div style="flex:1; display:flex; align-items:center; justify-content:center; background:#f0f2f5; overflow:auto;">
                             <img src="${doc.archivo_url}" style="max-width:95%; max-height:95%; object-fit:contain; box-shadow: 0 10px 30px rgba(0,0,0,0.1);" />
                           </div>`
            }
                </body>
            </html>
        `);
    };

    const handleDeleteDoc = (id) => {
        if (confirm('¿Eliminar documento?')) {
            setEmployeeDocuments(employeeDocuments.filter(d => d.id !== id));
        }
    };

    const getDocStatus = (empId, type) => {
        const doc = employeeDocuments.find(d => d.empleado_id === empId && d.documento_tipo_id === type.id);
        if (!doc) return 'Falta';
        if (!type.requiere_vencimiento) return 'Vigente';

        const hoy = new Date();
        const vto = parseAppDate(doc.fecha_vencimiento);
        const diffDays = Math.ceil((vto - hoy) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return 'Vencido';
        if (diffDays <= (type.dias_alerta || 30)) return 'Por vencer';
        return 'Vigente';
    };

    const getSemaforo = (empId) => {
        const mandatoryTypes = documentTypes.filter(t => t.obligatorio);
        if (mandatoryTypes.length === 0) return { color: '🟢', label: 'Completo' };

        const statuses = mandatoryTypes.map(t => getDocStatus(empId, t));
        if (statuses.includes('Vencido') || statuses.includes('Falta')) return { color: '🔴', label: 'Crítico' };
        if (statuses.includes('Por vencer')) return { color: '🟡', label: 'Atención' };
        return { color: '🟢', label: 'Completo' };
    };

    const getServiceName = (emp) => {
        return emp.service_name || services.find(s => s.id === Number(emp.servicio_id))?.name || '---';
    };

    const getTrialPeriodStatus = (fechaFinPrueba) => {
        const hoy = new Date();
        const vencimiento = parseAppDate(fechaFinPrueba);
        const diffDays = Math.ceil((vencimiento - hoy) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return { badge: 'badge-danger', label: 'Vencido', diffDays };
        if (diffDays <= 15) return { badge: 'badge-warning', label: 'Por vencer', diffDays };
        return { badge: 'badge-success', label: 'Vigente', diffDays };
    };

    const trialPeriodEmployees = useMemo(() => {
        return [...employees]
            .filter(emp => emp.estado_empleado === 'Activo' && emp.fecha_fin_prueba)
            .sort((a, b) => parseAppDate(a.fecha_fin_prueba) - parseAppDate(b.fecha_fin_prueba));
    }, [employees]);

    const exportTrialPeriodsToExcel = () => {
        const data = trialPeriodEmployees.map(emp => {
            const status = getTrialPeriodStatus(emp.fecha_fin_prueba);

            return {
                Legajo: emp.legajo,
                Apellido: emp.apellido,
                Nombre: emp.nombre,
                DNI: emp.dni,
                CUIL: emp.cuil,
                Servicio: getServiceName(emp),
                'Fecha Ingreso': emp.fecha_ingreso,
                'Vencimiento Prueba': emp.fecha_fin_prueba,
                'Dias Restantes': status.diffDays,
                Estado: status.label
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Vencimientos');
        XLSX.writeFile(workbook, `Reporte_RRHH_Prueba_${getArgentinaDateStamp()}.xlsx`);
    };

    const filteredEmployees = useMemo(() => {
        return employees.filter(emp => {
            const matchesSearch = (emp.nombre + emp.apellido + emp.dni + emp.legajo + emp.cuil).toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = filters.status === 'Todos' || emp.estado_empleado === filters.status;
            const matchesSem = filters.semaforo === 'Todos' || getSemaforo(emp.id).label === filters.semaforo;
            return matchesSearch && matchesStatus && matchesSem;
        });
    }, [employees, searchTerm, filters, employeeDocuments]);

    const renderTrialPeriods = () => (
        <div className="periodos-rrhh-view">
            <header className="page-header" style={{ marginBottom: '2rem' }}>
                <div>
                    <h1>Períodos de Prueba</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Seguimiento centralizado de vencimientos y estabilidad laboral</p>
                </div>
                <div className="page-header-actions">
                    <button className="btn btn-primary" onClick={exportTrialPeriodsToExcel}>📥 Descargar Informe Excel</button>
                </div>
            </header>

            <div className="card" style={{ padding: 0 }}>
                <div className="table-container">
                    <table className="table mobile-cards-table">
                        <thead>
                            <tr>
                                <th>Empleado</th>
                                <th>Legajo</th>
                                <th>Servicio</th>
                                <th>Fecha Ingreso</th>
                                <th>Vencimiento</th>
                                <th>Estado</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {trialPeriodEmployees.map(emp => {
                                const status = getTrialPeriodStatus(emp.fecha_fin_prueba);

                                return (
                                    <tr key={emp.id}>
                                        <td data-label="Empleado"><strong>{emp.apellido}, {emp.nombre}</strong></td>
                                        <td data-label="Legajo">{emp.legajo || '---'}</td>
                                        <td data-label="Servicio">{getServiceName(emp)}</td>
                                        <td data-label="Fecha Ingreso">{emp.fecha_ingreso ? formatArgentinaDate(emp.fecha_ingreso) : '---'}</td>
                                        <td data-label="Vencimiento"><strong>{formatArgentinaDate(emp.fecha_fin_prueba)}</strong></td>
                                        <td data-label="Estado"><span className={`badge ${status.badge}`}>{status.label}</span></td>
                                        <td data-label="Acción" className="mobile-hide-label">
                                            <button
                                                className="btn btn-secondary"
                                                onClick={() => {
                                                    setSectionTab('personal');
                                                    setSelectedEmployeeId(emp.id);
                                                    setSubView('perfil');
                                                }}
                                            >
                                                Abrir legajo
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {trialPeriodEmployees.length === 0 && (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '1.5rem' }}>
                                        No hay empleados en período de prueba.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderNomina = () => (
        <div className="nomina-view">
            <header className="page-header" style={{ marginBottom: '2rem' }}>
                <div>
                    <h1>Legajos del Personal</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Gestión integral de la nómina LASIA</p>
                </div>
                <div className="hr-header-actions">
                    <input type="file" ref={fileInputRef} hidden onChange={handleFileUpload} accept=".xlsx,.csv" />
                    <button className="btn btn-secondary" onClick={() => fileInputRef.current.click()}>📥 Importar</button>
                    <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Nuevo Legajo</button>
                </div>
            </header>

            <div className="card hr-filters-bar" style={{ marginBottom: '1.5rem' }}>
                <input
                    type="text"
                    placeholder="Buscar por nombre, legajo, DNI..."
                    style={{ flex: 1, minWidth: '120px' }}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
                <select className="hr-filter-select" style={{ width: 'auto' }} value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
                    <option value="Todos">Todos los Estados</option>
                    <option value="Activo">Activos</option>
                    <option value="Baja">Bajas</option>
                    <option value="Pendiente">Pendientes</option>
                </select>
                <select className="hr-filter-select" style={{ width: 'auto' }} value={filters.semaforo} onChange={e => setFilters({ ...filters, semaforo: e.target.value })}>
                    <option value="Todos">Semáforo: Todos</option>
                    <option value="Completo">Completo</option>
                    <option value="Atención">Atención</option>
                    <option value="Crítico">Crítico</option>
                </select>
                <button className="btn btn-secondary" onClick={() => setSubView('admin')}>⚙ Gestión Docs</button>
            </div>

            <div className="card" style={{ padding: 0 }}>
                <div className="table-container">
                    <table className="mobile-cards-table">
                        <thead>
                            <tr>
                                <th>Nombre Completo</th>
                                <th>DNI / CUIL</th>
                                <th>Puesto / Servicio</th>
                                <th>Estado</th>
                                <th>Ingreso</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEmployees.map(emp => {
                                const sem = getSemaforo(emp.id);
                                return (
                                    <tr key={emp.id} className="clickable-row">
                                        <td data-label="Nombre Completo" onClick={() => { setSelectedEmployeeId(emp.id); setSubView('perfil'); }}>
                                            <div style={{ fontWeight: 700 }}>{emp.apellido}, {emp.nombre}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Legajo: {emp.legajo}</div>
                                        </td>
                                        <td data-label="DNI / CUIL">
                                            <div>{emp.dni}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{emp.cuil}</div>
                                        </td>
                                        <td data-label="Puesto / Servicio">{emp.service_name || services.find(s => s.id === parseInt(emp.servicio_id))?.name || '---'}</td>
                                        <td data-label="Estado">
                                            <span className={`badge ${emp.estado_empleado === 'Activo' ? 'badge-success' : emp.estado_empleado === 'Baja' ? 'badge-danger' : 'badge-secondary'}`}>
                                                {emp.estado_empleado}
                                            </span>
                                        </td>
                                        <td data-label="Ingreso">{formatArgentinaDate(emp.fecha_ingreso)}</td>
                                        <td data-label="Acción" className="mobile-hide-label">
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                <button className="btn btn-secondary" style={{ padding: '0.4rem' }} onClick={() => { setSelectedEmployeeId(emp.id); setSubView('perfil'); }}>👁</button>
                                                <button className="btn btn-secondary" style={{ padding: '0.4rem' }} onClick={(e) => { e.stopPropagation(); setEditingEmployee(emp); setShowForm(true); }}>✏</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderPerfil = () => {
        const emp = employees.find(e => e.id === selectedEmployeeId);
        if (!emp) return null;
        const sem = getSemaforo(emp.id);
        const stats = {
            faltantes: documentTypes.filter(dt => getDocStatus(emp.id, dt) === 'Falta').length,
            vencidos: documentTypes.filter(dt => getDocStatus(emp.id, dt) === 'Vencido').length,
            porVencer: documentTypes.filter(dt => getDocStatus(emp.id, dt) === 'Por vencer').length,
        };

        return (
            <div className="profile-view">
                <header className="page-header" style={{ marginBottom: '2rem' }}>
                    <div className="profile-heading-group" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button className="btn btn-secondary" onClick={() => setSubView('nomina')}>← Volver</button>
                        <div>
                            <h1>{emp.apellido}, {emp.nombre}</h1>
                            <p style={{ color: 'var(--text-muted)' }}>Legajo #{emp.legajo} | {emp.estado_empleado}</p>
                        </div>
                    </div>
                    <div className="page-header-actions">
                        <button className="btn btn-secondary" onClick={() => { setEditingEmployee(emp); setShowForm(true); }}>Editar Perfil</button>
                        {emp.estado_empleado === 'Activo' && (
                            <button className="btn btn-secondary" style={{ color: 'var(--error)' }} onClick={() => {
                                const m = prompt('Motivo de la baja:');
                                if (m) handleBaja(emp.id, m);
                            }}>Dar de Baja</button>
                        )}
                    </div>
                </header>

                <div className="metrics-grid">
                    <div className="metric-card">
                        <label>Vencidos</label>
                        <div className="value" style={{ color: 'var(--error)' }}>{stats.vencidos}</div>
                    </div>
                    <div className="metric-card">
                        <label>Por Vencer</label>
                        <div className="value" style={{ color: 'var(--warning)' }}>{stats.porVencer}</div>
                    </div>
                    <div className="metric-card">
                        <label>Faltantes</label>
                        <div className="value">{stats.faltantes}</div>
                    </div>
                    <div className="metric-card">
                        <label>Status</label>
                        <div className="value" style={{ fontSize: '1.2rem', marginTop: '0.5rem' }}>{sem.color} {sem.label}</div>
                    </div>
                </div>

                <div className="profile-split-grid">
                    <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                            <h3 style={{ margin: 0 }}>Documentación Requerida</h3>
                        </div>
                        <div className="table-container">
                            <table className="mobile-cards-table">
                                <thead>
                                    <tr><th>Tipo</th><th>Estado</th><th>Vencimiento</th><th>Acción</th></tr>
                                </thead>
                                <tbody>
                                    {documentTypes.map(dt => {
                                        const status = getDocStatus(emp.id, dt);
                                        const doc = employeeDocuments.find(d => d.empleado_id === emp.id && d.documento_tipo_id === dt.id);
                                        return (
                                            <tr key={dt.id}>
                                                <td data-label="Tipo">
                                                    <div style={{ fontWeight: 600 }}>{dt.nombre}</div>
                                                    {dt.obligatorio ? <span style={{ fontSize: '0.65rem', color: 'var(--error)', textTransform: 'uppercase' }}>Obligatorio</span> : null}
                                                </td>
                                                <td data-label="Estado">
                                                    <span className={`badge ${status === 'Vigente' ? 'badge-success' : status === 'Vencido' ? 'badge-danger' : status === 'Por vencer' ? 'badge-warning' : 'badge-secondary'}`}>
                                                        {status}
                                                    </span>
                                                </td>
                                                <td data-label="Vencimiento">{doc?.fecha_vencimiento ? formatArgentinaDate(doc.fecha_vencimiento) : '---'}</td>
                                                <td data-label="Acción" className="mobile-hide-label">
                                                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                                        {!doc ? (
                                                            <button className="btn btn-primary" style={{ padding: '0.3rem 0.6rem' }} onClick={() => handleUploadDoc(emp.id, dt.id)}>Subir</button>
                                                        ) : (
                                                            <>
                                                                <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem' }} onClick={() => handlePreviewDoc(doc)}>Ver</button>
                                                                <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', color: 'var(--error)' }} onClick={() => handleDeleteDoc(doc.id)}>✕</button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="card">
                        <h3>Historial de Cambios</h3>
                        <div className="audit-list" style={{ marginTop: '1rem', maxHeight: '400px', overflowY: 'auto' }}>
                            {auditLogs.filter(l => l.entidad_id === emp.id).map(log => (
                                <div key={log.id} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                                    <div style={{ color: 'var(--text-muted)' }}>{formatArgentinaDateTime(log.timestamp)}</div>
                                    <div style={{ fontWeight: 500 }}>{log.detalle}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderAdmin = () => (
        <div className="admin-view">
            <header className="page-header" style={{ marginBottom: '2rem' }}>
                <div>
                    <h1>Configuración Documental</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Definición de requisitos por legajo</p>
                </div>
                <div className="page-header-actions">
                    <button className="btn btn-secondary" onClick={() => setSubView('nomina')}>← Volver</button>
                </div>
            </header>
            <div className="card" style={{ padding: 0 }}>
                <table className="table mobile-cards-table">
                    <thead>
                        <tr>
                            <th>Documento</th>
                            <th>Obligatorio</th>
                            <th>Vencimiento</th>
                            <th>Días Alerta</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {documentTypes.map(dt => (
                            <tr key={dt.id}>
                                <td data-label="Documento"><strong>{dt.nombre}</strong></td>
                                <td data-label="Obligatorio"><input type="checkbox" checked={dt.obligatorio} readOnly /></td>
                                <td data-label="Vencimiento"><input type="checkbox" checked={dt.requiere_vencimiento} readOnly /></td>
                                <td data-label="Días Alerta"><input type="number" value={dt.dias_alerta || 30} style={{ width: '60px' }} readOnly /></td>
                                <td data-label="Acciones" className="mobile-hide-label"><button className="btn btn-secondary" style={{ color: 'var(--error)' }}>Eliminar</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div style={{ padding: '1.5rem', background: 'var(--color-muted-surface)', borderTop: '1px solid var(--border-color)' }}>
                    <button className="btn btn-primary" onClick={() => alert("Función en desarrollo para base de datos")}>+ Agregar Tipo de Documento</button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="hr-section-v3">
            <div className="hr-top-tabs">
                <button
                    type="button"
                    onClick={() => setSectionTab('personal')}
                    style={{
                        border: 'none',
                        borderRadius: '10px',
                        padding: '0.75rem 1rem',
                        background: sectionTab === 'personal' ? 'var(--color-primary)' : 'transparent',
                        color: sectionTab === 'personal' ? '#fff' : 'var(--text-main)',
                        cursor: 'pointer',
                        fontWeight: 700,
                        boxShadow: sectionTab === 'personal' ? 'var(--shadow-md)' : 'none'
                    }}
                >
                    Personal
                </button>
                <button
                    type="button"
                    onClick={() => setSectionTab('periodos')}
                    style={{
                        border: 'none',
                        borderRadius: '10px',
                        padding: '0.75rem 1rem',
                        background: sectionTab === 'periodos' ? 'var(--color-primary)' : 'transparent',
                        color: sectionTab === 'periodos' ? '#fff' : 'var(--text-main)',
                        cursor: 'pointer',
                        fontWeight: 700,
                        boxShadow: sectionTab === 'periodos' ? 'var(--shadow-md)' : 'none'
                    }}
                >
                    Períodos de prueba
                </button>
            </div>

            {sectionTab === 'personal' && subView === 'nomina' && renderNomina()}
            {sectionTab === 'personal' && subView === 'perfil' && renderPerfil()}
            {sectionTab === 'personal' && subView === 'admin' && renderAdmin()}
            {sectionTab === 'periodos' && renderTrialPeriods()}

            {showForm && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>{editingEmployee ? 'Editar Legajo' : 'Alta de Nuevo Legajo'}</h2>
                        <form onSubmit={handleSaveEmployee} style={{ marginTop: '1.5rem' }}>
                            <div className="employee-form-grid">
                                <div className="form-group">
                                    <label>Legajo</label>
                                    <input name="legajo" required defaultValue={editingEmployee?.legajo} />
                                </div>
                                <div className="form-group">
                                    <label>DNI</label>
                                    <input name="dni" required defaultValue={editingEmployee?.dni} />
                                </div>
                                <div className="form-group">
                                    <label>Nombre</label>
                                    <input name="nombre" required defaultValue={editingEmployee?.nombre} />
                                </div>
                                <div className="form-group">
                                    <label>Apellido</label>
                                    <input name="apellido" required defaultValue={editingEmployee?.apellido} />
                                </div>
                                <div className="form-group">
                                    <label>CUIL</label>
                                    <input name="cuil" required defaultValue={editingEmployee?.cuil} />
                                </div>
                                <div className="form-group">
                                    <label>Fecha Ingreso</label>
                                    <input name="fecha_ingreso" type="date" required defaultValue={toArgentinaDateInputValue(editingEmployee?.fecha_ingreso)} />
                                </div>
                                <div className="form-group">
                                    <label>Servicio Asignado</label>
                                    <select name="servicio_id" defaultValue={editingEmployee?.servicio_id || ''}>
                                        <option value="">Ninguno</option>
                                        {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Supervisor</label>
                                    <select name="supervisor_id" defaultValue={editingEmployee?.supervisor_id || ''}>
                                        <option value="">Ninguno</option>
                                        {supervisors.map(s => <option key={s.id} value={s.id}>{s.name} {s.surname}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="config-modal-actions" style={{ marginTop: '2rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setEditingEmployee(null); }}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Guardar Legajo</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
