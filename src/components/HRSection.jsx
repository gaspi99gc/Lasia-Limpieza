'use client';

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatArgentinaDate, formatArgentinaDateTime, getArgentinaDateStamp, parseAppDate, toArgentinaDateInputValue } from '@/lib/datetime';
import LicensesView from './LicensesView';
import LicenseForm from './LicenseForm';
import LicensesGantt from './LicensesGantt';
import HRCalendar from './HRCalendar';
import HRReportsView from './HRReportsView';
import RecibosView from './RecibosView';
import LegalCasesView from './LegalCasesView';
import { useCatalog } from '@/lib/CatalogContext';
import { getSessionUser } from '@/lib/session';
import { useEmployees, employeesKey } from '@/hooks/queries/useEmployees';
import { useDocumentTypes } from '@/hooks/queries/useDocumentTypes';
import { useEmployeeLicenses, employeeLicensesKey } from '@/hooks/queries/useEmployeeLicenses';
import { notify } from '@/lib/toast';
import { downloadWorkbook } from '@/lib/xlsx-download';
import { matchesSearch } from '@/lib/search';

const REPORT_CATEGORIES = [
    { key: 'sancion', label: 'Sanción', bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
    { key: 'suspension', label: 'Suspensión', bg: '#F3E8FF', fg: '#7C3AED', border: '#DDD6FE' },
    { key: 'advertencia', label: 'Advertencia', bg: '#FFFBEB', fg: '#B45309', border: '#FCD34D' },
    { key: 'felicitacion', label: 'Felicitación', bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
    { key: 'incidente', label: 'Incidente', bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE' },
];

// Inclusivo: 28/05 al 28/05 = 1 día, 28/05 al 31/05 = 4 días.
function suspensionDays(desde, hasta) {
    if (!desde || !hasta) return null;
    const [y1, m1, d1] = desde.split('-').map(Number);
    const [y2, m2, d2] = hasta.split('-').map(Number);
    const ms = Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1);
    return Math.floor(ms / 86400000) + 1;
}

function fmtYMD(ymd) {
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
}
const REPORT_CATEGORY_BY_KEY = Object.fromEntries(REPORT_CATEGORIES.map(c => [c.key, c]));

export default function HRSection({ initialTab = 'personal', initialEmpleadoId = null }) {
    const [sectionTab, setSectionTab] = useState(initialTab);
    const [readOnly, setReadOnly] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    useEffect(() => {
        const role = getSessionUser()?.role;
        setReadOnly(role === 'direccion');
        setIsAdmin(role === 'admin');
    }, []);
    const [subView, setSubView] = useState('nomina');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
    const [perfilTab, setPerfilTab] = useState('documentos');
    const [showForm, setShowForm] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({ status: 'Activo', servicio: 'Todos' });
    const [visibleCount, setVisibleCount] = useState(50);
    const [visibleTrialCount, setVisibleTrialCount] = useState(50);
    const [nominaSort, setNominaSort] = useState({ field: 'apellido', dir: 'asc' });
    const idRef = useRef(1);

    // Data from DB (React Query)
    const queryClient = useQueryClient();
    const { data: employees = [] } = useEmployees();
    const { services, supervisors } = useCatalog();
    const { data: documentTypes = [] } = useDocumentTypes();
    const [employeeDocuments, setEmployeeDocuments] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const { data: employeeLicenses = [], isLoading: licensesLoading } = useEmployeeLicenses(selectedEmployeeId);
    const [showLicenseForm, setShowLicenseForm] = useState(false);
    const [editingLicense, setEditingLicense] = useState(null);
    const [employeeReports, setEmployeeReports] = useState([]);
    const [showReportForm, setShowReportForm] = useState(false);
    const [reportCategoria, setReportCategoria] = useState('incidente');
    const [reportDescripcion, setReportDescripcion] = useState('');
    const [reportFechaDesde, setReportFechaDesde] = useState('');
    const [reportFechaHasta, setReportFechaHasta] = useState('');
    const [savingReport, setSavingReport] = useState(false);

    const setEmployees = useCallback((updater) => {
        queryClient.setQueryData(employeesKey, (prev = []) =>
            typeof updater === 'function' ? updater(prev) : updater
        );
    }, [queryClient]);

    const setEmployeeLicenses = useCallback((updater) => {
        if (!selectedEmployeeId) return;
        queryClient.setQueryData(employeeLicensesKey(selectedEmployeeId), (prev = []) =>
            typeof updater === 'function' ? updater(prev) : updater
        );
    }, [queryClient, selectedEmployeeId]);

    useEffect(() => {
        setSectionTab(initialTab);
    }, [initialTab]);

    useEffect(() => {
        if (initialEmpleadoId) {
            setSectionTab('personal');
            setSubView('perfil');
            setSelectedEmployeeId(initialEmpleadoId);
            setPerfilTab('documentos');
        }
    }, [initialEmpleadoId]);

    useEffect(() => {
        setVisibleCount(50);
    }, [searchTerm, filters]);

    useEffect(() => {
        if (!selectedEmployeeId) { setEmployeeReports([]); return; }
        fetch(`/api/employee-reports?empleado_id=${selectedEmployeeId}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => setEmployeeReports(Array.isArray(data) ? data : []))
            .catch(() => setEmployeeReports([]));
    }, [selectedEmployeeId]);

    // Carga TODOS los documentos al montar. Se usan para el semaforo de la lista
    // y para el perfil. Sin esto, al refrescar la pagina los documentos cargados
    // dejaban de verse (el estado arrancaba vacio y nunca se pedian de nuevo).
    const loadEmployeeDocuments = useCallback(async () => {
        try {
            const res = await fetch('/api/employee-documents');
            const data = await res.json().catch(() => []);
            setEmployeeDocuments(Array.isArray(data) ? data : []);
        } catch {
            setEmployeeDocuments([]);
        }
    }, []);

    useEffect(() => { loadEmployeeDocuments(); }, [loadEmployeeDocuments]);

    const handleCreateReport = async (empId) => {
        if (!reportDescripcion.trim()) return;
        if (reportCategoria === 'suspension') {
            if (!reportFechaDesde || !reportFechaHasta) {
                notify.error('Indicá las fechas desde y hasta de la suspensión.');
                return;
            }
            if (reportFechaHasta < reportFechaDesde) {
                notify.error('La fecha "hasta" no puede ser anterior a "desde".');
                return;
            }
        }
        const user = getSessionUser();
        setSavingReport(true);
        try {
            const body = {
                empleado_id: empId,
                categoria: reportCategoria,
                descripcion: reportDescripcion,
                autor: user ? `${user.name} ${user.surname}` : null,
                autor_rol: user?.role || null,
            };
            if (reportCategoria === 'suspension') {
                body.fecha_desde = reportFechaDesde;
                body.fecha_hasta = reportFechaHasta;
            }
            const res = await fetch('/api/employee-reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(data.error || 'Error al crear el informe'); return; }
            setEmployeeReports(prev => [data, ...prev]);
            setReportDescripcion('');
            setReportCategoria('incidente');
            setReportFechaDesde('');
            setReportFechaHasta('');
            setShowReportForm(false);
        } finally {
            setSavingReport(false);
        }
    };

    const handleDeleteReport = async (id) => {
        if (!confirm('¿Eliminar este informe? Esta acción no se puede deshacer.')) return;
        const res = await fetch(`/api/employee-reports/${id}`, { method: 'DELETE' });
        if (!res.ok) { notify.error('No se pudo eliminar el informe.'); return; }
        setEmployeeReports(prev => prev.filter(r => r.id !== id));
    };

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
                    setEmployees(prev => prev.map(emp => emp.id === editingEmployee.id ? updatedEmp : emp));
                    addAudit('EDITAR', 'Empleado', editingEmployee.id, `Editado legajo: ${empData.legajo}`);
                } else {
                    const error = await res.json();
                    notify.error(error.error || 'Error al actualizar el empleado');
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
                    setEmployees(prev => [...prev, newEmp]);
                    addAudit('CREAR', 'Empleado', newEmp.id, `Creado legajo: ${empData.legajo}`);
                }
            }
        } catch (e) { console.error(e); }

        setShowForm(false);
        setEditingEmployee(null);
    };

    const handleBaja = async (emp) => {
        const { default: Swal } = await import('sweetalert2');
        const todayStr = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
        const isDark = document.documentElement.dataset.theme === 'dark';

        const bg = isDark ? '#1a2b3c' : '#ffffff';
        const textColor = isDark ? '#e2e8f0' : '#1a1a1a';
        const labelColor = isDark ? '#94a3b8' : '#6b7280';
        const inputStyle = `margin:0;width:100%;box-sizing:border-box;padding:0.55rem 0.75rem;border-radius:7px;border:1px solid ${isDark ? '#2d4a63' : '#d1d5db'};background:${isDark ? '#0f1f2e' : '#f9fafb'};color:${textColor};font-size:0.9rem;`;

        const { value: formValues } = await Swal.fire({
            title: `Dar de Baja — ${emp.apellido}, ${emp.nombre}`,
            background: bg,
            color: textColor,
            html: `
                <div style="text-align:left;display:flex;flex-direction:column;gap:0.85rem;margin-top:0.5rem">
                    <div>
                        <label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:0.3rem;color:${labelColor};text-transform:uppercase;letter-spacing:0.04em">Fecha de baja</label>
                        <input id="swal-fecha" type="date" value="${todayStr}" style="${inputStyle}">
                    </div>
                    <div>
                        <label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:0.3rem;color:${labelColor};text-transform:uppercase;letter-spacing:0.04em">Motivo</label>
                        <select id="swal-motivo" style="${inputStyle}cursor:pointer;">
                            <option value="Renuncia">Renuncia</option>
                            <option value="Mutuo acuerdo">Mutuo acuerdo</option>
                            <option value="Bajo desempeño">Bajo desempeño</option>
                            <option value="Abandono de puesto">Abandono de puesto</option>
                            <option value="Otro">Otro</option>
                        </select>
                    </div>
                    <div id="swal-otro-wrap" style="display:none">
                        <label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:0.3rem;color:${labelColor};text-transform:uppercase;letter-spacing:0.04em">Especificar motivo</label>
                        <input id="swal-otro" type="text" style="${inputStyle}" placeholder="Describí el motivo...">
                    </div>
                    <div>
                        <label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:0.3rem;color:${labelColor};text-transform:uppercase;letter-spacing:0.04em">Observaciones</label>
                        <textarea id="swal-obs" style="${inputStyle}min-height:90px;resize:vertical;font-family:inherit;" placeholder="Detallá lo que pasó, contexto, etc. (opcional)"></textarea>
                    </div>
                </div>
            `,
            didOpen: () => {
                document.getElementById('swal-motivo').addEventListener('change', (e) => {
                    document.getElementById('swal-otro-wrap').style.display = e.target.value === 'Otro' ? 'block' : 'none';
                });
            },
            preConfirm: () => {
                const fecha = document.getElementById('swal-fecha').value;
                const sel = document.getElementById('swal-motivo').value;
                const otro = document.getElementById('swal-otro').value.trim();
                if (!fecha) { Swal.showValidationMessage('La fecha es requerida'); return false; }
                if (sel === 'Otro' && !otro) { Swal.showValidationMessage('Especificá el motivo'); return false; }
                const obs = document.getElementById('swal-obs').value.trim();
                return { fecha, motivo: sel === 'Otro' ? otro : sel, observaciones: obs || null };
            },
            confirmButtonText: 'Confirmar Baja',
            confirmButtonColor: '#ef4444',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            width: 480,
        });

        if (!formValues) return;

        try {
            const res = await fetch(`/api/employees/${emp.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    estado_empleado: 'Baja',
                    fecha_baja: formValues.fecha,
                    motivo_baja: formValues.motivo,
                    observaciones_baja: formValues.observaciones,
                }),
            });
            if (res.ok) {
                const updated = await res.json();
                setEmployees(prev => prev.map(e => e.id === emp.id ? updated : e));
                addAudit('BAJA', 'Empleado', emp.id, `Motivo: ${formValues.motivo}`);
            } else {
                const err = await res.json();
                await Swal.fire({ title: 'Error', text: err.error || 'No se pudo dar de baja', icon: 'error', confirmButtonColor: '#ef4444' });
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleReactivar = async (emp) => {
        const { default: Swal } = await import('sweetalert2');
        const { isConfirmed } = await Swal.fire({
            title: '¿Reactivar legajo?',
            text: `${emp.apellido}, ${emp.nombre} volverá a estar Activo.`,
            icon: 'question',
            confirmButtonText: 'Reactivar',
            confirmButtonColor: '#1f3a4a',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
        });
        if (!isConfirmed) return;
        try {
            const res = await fetch(`/api/employees/${emp.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado_empleado: 'Activo', fecha_baja: null, motivo_baja: null }),
            });
            if (res.ok) {
                const updated = await res.json();
                setEmployees(prev => prev.map(e => e.id === emp.id ? updated : e));
                addAudit('REACTIVAR', 'Empleado', emp.id, 'Legajo reactivado');
            }
        } catch (e) { console.error(e); }
    };

    const handleDeleteEmployee = async (emp) => {
        const { default: Swal } = await import('sweetalert2');
        const { isConfirmed } = await Swal.fire({
            title: '¿Eliminar legajo?',
            html: `<strong>${emp.apellido}, ${emp.nombre}</strong><br><span style="font-size:0.9rem;opacity:0.7">Esta acción no se puede deshacer. Se eliminarán todos los datos del legajo.</span>`,
            icon: 'warning',
            confirmButtonText: 'Eliminar permanentemente',
            confirmButtonColor: '#ef4444',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
        });
        if (!isConfirmed) return;
        try {
            const res = await fetch(`/api/employees/${emp.id}`, { method: 'DELETE' });
            if (res.ok) {
                setEmployees(prev => prev.filter(e => e.id !== emp.id));
                setSubView('nomina');
                setSelectedEmployeeId(null);
            } else {
                await Swal.fire({ title: 'Error', text: 'No se pudo eliminar el legajo', icon: 'error', confirmButtonColor: '#ef4444' });
            }
        } catch (e) { console.error(e); }
    };

    const handleUploadDoc = (empId, typeId) => {
        const type = documentTypes.find(t => t.id === typeId);
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,application/pdf';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            let expiration = null;
            if (type?.requiere_vencimiento) {
                expiration = prompt(`Fecha de vencimiento para ${type.nombre} (YYYY-MM-DD):`);
                if (!expiration) return;
            }

            const user = getSessionUser();
            const fd = new FormData();
            fd.append('empleado_id', String(empId));
            fd.append('documento_tipo_id', String(typeId));
            if (expiration) fd.append('fecha_vencimiento', expiration);
            if (user) fd.append('cargado_por', `${user.name} ${user.surname}`);
            fd.append('file', file);

            try {
                const res = await fetch('/api/employee-documents', { method: 'POST', body: fd });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) { alert(data.error || 'Error al subir el documento'); return; }
                setEmployeeDocuments(prev => [...prev, data]);
            } catch (err) {
                alert('Error al subir el documento');
            }
        };
        input.click();
    };

    const handlePreviewDoc = (doc) => {
        if (doc.url) {
            window.open(doc.url, '_blank');
        } else {
            alert('No se pudo abrir el documento.');
        }
    };

    const handleDeleteDoc = async (id) => {
        if (confirm('¿Eliminar documento?')) {
            try {
                const res = await fetch(`/api/employee-documents/${id}`, { method: 'DELETE' });
                if (!res.ok) { alert('No se pudo eliminar el documento'); return; }
                setEmployeeDocuments(employeeDocuments.filter(d => d.id !== id));
            } catch (err) {
                alert('No se pudo eliminar el documento');
                return;
            }
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

    // Antiguedad legible a partir de la fecha de ingreso (ej: "1 año 4 meses").
    const getAntiguedad = (fechaIngreso) => {
        if (!fechaIngreso) return null;
        const inicio = parseAppDate(fechaIngreso);
        const hoy = new Date();
        if (Number.isNaN(inicio.getTime()) || inicio > hoy) return null;
        let meses = (hoy.getFullYear() - inicio.getFullYear()) * 12 + (hoy.getMonth() - inicio.getMonth());
        if (hoy.getDate() < inicio.getDate()) meses -= 1;
        if (meses < 1) return 'Menos de 1 mes';
        const años = Math.floor(meses / 12);
        const m = meses % 12;
        const partes = [];
        if (años > 0) partes.push(`${años} ${años === 1 ? 'año' : 'años'}`);
        if (m > 0) partes.push(`${m} ${m === 1 ? 'mes' : 'meses'}`);
        return partes.join(' ');
    };

    const getEmployeeInitials = (emp) => {
        const a = emp.apellido?.trim()?.[0] || '';
        const n = emp.nombre?.trim()?.[0] || '';
        return `${a}${n}`.toUpperCase() || '?';
    };

    const [trialSort, setTrialSort] = useState({ field: 'vencimiento', dir: 'asc' });

    const trialPeriodEmployees = useMemo(() => {
        const today = new Date();
        const list = employees.filter(emp => {
            if (emp.estado_empleado !== 'Activo' || !emp.fecha_ingreso) return false;
            const end = getTrialPeriodEndDate(emp);
            return end && end >= today;
        });

        list.sort((a, b) => {
            let aVal, bVal;
            if (trialSort.field === 'nombre') {
                aVal = `${a.apellido} ${a.nombre}`.toLowerCase();
                bVal = `${b.apellido} ${b.nombre}`.toLowerCase();
            } else if (trialSort.field === 'fecha_ingreso') {
                aVal = parseAppDate(a.fecha_ingreso);
                bVal = parseAppDate(b.fecha_ingreso);
            } else {
                aVal = getTrialPeriodEndDate(a) || new Date(0);
                bVal = getTrialPeriodEndDate(b) || new Date(0);
            }
            if (aVal < bVal) return trialSort.dir === 'asc' ? -1 : 1;
            if (aVal > bVal) return trialSort.dir === 'asc' ? 1 : -1;
            return 0;
        });

        return list;
    }, [employees, trialSort]);

    const exportTrialPeriodsToExcel = async () => {
        const XLSX = await import('xlsx');
        const data = trialPeriodEmployees.map(emp => {
            const trialEndDate = getTrialPeriodEndDate(emp);
            const status = getTrialPeriodStatus(trialEndDate);

            const fmtDate = (d) => {
                if (!d) return '';
                const dt = typeof d === 'string' ? parseAppDate(d) : d;
                return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
            };

            return {
                Legajo: emp.legajo,
                'Nombre Completo': `${emp.apellido}, ${emp.nombre}`,
                DNI: emp.dni,
                CUIL: emp.cuil,
                Servicio: getServiceName(emp),
                'Fecha Ingreso': fmtDate(emp.fecha_ingreso),
                'Vencimiento': trialEndDate ? fmtDate(trialEndDate) : '',
                'Dias Restantes': status.diffDays,
                Estado: status.label
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Vencimientos');
        downloadWorkbook(XLSX, workbook, `Reporte_RRHH_Prueba_${getArgentinaDateStamp()}.xlsx`);
    };

    const filteredEmployees = useMemo(() => {
        const list = employees.filter(emp => {
            const matches = matchesSearch(searchTerm, [emp.nombre, emp.apellido, emp.dni, emp.legajo, emp.cuil]);
            const matchesStatus = filters.status === 'Todos' || emp.estado_empleado === filters.status;
            return matches && matchesStatus;
        });
        list.sort((a, b) => {
            let aVal, bVal;
            if (nominaSort.field === 'apellido') {
                aVal = (a.apellido + a.nombre).toLowerCase();
                bVal = (b.apellido + b.nombre).toLowerCase();
            } else if (nominaSort.field === 'fecha_ingreso') {
                aVal = a.fecha_ingreso || '';
                bVal = b.fecha_ingreso || '';
            } else if (nominaSort.field === 'cuil') {
                aVal = a.cuil || a.dni || '';
                bVal = b.cuil || b.dni || '';
            }
            if (aVal < bVal) return nominaSort.dir === 'asc' ? -1 : 1;
            if (aVal > bVal) return nominaSort.dir === 'asc' ? 1 : -1;
            return 0;
        });
        return list;
    }, [employees, searchTerm, filters, nominaSort]);

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
                                {[
                                    { label: 'Empleado', field: 'nombre' },
                                    { label: 'Legajo', field: null },
                                    { label: 'Servicio', field: null },
                                    { label: 'Fecha Ingreso', field: 'fecha_ingreso' },
                                    { label: 'Vencimiento', field: 'vencimiento' },
                                    { label: 'Estado', field: null },
                                    { label: 'Acción', field: null },
                                ].map(({ label, field }) => (
                                    <th
                                        key={label}
                                        onClick={field ? () => setTrialSort(s => ({ field, dir: s.field === field && s.dir === 'asc' ? 'desc' : 'asc' })) : undefined}
                                        style={field ? { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' } : undefined}
                                    >
                                        {label}
                                        {field && (
                                            <span style={{ marginLeft: '0.3rem', opacity: trialSort.field === field ? 1 : 0.25 }}>
                                                {trialSort.field === field && trialSort.dir === 'desc' ? '↓' : '↑'}
                                            </span>
                                        )}
                                    </th>
                                ))}
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
        const rows = buildNominaRows();
        if (!rows.length) { notify.error('No hay empleados para exportar.'); return; }
        const XLSX = await import('xlsx');
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Personal');
        downloadWorkbook(XLSX, wb, `Reporte_Personal_${getArgentinaDateStamp()}.xlsx`);
    };

    const exportNominaPdf = async () => {
        const rows = buildNominaRows();
        if (!rows.length) { notify.error('No hay empleados para exportar.'); return; }
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
                    <button className="btn btn-primary" onClick={exportNominaExcel}>📤 Exportar Nómina</button>
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
                {!readOnly && <button className="btn btn-secondary" onClick={() => setSubView('admin')}>⚙ Gestión Docs</button>}
            </div>

            <div className="card" style={{ padding: 0 }}>
                <div className="table-container">
                    <table className="mobile-cards-table">
                        <thead>
                            <tr>
                                {[
                                    { label: 'Nombre Completo', field: 'apellido' },
                                    { label: 'DNI / CUIL', field: 'cuil' },
                                    { label: 'Celular', field: null },
                                    { label: 'Ingreso', field: 'fecha_ingreso' },
                                    { label: 'Acción', field: null },
                                ].map(({ label, field }) => (
                                    <th
                                        key={label}
                                        onClick={field ? () => setNominaSort(s => ({ field, dir: s.field === field && s.dir === 'asc' ? 'desc' : 'asc' })) : undefined}
                                        style={field ? { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' } : undefined}
                                    >
                                        {label}
                                        {field && (
                                            <span style={{ marginLeft: '0.35rem', fontSize: '0.7rem', color: nominaSort.field === field ? 'var(--color-primary)' : 'var(--text-muted)' }}>
                                                {nominaSort.field === field ? (nominaSort.dir === 'asc' ? '▲' : '▼') : '⇅'}
                                            </span>
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEmployees.slice(0, visibleCount).map(emp => {
                                const missingFields = [];
                                if (!emp.legajo) missingFields.push('Legajo');
                                if (!emp.cuil) missingFields.push('CUIT');
                                if (!emp.celular) missingFields.push('Teléfono');
                                if (!emp.fecha_ingreso) missingFields.push('Fecha ingreso');
                                if (!emp.direccion) missingFields.push('Dirección');
                                if (!emp.mail) missingFields.push('Mail');
                                const isIncomplete = missingFields.length > 0;

                                return (
                                    <tr key={emp.id} className="clickable-row">
                                        <td data-label="Nombre Completo" onClick={() => { setSelectedEmployeeId(emp.id); setSubView('perfil'); setPerfilTab('documentos'); }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 700 }}>{emp.apellido}, {emp.nombre}</span>
                                                {isIncomplete && (
                                                    <span
                                                        title={`Faltan: ${missingFields.join(', ')}`}
                                                        style={{
                                                            background: '#f59e0b',
                                                            color: 'white',
                                                            fontSize: '0.65rem',
                                                            fontWeight: 700,
                                                            padding: '0.15rem 0.5rem',
                                                            borderRadius: '4px',
                                                            letterSpacing: '0.03em',
                                                            textTransform: 'uppercase',
                                                            cursor: 'help',
                                                        }}
                                                    >
                                                        Incompleto
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Legajo: {emp.legajo || '---'}</div>
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
                                                {!readOnly && <button className="btn btn-secondary" style={{ padding: '0.4rem' }} onClick={(e) => { e.stopPropagation(); setEditingEmployee(emp); setShowForm(true); }}>✏</button>}
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
        const isActivo = emp.estado_empleado === 'Activo';
        const estadoColor = isActivo ? '#10B981' : emp.estado_empleado === 'Baja' ? '#EF4444' : '#F59E0B';
        const antiguedad = getAntiguedad(emp.fecha_ingreso);

        return (
            <div className="profile-view">
                <div style={{ marginBottom: '1rem' }}>
                    <button className="btn btn-secondary" onClick={() => setSubView('nomina')}>← Volver</button>
                </div>

                {/* Header del legajo: avatar + nombre + chips */}
                <div className="card legajo-header">
                    <div className="legajo-header-main">
                        <div className="legajo-avatar">{getEmployeeInitials(emp)}</div>
                        <div style={{ minWidth: 0 }}>
                            <h1 className="legajo-name">{emp.apellido}, {emp.nombre}</h1>
                            <div className="legajo-chips">
                                <span className="legajo-chip">Legajo #{emp.legajo || '---'}</span>
                                <span className="legajo-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: estadoColor }} />
                                    {emp.estado_empleado}
                                </span>
                                {emp.fecha_ingreso && <span className="legajo-chip">Ingreso {formatArgentinaDate(emp.fecha_ingreso)}</span>}
                                {antiguedad && <span className="legajo-chip">Antigüedad {antiguedad}</span>}
                            </div>
                        </div>
                    </div>
                    {!readOnly && (
                        <div className="legajo-header-actions">
                            <button className="btn btn-secondary" onClick={() => { setEditingEmployee(emp); setShowForm(true); }}>Editar Perfil</button>
                            {isActivo
                                ? <button className="btn btn-secondary" style={{ color: 'var(--error)' }} onClick={() => handleBaja(emp)}>Dar de Baja</button>
                                : <button className="btn btn-secondary" style={{ color: '#16a34a' }} onClick={() => handleReactivar(emp)}>Reactivar</button>
                            }
                            <button
                                className="btn btn-secondary"
                                style={{ color: 'var(--error)', borderColor: 'var(--error)' }}
                                onClick={() => handleDeleteEmployee(emp)}
                            >
                                Eliminar Legajo
                            </button>
                        </div>
                    )}
                </div>

                {emp.estado_empleado === 'Baja' && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha de Baja</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#7f1d1d', marginTop: '0.2rem' }}>{emp.fecha_baja ? formatArgentinaDate(emp.fecha_baja) : '---'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Motivo</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#7f1d1d', marginTop: '0.2rem' }}>{emp.motivo_baja || '---'}</div>
                        </div>
                        {emp.observaciones_baja && (
                            <div style={{ flexBasis: '100%' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Observaciones</div>
                                <div style={{ fontSize: '0.9rem', color: '#7f1d1d', marginTop: '0.2rem', lineHeight: 1.5 }}>{emp.observaciones_baja}</div>
                            </div>
                        )}
                    </div>
                )}

                {/* Datos personales */}
                <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
                        Datos del empleado
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                        {[
                            { label: 'CUIL', value: emp.cuil },
                            { label: 'Celular', value: emp.celular },
                            { label: 'Mail', value: emp.mail, wide: true },
                            { label: 'Fecha de Ingreso', value: emp.fecha_ingreso ? formatArgentinaDate(emp.fecha_ingreso) : null },
                            { label: 'Servicio', value: emp.service_name || services.find(s => s.id === Number(emp.servicio_id))?.name || null },
                        ].map(({ label, value, wide }) => (
                            <div key={label} style={{ minWidth: 0, ...(wide ? { gridColumn: 'span 2' } : {}) }}>
                                <div style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>
                                    {label}
                                </div>
                                <div
                                    title={value || ''}
                                    style={{
                                        fontSize: '0.92rem',
                                        color: value ? 'var(--text-main)' : 'var(--text-muted)',
                                        fontStyle: value ? 'normal' : 'italic',
                                        overflowWrap: 'anywhere',
                                        wordBreak: 'break-word',
                                    }}
                                >
                                    {value || 'Sin datos'}
                                </div>
                            </div>
                        ))}
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
                                                            !readOnly && <button className="btn btn-primary" style={{ padding: '0.3rem 0.6rem' }} onClick={() => handleUploadDoc(emp.id, dt.id)}>Subir</button>
                                                        ) : (
                                                            <>
                                                                <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem' }} onClick={() => handlePreviewDoc(doc)}>Ver</button>
                                                                {!readOnly && <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', color: 'var(--error)' }} onClick={() => handleDeleteDoc(doc.id)}>✕</button>}
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem' }}>
                            <h3 style={{ margin: 0 }}>Informes</h3>
                            {!readOnly && !showReportForm && (
                                <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }} onClick={() => setShowReportForm(true)}>+ Nuevo informe</button>
                            )}
                        </div>

                        {showReportForm && (
                            <div style={{ background: 'var(--color-muted-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.85rem', marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Categoría</label>
                                <select value={reportCategoria} onChange={e => setReportCategoria(e.target.value)} style={{ width: '100%', marginBottom: '0.65rem' }}>
                                    {REPORT_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                </select>
                                {reportCategoria === 'suspension' && (
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
                                        <div style={{ flex: '1 1 140px', minWidth: '140px' }}>
                                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Desde</label>
                                            <input type="date" value={reportFechaDesde} onChange={e => setReportFechaDesde(e.target.value)} style={{ width: '100%' }} />
                                        </div>
                                        <div style={{ flex: '1 1 140px', minWidth: '140px' }}>
                                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Hasta</label>
                                            <input type="date" value={reportFechaHasta} onChange={e => setReportFechaHasta(e.target.value)} style={{ width: '100%' }} />
                                        </div>
                                        {reportFechaDesde && reportFechaHasta && reportFechaHasta >= reportFechaDesde && (
                                            <div style={{ flex: '1 1 100%', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                Duración: <strong>{suspensionDays(reportFechaDesde, reportFechaHasta)} día{suspensionDays(reportFechaDesde, reportFechaHasta) !== 1 ? 's' : ''}</strong>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{reportCategoria === 'suspension' ? 'Motivo' : 'Descripción'}</label>
                                <textarea value={reportDescripcion} onChange={e => setReportDescripcion(e.target.value)} rows={3} placeholder={reportCategoria === 'suspension' ? 'Motivo de la suspensión...' : 'Detalle del informe...'} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.65rem' }}>
                                    <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }} onClick={() => { setShowReportForm(false); setReportDescripcion(''); setReportCategoria('incidente'); setReportFechaDesde(''); setReportFechaHasta(''); }}>Cancelar</button>
                                    <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }} disabled={savingReport || !reportDescripcion.trim() || (reportCategoria === 'suspension' && (!reportFechaDesde || !reportFechaHasta))} onClick={() => handleCreateReport(emp.id)}>
                                        {savingReport ? 'Guardando...' : 'Guardar informe'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: '0.5rem', maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            {employeeReports.length === 0 ? (
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, padding: '0.85rem', textAlign: 'center' }}>
                                    Sin informes para este operario.
                                </p>
                            ) : employeeReports.map(rep => {
                                const cat = REPORT_CATEGORY_BY_KEY[rep.categoria] || REPORT_CATEGORIES[0];
                                return (
                                    <div key={rep.id} style={{ padding: '0.7rem 0.85rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
                                            <span style={{ display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700, background: cat.bg, color: cat.fg, border: `1px solid ${cat.border}` }}>
                                                {cat.label}
                                            </span>
                                            {isAdmin && (
                                                <button onClick={() => handleDeleteReport(rep.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: '0.95rem', lineHeight: 1, padding: '0.1rem 0.25rem' }} title="Eliminar informe">✕</button>
                                            )}
                                        </div>
                                        {rep.categoria === 'suspension' && rep.fecha_desde && rep.fecha_hasta && (
                                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: cat.fg, marginBottom: '0.35rem' }}>
                                                {rep.fecha_desde === rep.fecha_hasta
                                                    ? `Suspensión el ${fmtYMD(rep.fecha_desde)} (1 día)`
                                                    : `Suspensión del ${fmtYMD(rep.fecha_desde)} al ${fmtYMD(rep.fecha_hasta)} (${suspensionDays(rep.fecha_desde, rep.fecha_hasta)} días)`}
                                            </div>
                                        )}
                                        <div style={{ fontSize: '0.88rem', whiteSpace: 'pre-wrap', marginBottom: '0.35rem' }}>{rep.descripcion}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            {rep.autor ? `${rep.autor} · ` : ''}{formatArgentinaDateTime(rep.created_at)}
                                        </div>
                                    </div>
                                );
                            })}
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
                            {!readOnly && (
                                <button className="btn btn-primary" style={{ padding: '0.4rem 0.9rem', fontSize: '0.88rem' }} onClick={() => setShowLicenseForm(true)}>
                                    + Nueva Licencia
                                </button>
                            )}
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
                                                    {(() => {
                                                        // El status en la DB puede estar desactualizado: una licencia
                                                        // sigue como 'activa' aunque ya haya pasado su end_date.
                                                        // Derivamos el estado real comparando con hoy.
                                                        const todayStr = getArgentinaDateStamp();
                                                        const endStr = (lic.end_date || '').slice(0, 10);
                                                        const isCancelled = lic.status === 'cancelada';
                                                        const isReallyActive = !isCancelled && lic.status === 'activa' && endStr >= todayStr;
                                                        const label = isCancelled ? 'Cancelada' : isReallyActive ? 'Activa' : 'Finalizada';
                                                        const cls = isReallyActive ? 'badge-success' : 'badge-secondary';
                                                        return <span className={`badge ${cls}`}>{label}</span>;
                                                    })()}
                                                </td>
                                                <td data-label="Notas" style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                                                    {lic.notes || '---'}
                                                </td>
                                                <td className="mobile-hide-label">
                                                    {!readOnly && (
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
                                                    )}
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
                    <button className="btn btn-primary" onClick={() => notify.info("Función en desarrollo para base de datos")}>+ Agregar Tipo de Documento</button>
                </div>
            </div>
        </div>
    );

    const renderTabs = () => (
        <div className="hr-top-tabs" style={{ marginBottom: '2rem' }}>
            <button
                className={`btn ${sectionTab === 'calendario' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSectionTab('calendario')}
            >
                📅 Calendario
            </button>
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
            {sectionTab === 'calendario' && <HRCalendar />}
            {sectionTab === 'informes' && <HRReportsView />}
            {sectionTab === 'recibos' && <RecibosView />}
            {sectionTab === 'legales' && <LegalCasesView readOnly={readOnly} />}
            {sectionTab === 'personal' && subView === 'nomina' && renderNomina()}
            {sectionTab === 'personal' && subView === 'perfil' && renderPerfil()}
            {sectionTab === 'personal' && subView === 'admin' && renderAdmin()}
            {sectionTab === 'periodos' && renderTrialPeriods()}
            {sectionTab === 'licencias' && <LicensesGantt employees={employees} readOnly={readOnly} />}

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
                                    <label>DNI <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(se completa solo del CUIL)</span></label>
                                    <input name="dni" defaultValue={editingEmployee?.dni} placeholder="Se toma del CUIL" />
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
