'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { formatArgentinaDate, formatArgentinaDateTime, getArgentinaDateStamp, parseAppDate, toArgentinaDateInputValue } from '@/lib/datetime';
import LicensesView from './LicensesView';
import LicenseForm from './LicenseForm';
import LicensesGantt from './LicensesGantt';
import { useCatalog } from '@/lib/CatalogContext';

export default function HRSection({ initialTab = 'personal' }) {
    const [sectionTab, setSectionTab] = useState(initialTab);
    const [subView, setSubView] = useState('nomina');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
    const [perfilTab, setPerfilTab] = useState('documentos');
    const [showForm, setShowForm] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({ status: 'Todos', semaforo: 'Todos', servicio: 'Todos' });
    const [visibleCount, setVisibleCount] = useState(50);
    const [visibleTrialCount, setVisibleTrialCount] = useState(50);
    const fileInputRef = useRef(null);
    const idRef = useRef(1);

    // Data from DB
    const [employees, setEmployees] = useState([]);
    const { services, supervisors } = useCatalog();
    const [documentTypes, setDocumentTypes] = useState([]);
    const [employeeDocuments, setEmployeeDocuments] = useState([]); // In a real app, fetch per employee. Keeping it simple for migration.
    const [auditLogs, setAuditLogs] = useState([]);
    const [employeeLicenses, setEmployeeLicenses] = useState([]);
    const [licensesLoading, setLicensesLoading] = useState(false);
    const [showLicenseForm, setShowLicenseForm] = useState(false);
    const [editingLicense, setEditingLicense] = useState(null);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const [empRes, docTRes, docsRes] = await Promise.all([
                    fetch('/api/employees'),
                    fetch('/api/document-types'),
                    fetch('/api/employee-documents').catch(() => ({ json: () => [] })) // If endpoint doesn't exist yet
                ]);

                if (empRes.ok) setEmployees(await empRes.json());
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

    useEffect(() => {
        setVisibleCount(50);
    }, [searchTerm, filters]);

    useEffect(() => {
        if (!selectedEmployeeId) return;
        setLicensesLoading(true);
        fetch(`/api/licenses?employee_id=${selectedEmployeeId}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => setEmployeeLicenses(Array.isArray(data) ? data : []))
            .catch(() => setEmployeeLicenses([]))
            .finally(() => setLicensesLoading(false));
    }, [selectedEmployeeId]);

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
            const XLSX = await import('xlsx');
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
            celular: formData.get('celular') || null,
            direccion: formData.get('direccion') || null,
            mail: formData.get('mail') || null,
            fecha_ingreso: fechaIngreso,
            servicio_id: formData.get('servicio_id') || null,
        };

        try {
            if (editingEmployee) {
                const res = await fetch(`/api/employees/${editingEmployee.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(empData)
                });
                if (res.ok) {
                    const updatedEmp = await res.json();
                    setEmployees(employees.map(emp => emp.id === editingEmployee.id ? updatedEmp : emp));
                    addAudit('EDITAR', 'Empleado', editingEmployee.id, `Editado legajo: ${empData.legajo}`);
                } else {
                    const error = await res.json();
                    alert(error.error || 'Error al actualizar el empleado');
                    return;
                }
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

    const handleBaja = async (id, motivo) => {
        if (confirm('¿Confirmar baja?')) {
            const bajaData = {
                estado_empleado: 'Baja',
                fecha_baja: getArgentinaDateStamp(),
                motivo_baja: motivo
            };
            
            try {
                const res = await fetch(`/api/employees/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bajaData)
                });
                
                if (res.ok) {
                    const updatedEmp = await res.json();
                    setEmployees(employees.map(emp => emp.id === id ? updatedEmp : emp));
                    addAudit('BORRAR', 'Empleado', id, `Baja de legajo. Motivo: ${motivo}`);
                } else {
                    const error = await res.json();
                    alert(error.error || 'Error al dar de baja el empleado');
                }
            } catch (e) {
                console.error(e);
                alert('Error de conexión al dar de baja');
            }
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

    // Pre-computed once when data changes. Avoids recalculating on every filter/search render.
    const semaforoMap = useMemo(() => {
        const mandatoryTypes = documentTypes.filter(t => t.obligatorio);

        // Two-level index: empId → docTypeId → doc, for O(1) lookups inside the loop
        const docIndex = new Map();
        for (const doc of employeeDocuments) {
            if (!docIndex.has(doc.empleado_id)) docIndex.set(doc.empleado_id, new Map());
            docIndex.get(doc.empleado_id).set(doc.documento_tipo_id, doc);
        }

        const hoy = new Date();
        const map = new Map();

        for (const emp of employees) {
            if (mandatoryTypes.length === 0) {
                map.set(emp.id, { color: '🟢', label: 'Completo' });
                continue;
            }

            let label = 'Completo';
            const empDocs = docIndex.get(emp.id);

            for (const type of mandatoryTypes) {
                const doc = empDocs?.get(type.id);
                let status;
                if (!doc) {
                    status = 'Falta';
                } else if (!type.requiere_vencimiento) {
                    status = 'Vigente';
                } else {
                    const diffDays = Math.ceil((parseAppDate(doc.fecha_vencimiento) - hoy) / (1000 * 60 * 60 * 24));
                    if (diffDays < 0) status = 'Vencido';
                    else if (diffDays <= (type.dias_alerta || 30)) status = 'Por vencer';
                    else status = 'Vigente';
                }

                if (status === 'Vencido' || status === 'Falta') { label = 'Crítico'; break; }
                if (status === 'Por vencer') label = 'Atención';
            }

            const color = label === 'Crítico' ? '🔴' : label === 'Atención' ? '🟡' : '🟢';
            map.set(emp.id, { color, label });
        }

        return map;
    }, [employees, documentTypes, employeeDocuments]);

    const getServiceName = (emp) => {
        return emp.service_name || services.find(s => s.id === Number(emp.servicio_id))?.name || '---';
    };

    const getTrialPeriodEndDate = (employee) => {
        if (employee.fecha_fin_prueba) {
            return parseAppDate(employee.fecha_fin_prueba);
        }

        if (!employee.fecha_ingreso) {
            return null;
        }

        const endDate = parseAppDate(employee.fecha_ingreso);
        endDate.setUTCMonth(endDate.getUTCMonth() + 6);
        return endDate;
    };

    const getTrialPeriodStatus = (fechaFinPrueba) => {
        const hoy = new Date();
        const vencimiento = parseAppDate(fechaFinPrueba);
        const diffDays = Math.ceil((vencimiento - hoy) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return { badge: 'badge-danger', label: 'Vencido', diffDays };
        if (diffDays <= 21) return { badge: 'badge-warning', label: 'Próximo a vencer', diffDays };
        return { badge: 'badge-success', label: 'Vigente', diffDays };
    };

    const trialPeriodEmployees = useMemo(() => {
        return [...employees]
            .filter(emp => emp.estado_empleado === 'Activo' && emp.fecha_ingreso)
            .sort((a, b) => parseAppDate(a.fecha_ingreso) - parseAppDate(b.fecha_ingreso));
    }, [employees]);

    const exportTrialPeriodsToExcel = async () => {
        const XLSX = await import('xlsx');
        const data = trialPeriodEmployees.map(emp => {
            const trialEndDate = getTrialPeriodEndDate(emp);
            const status = getTrialPeriodStatus(trialEndDate);

            return {
                Legajo: emp.legajo,
                Apellido: emp.apellido,
                Nombre: emp.nombre,
                DNI: emp.dni,
                CUIL: emp.cuil,
                Servicio: getServiceName(emp),
                'Fecha Ingreso': emp.fecha_ingreso,
                'Vencimiento Prueba': trialEndDate ? trialEndDate.toISOString() : '',
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
            const matchesSem = filters.semaforo === 'Todos' || semaforoMap.get(emp.id)?.label === filters.semaforo;
            return matchesSearch && matchesStatus && matchesSem;
        });
    }, [employees, searchTerm, filters, semaforoMap]);

    const renderTrialPeriods = () => (
        <div className="periodos-rrhh-view">
            <header className="page-header" style={{ marginBottom: '2rem' }}>
                <div>
                    <h1>Periodos de prueba</h1>
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
                            {trialPeriodEmployees.slice(0, visibleTrialCount).map(emp => {
                                const trialEndDate = getTrialPeriodEndDate(emp);
                                const status = getTrialPeriodStatus(trialEndDate);

                                return (
                                    <tr key={emp.id}>
                                        <td data-label="Empleado"><strong>{emp.apellido}, {emp.nombre}</strong></td>
                                        <td data-label="Legajo">{emp.legajo || '---'}</td>
                                        <td data-label="Servicio">{getServiceName(emp)}</td>
                                        <td data-label="Fecha Ingreso">{emp.fecha_ingreso ? formatArgentinaDate(emp.fecha_ingreso) : '---'}</td>
                                        <td data-label="Vencimiento"><strong>{trialEndDate ? formatArgentinaDate(trialEndDate) : '---'}</strong></td>
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
                    {trialPeriodEmployees.length > visibleTrialCount && (
                        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', textAlign: 'center' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setVisibleTrialCount(c => c + 50)}
                            >
                                Mostrar más ({trialPeriodEmployees.length - visibleTrialCount} restantes)
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const buildNominaRows = () => filteredEmployees.map(emp => ({
        Legajo: emp.legajo || '',
        Apellido: emp.apellido || '',
        Nombre: emp.nombre || '',
        DNI: emp.dni || '',
        CUIL: emp.cuil || '',
        Celular: emp.celular || '',
        Servicio: emp.service_name || services.find(s => s.id === parseInt(emp.servicio_id))?.name || '',
        Estado: emp.estado_empleado || '',
        'Fecha Ingreso': emp.fecha_ingreso ? formatArgentinaDate(emp.fecha_ingreso) : '',
    }));

    const exportNominaExcel = async () => {
        const XLSX = await import('xlsx');
        const ws = XLSX.utils.json_to_sheet(buildNominaRows());
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Personal');
        XLSX.writeFile(wb, `Reporte_Personal_${getArgentinaDateStamp()}.xlsx`);
    };

    const exportNominaPdf = async () => {
        const rows = buildNominaRows();
        if (!rows.length) { alert('No hay empleados para exportar.'); return; }
        const [{ jsPDF }, { default: autoTable }] = await Promise.all([
            import('jspdf'),
            import('jspdf-autotable'),
        ]);
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(14);
        doc.text('Reporte de Personal', 14, 15);
        doc.setFontSize(9);
        doc.text(`Generado: ${formatArgentinaDateTime(new Date().toISOString())}`, 14, 21);
        autoTable(doc, {
            startY: 26,
            head: [['Legajo', 'Apellido', 'Nombre', 'DNI', 'CUIL', 'Celular', 'Servicio', 'Estado', 'Fecha Ingreso']],
            body: rows.map(r => [r.Legajo, r.Apellido, r.Nombre, r.DNI, r.CUIL, r.Celular, r.Servicio, r.Estado, r['Fecha Ingreso']]),
            styles: { fontSize: 8 },
            headStyles: { fillColor: [30, 37, 43], textColor: 255, fontStyle: 'bold' },
        });
        doc.save(`Reporte_Personal_${getArgentinaDateStamp()}.pdf`);
    };

    const renderNomina = () => (
        <div className="nomina-view">
            <header className="page-header" style={{ marginBottom: '2rem' }}>
                <div>
                    <h1>Personal</h1>
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
                                <th>Celular</th>
                                <th>Ingreso</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEmployees.slice(0, visibleCount).map(emp => {
                                return (
                                    <tr key={emp.id} className="clickable-row">
                                        <td data-label="Nombre Completo" onClick={() => { setSelectedEmployeeId(emp.id); setSubView('perfil'); setPerfilTab('documentos'); }}>
                                            <div style={{ fontWeight: 700 }}>{emp.apellido}, {emp.nombre}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Legajo: {emp.legajo}</div>
                                        </td>
                                        <td data-label="DNI / CUIL">
                                            <div>{emp.dni}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{emp.cuil}</div>
                                        </td>
                                        <td data-label="Celular">{emp.celular || <span style={{ color: 'var(--text-muted)' }}>---</span>}</td>
                                        <td data-label="Ingreso">{formatArgentinaDate(emp.fecha_ingreso)}</td>
                                        <td data-label="Acción" className="mobile-hide-label">
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                <button className="btn btn-secondary" style={{ padding: '0.4rem' }} onClick={() => { setSelectedEmployeeId(emp.id); setSubView('perfil'); setPerfilTab('documentos'); }}>👁</button>
                                                <button className="btn btn-secondary" style={{ padding: '0.4rem' }} onClick={(e) => { e.stopPropagation(); setEditingEmployee(emp); setShowForm(true); }}>✏</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filteredEmployees.length > visibleCount && (
                        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', textAlign: 'center' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setVisibleCount(c => c + 50)}
                            >
                                Mostrar más ({filteredEmployees.length - visibleCount} restantes)
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const renderPerfil = () => {
        const emp = employees.find(e => e.id === selectedEmployeeId);
        if (!emp) return null;
        const sem = semaforoMap.get(emp.id);
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

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <button
                        className={`btn ${perfilTab === 'documentos' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setPerfilTab('documentos')}
                    >
                        Documentación
                    </button>
                    <button
                        className={`btn ${perfilTab === 'licencias' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setPerfilTab('licencias')}
                    >
                        Licencias
                    </button>
                </div>

                {perfilTab === 'documentos' && (
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
                )}

                {showLicenseForm && (
                    <LicenseForm
                        license={editingLicense}
                        employees={employees}
                        defaultEmployeeId={emp.id}
                        onSave={(saved) => {
                            setEmployeeLicenses(prev =>
                                editingLicense
                                    ? prev.map(l => l.id === saved.id ? { ...l, ...saved } : l)
                                    : [saved, ...prev]
                            );
                        }}
                        onClose={() => { setShowLicenseForm(false); setEditingLicense(null); }}
                    />
                )}

                {perfilTab === 'licencias' && (
                    <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h3 style={{ margin: 0 }}>Licencias de {emp.nombre} {emp.apellido}</h3>
                            <button className="btn btn-primary" style={{ padding: '0.4rem 0.9rem', fontSize: '0.88rem' }} onClick={() => setShowLicenseForm(true)}>
                                + Nueva Licencia
                            </button>
                        </div>
                        {licensesLoading ? (
                            <p style={{ padding: '1.5rem', color: 'var(--text-muted)' }}>Cargando...</p>
                        ) : employeeLicenses.length === 0 ? (
                            <p style={{ padding: '1.5rem', color: 'var(--text-muted)' }}>No hay licencias registradas para este empleado.</p>
                        ) : (
                            <div className="table-container">
                                <table className="table mobile-cards-table">
                                    <thead>
                                        <tr>
                                            <th>Tipo</th>
                                            <th>Desde</th>
                                            <th>Hasta</th>
                                            <th>Estado</th>
                                            <th>Notas</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {employeeLicenses.map(lic => (
                                            <tr key={lic.id}>
                                                <td data-label="Tipo" style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                                                    {lic.type?.replace('_', ' ')}
                                                </td>
                                                <td data-label="Desde">{formatArgentinaDate(lic.start_date)}</td>
                                                <td data-label="Hasta">{formatArgentinaDate(lic.end_date)}</td>
                                                <td data-label="Estado">
                                                    <span className={`badge ${lic.status === 'activa' ? 'badge-success' : 'badge-secondary'}`}>
                                                        {lic.status === 'activa' ? 'Activa' : 'Finalizada'}
                                                    </span>
                                                </td>
                                                <td data-label="Notas" style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                                                    {lic.notes || '---'}
                                                </td>
                                                <td className="mobile-hide-label">
                                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                        <button
                                                            className="btn btn-secondary"
                                                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                                                            onClick={() => { setEditingLicense(lic); setShowLicenseForm(true); }}
                                                        >
                                                            Editar
                                                        </button>
                                                        <button
                                                            className="btn btn-secondary"
                                                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', color: 'var(--error)' }}
                                                            onClick={async () => {
                                                                if (!confirm('¿Eliminar esta licencia?')) return;
                                                                const res = await fetch(`/api/licenses/${lic.id}`, { method: 'DELETE' });
                                                                if (res.ok) setEmployeeLicenses(prev => prev.filter(l => l.id !== lic.id));
                                                            }}
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
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

    const renderTabs = () => (
        <div className="hr-top-tabs" style={{ marginBottom: '2rem' }}>
            <button 
                className={`btn ${sectionTab === 'personal' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setSectionTab('personal'); setSubView('nomina'); }}
            >
                👥 Personal
            </button>
            <button 
                className={`btn ${sectionTab === 'periodos' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSectionTab('periodos')}
            >
                ⏱️ Períodos de Prueba
            </button>
            <button 
                className={`btn ${sectionTab === 'licencias' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSectionTab('licencias')}
            >
                📅 Licencias
            </button>
        </div>
    );

    return (
        <div className="hr-section-v3">
            {sectionTab === 'personal' && subView === 'nomina' && renderNomina()}
            {sectionTab === 'personal' && subView === 'perfil' && renderPerfil()}
            {sectionTab === 'personal' && subView === 'admin' && renderAdmin()}
            {sectionTab === 'periodos' && renderTrialPeriods()}
            {sectionTab === 'licencias' && <LicensesGantt employees={employees} />}

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
                                    <label>Celular</label>
                                    <input name="celular" type="tel" placeholder="Ej: 11 1234-5678" defaultValue={editingEmployee?.celular || ''} />
                                </div>
                                <div className="form-group">
                                    <label>Mail</label>
                                    <input name="mail" type="email" placeholder="Ej: juan@gmail.com" defaultValue={editingEmployee?.mail || ''} />
                                </div>
                                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                    <label>Dirección</label>
                                    <input name="direccion" placeholder="Ej: Av. Corrientes 1234 (CABA)" defaultValue={editingEmployee?.direccion || ''} />
                                </div>
                                <div className="form-group">
                                    <label>Servicio Asignado</label>
                                    <select name="servicio_id" defaultValue={editingEmployee?.servicio_id || ''}>
                                        <option value="">Ninguno</option>
                                        {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
