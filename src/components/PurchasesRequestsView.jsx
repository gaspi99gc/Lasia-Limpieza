'use client';

import { useEffect, useMemo, useState } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { formatArgentinaDateTime, getArgentinaDateStamp, parseAppDate } from '@/lib/datetime';
import { getSessionUser } from '@/lib/session';
import { useCatalog } from '@/lib/CatalogContext';
import { notify } from '@/lib/toast';

const REQUEST_STATUS_OPTIONS = [
    { value: 'activos', label: 'Activos' },
    { value: 'todos', label: 'Todos' },
    { value: 'pendiente', label: 'Pendiente' },
    { value: 'revisado', label: 'Enviar al proveedor' },
    { value: 'cerrado', label: 'Cerrado' },
];

const EDITABLE_STATUS_OPTIONS = REQUEST_STATUS_OPTIONS.filter((option) => !['activos', 'todos'].includes(option.value));

function getStatusLabel(status) {
    if (status === 'en_gestion' || status === 'pedido_proveedor' || status === 'recibido') {
        return 'Enviar al proveedor';
    }

    return REQUEST_STATUS_OPTIONS.find((option) => option.value === status)?.label || 'Pendiente';
}

function getPrimaryActionConfig(status) {
    if (status === 'pendiente') {
        return {
            label: 'Enviar al proveedor',
            color: '#f59e0b',
            shadow: '0 4px 10px rgba(245, 158, 11, 0.28)',
        };
    }

    if (status === 'revisado') {
        return {
            label: 'Confirmar recepcion',
            color: '#16a34a',
            shadow: '0 4px 10px rgba(22, 163, 74, 0.28)',
        };
    }

    return null;
}

function getStatusBadgeClass(status) {
    if (status === 'cerrado') return 'badge-success';
    if (status === 'revisado' || status === 'en_gestion' || status === 'pedido_proveedor' || status === 'recibido') return 'badge-secondary';
    return 'badge-warning';
}

function escapeHtml(value) {
    return value
        ?.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;') || '';
}

function getStatusAlertConfig(status) {
    if (status === 'cerrado') {
        return {
            icon: 'success',
            title: 'Pedido cerrado',
            iconColor: '#16a34a',
            confirmButtonColor: '#16a34a',
        };
    }

    if (status === 'revisado' || status === 'en_gestion' || status === 'pedido_proveedor' || status === 'recibido') {
        return {
            icon: 'question',
            title: 'Pedido enviado al proveedor',
            iconColor: '#0ea5e9',
            confirmButtonColor: '#0ea5e9',
        };
    }

    return {
        icon: 'warning',
        title: 'Pedido pendiente',
        iconColor: '#f59e0b',
        confirmButtonColor: '#f59e0b',
    };
}

function buildRequestsExportRows(requests) {
    return requests.flatMap((request) => {
        const baseRow = {
            'Pedido ID': request.id,
            Estado: getStatusLabel(request.status),
            Proveedor: request.provider_name || '',
            'Fecha y hora': formatArgentinaDateTime(request.created_at),
            Supervisor: `${request.supervisor_surname}, ${request.supervisor_name}`,
            DNI: request.supervisor_dni,
            Servicio: request.service_name,
            Notas: request.notas || '',
            'Completado por': request.completed_by || '',
            'Fecha cierre': request.completed_at ? formatArgentinaDateTime(request.completed_at) : '',
        };

        if (!Array.isArray(request.items) || request.items.length === 0) {
            return [{
                ...baseRow,
                Insumo: '',
                Cantidad: '',
                Unidad: '',
            }];
        }

        return request.items.map((item) => ({
            ...baseRow,
            Insumo: item.nombre,
            Cantidad: item.cantidad,
            Unidad: item.unidad || '',
        }));
    });
}

async function loadImageDataUrl(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                reject(new Error('No se pudo preparar el logo para PDF.'));
                return;
            }

            ctx.drawImage(image, 0, 0);
            resolve({
                dataUrl: canvas.toDataURL('image/png'),
                width: image.naturalWidth,
                height: image.naturalHeight,
            });
        };
        image.onerror = () => reject(new Error('No se pudo cargar el logo del PDF.'));
        image.src = src;
    });
}

async function exportRequestsPdf(requests, title, fileName) {
    if (!requests.length) {
        notify.error('No hay pedidos para exportar con los filtros actuales.');
        return;
    }

    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
    ]);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const rows = buildRequestsExportRows(requests);

    try {
        const logo = await loadImageDataUrl('/branding/logo-lasia-limpieza.png');
        const pageWidth = doc.internal.pageSize.getWidth();
        const targetWidth = 178;
        const targetHeight = Math.max(26, targetWidth * (logo.height / logo.width));
        const x = (pageWidth - targetWidth) / 2;
        const y = 16;
        doc.addImage(logo.dataUrl, 'PNG', x, y, targetWidth, targetHeight);
    } catch (logoError) {
        console.warn('No se pudo agregar el logo al PDF:', logoError);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(title, 40, 42);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Generado: ${formatArgentinaDateTime(new Date())}`, 40, 62);

    autoTable(doc, {
        startY: 82,
        head: [[
            'Pedido ID',
            'Estado',
            'Proveedor',
            'Fecha y hora',
            'Supervisor',
            'DNI',
            'Servicio',
            'Insumo',
            'Cantidad',
            'Unidad',
            'Notas'
        ]],
        body: rows.map((row) => ([
            row['Pedido ID'],
            row.Estado,
            row.Proveedor,
            row['Fecha y hora'],
            row.Supervisor,
            row.DNI,
            row.Servicio,
            row.Insumo,
            row.Cantidad,
            row.Unidad,
            row.Notas,
        ])),
        styles: {
            font: 'helvetica',
            fontSize: 8,
            cellPadding: 5,
            overflow: 'linebreak'
        },
        headStyles: {
            fillColor: [31, 58, 74],
            textColor: [255, 255, 255],
            fontStyle: 'bold'
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },
        margin: { left: 28, right: 28, bottom: 32 }
    });

    doc.save(`${fileName}_${getArgentinaDateStamp()}.pdf`);
}

function getCurrentArgentinaDate() {
    return getArgentinaDateStamp(new Date());
}

function shiftArgentinaDate(dateStamp, dayOffset) {
    const baseDate = parseAppDate(dateStamp);
    baseDate.setUTCDate(baseDate.getUTCDate() + dayOffset);
    return getArgentinaDateStamp(baseDate);
}

function getQuickDateRange(mode) {
    const today = getCurrentArgentinaDate();

    if (mode === 'today') {
        return { startDate: today, endDate: today };
    }

    if (mode === 'week') {
        return {
            startDate: shiftArgentinaDate(today, -6),
            endDate: today,
        };
    }

    return {
        startDate: shiftArgentinaDate(today, -29),
        endDate: today,
    };
}

export default function PurchasesRequestsView({
    title,
    description,
    defaultStatusFilter = 'activos',
    allowStatusEditing = true,
}) {
    const { services, supervisors, supplies } = useCatalog();
    const [currentUser, setCurrentUser] = useState(null);
    const [allRequests, setAllRequests] = useState([]);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const PAGE_SIZE = 50;
    const [editingRequest, setEditingRequest] = useState(null); // modal de edicion (pedidos activos)
    const [filters, setFilters] = useState({
        requestId: '',
        startDate: '',
        endDate: '',
        status: defaultStatusFilter,
        serviceId: '',
        supervisorId: '',
        onlyUrgent: false,
    });
    const [loading, setLoading] = useState(true);
    const [updatingRequestId, setUpdatingRequestId] = useState(null);
    const [error, setError] = useState('');

    const activeFilterCount = useMemo(() => {
        return Object.entries(filters).filter(([key, value]) => {
            if (!value) return false;
            if (key === 'status' && value === defaultStatusFilter) return false;
            return true;
        }).length;
    }, [filters, defaultStatusFilter]);

    useEffect(() => {
        setFilters((current) => ({ ...current, status: defaultStatusFilter }));
    }, [defaultStatusFilter]);

    useEffect(() => {
        const storedUser = getSessionUser();
        if (storedUser) {
            setCurrentUser(storedUser);
        }
    }, []);

    useEffect(() => {
        async function loadRequests() {
            try {
                setLoading(true);
                setError('');
                const query = new URLSearchParams();
                // Status: respeta filtro del usuario, sino el default de la pantalla.
                const effectiveStatus = filters.status || defaultStatusFilter;
                if (effectiveStatus && effectiveStatus !== 'todos') {
                    query.set('status', effectiveStatus);
                }
                if (filters.requestId) query.set('request_id', filters.requestId);
                if (filters.serviceId) query.set('service_id', filters.serviceId);
                if (filters.supervisorId) query.set('supervisor_id', filters.supervisorId);
                if (filters.startDate) query.set('start_date', filters.startDate);
                if (filters.endDate) query.set('end_date', filters.endDate);
                if (filters.onlyUrgent) query.set('urgency', 'solo_urgentes');
                query.set('page', String(page));
                query.set('limit', String(PAGE_SIZE));
                query.set('include_meta', 'true');
                const response = await fetch(`/api/supply-requests?${query.toString()}`);
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los pedidos.');
                const list = Array.isArray(data) ? data : (Array.isArray(data.requests) ? data.requests : []);
                setAllRequests(list);
                setTotalCount(data.totalCount ?? list.length);
                setTotalPages(data.totalPages ?? 1);
            } catch (loadError) {
                setError(loadError.message || 'No se pudieron cargar los pedidos.');
            } finally {
                setLoading(false);
            }
        }
        loadRequests();
    }, [defaultStatusFilter, page, filters.requestId, filters.serviceId, filters.supervisorId, filters.startDate, filters.endDate, filters.onlyUrgent, filters.status]);

    // El backend ya devuelve los pedidos filtrados y paginados.
    const requests = allRequests;

    const updateFilter = (field, value) => {
        setFilters((current) => ({ ...current, [field]: value }));
        setPage(1);
    };

    const clearFilters = () => {
        setFilters({
            requestId: '',
            startDate: '',
            endDate: '',
            status: defaultStatusFilter,
            serviceId: '',
            onlyUrgent: false,
            supervisorId: '',
        });
        setPage(1);
    };

    const applyQuickDateRange = (mode) => {
        const range = getQuickDateRange(mode);
        setFilters((current) => ({
            ...current,
            startDate: range.startDate,
            endDate: range.endDate,
        }));
        setPage(1);
    };

    const exportRequests = async (exportedRequests, filePrefix) => {
        if (!exportedRequests.length) {
            notify.error('No hay pedidos para exportar con los filtros actuales.');
            return;
        }

        const XLSX = await import('xlsx');
        const rows = buildRequestsExportRows(exportedRequests);
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Pedidos');
        XLSX.writeFile(workbook, `${filePrefix}_${getArgentinaDateStamp()}.xlsx`);
    };

    const getItemsSummary = (request) => {
        const itemCount = Array.isArray(request.items) ? request.items.length : 0;
        if (itemCount === 0) return 'Sin insumos';
        return `${itemCount} insumo(s) cargado(s)`;
    };

    const updateRequestRecord = async (requestId, payload) => {
        const response = await fetch('/api/supply-requests', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ request_id: requestId, ...payload })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || 'No se pudo actualizar el pedido.');
        }

        return data;
    };

    const handleStatusChange = async (request, nextStatus) => {
        try {
            setUpdatingRequestId(request.id);
            setError('');

            const updated = await updateRequestRecord(request.id, {
                status: nextStatus,
                provider_id: request.provider_id || null,
                completed_by: nextStatus === 'cerrado' ? (currentUser?.dni || currentUser?.name || 'compras') : null,
            });

            setAllRequests((currentRequests) => currentRequests.map((currentRequest) => (
                currentRequest.id === request.id
                    ? {
                        ...currentRequest,
                        status: updated.status,
                        completed_by: updated.completed_by,
                        completed_at: updated.completed_at,
                    }
                    : currentRequest
            )));
        } catch (updateError) {
            setError(updateError.message || 'No se pudo actualizar el estado del pedido.');
        } finally {
            setUpdatingRequestId(null);
        }
    };

    const handlePrimaryStatusAction = async (request) => {
        if (request.status === 'pendiente') {
            await handleStatusChange(request, 'revisado');
            return;
        }

        if (request.status === 'revisado') {
            await handleStatusChange(request, 'cerrado');
        }
    };

    const handleShowRequestDetail = async (request) => {
        // En pedidos activos: abrimos el modal de edicion (React, permite cambiar items).
        if (request.status !== 'cerrado') {
            setEditingRequest(request);
            return;
        }
        // En pedidos cerrados: solo lectura via SweetAlert.
        const { default: Swal } = await import('sweetalert2');
        const summaryItems = Array.isArray(request.items)
            ? request.items.map((item, idx) => {
                const base = `${escapeHtml(item.nombre)}: ${escapeHtml(item.cantidad)}`;
                if (!item.agregado) return base;

                let ficha = '';
                let badge;
                if (item.marcado_at) {
                    const cuando = formatArgentinaDateTime(item.marcado_at);
                    const quien = item.marcado_por ? ` por ${escapeHtml(item.marcado_por)}` : '';
                    const fichaId = `ficha-agregado-${idx}`;
                    badge = `<span onclick="var f=document.getElementById('${fichaId}'); if(f) f.style.display = f.style.display==='none' ? 'block' : 'none';" style="font-size:0.68rem; font-weight:700; color:#047857; border:1px solid #A7F3D0; background:#ECFDF5; border-radius:999px; padding:0.05rem 0.45rem; margin-left:0.3rem; cursor:pointer; user-select:none;" title="Ver detalle">AGREGADO</span>`;
                    ficha = `<div id="${fichaId}" style="display:none; font-size:0.74rem; color:#B45309; margin-top:0.1rem;">Agregado el ${escapeHtml(cuando)}${quien}</div>`;
                } else {
                    badge = `<span style="font-size:0.68rem; font-weight:700; color:#047857; border:1px solid #A7F3D0; background:#ECFDF5; border-radius:999px; padding:0.05rem 0.45rem; margin-left:0.3rem;">AGREGADO</span>`;
                }
                return `${base} ${badge}${ficha}`;
            })
            : [];
        const statusLabel = getStatusLabel(request.status);
        const alertConfig = getStatusAlertConfig(request.status);

        await Swal.fire({
            title: alertConfig.title,
            icon: alertConfig.icon,
            iconColor: alertConfig.iconColor,
            html: `
                <div style="text-align:left; display:grid; gap:0.45rem; font-size:0.95rem;">
                    <div><strong>Pedido:</strong> #${escapeHtml(request.id)}</div>
                    <div><strong>Estado:</strong> ${escapeHtml(statusLabel)}</div>
                    <div><strong>Servicio:</strong> ${escapeHtml(request.service_name || 'Sin servicio')}</div>
                    <div><strong>Insumos:</strong></div>
                    <ul style="margin:0; padding-left:1.15rem;">
                        ${summaryItems.length > 0
                ? summaryItems.map((line) => `<li>${line}</li>`).join('')
                : '<li>Sin insumos</li>'}
                    </ul>
                    <div><strong>Notas:</strong> ${escapeHtml(request.notas || 'Sin notas')}</div>
                </div>
            `,
            confirmButtonText: 'Entendido',
            confirmButtonColor: alertConfig.confirmButtonColor,
        });
    };

    return (
        <div className="purchases-panel-wide">
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="purchases-header">
                    <div className="purchases-header-text">
                        <h1>{title}</h1>
                        <p>{description}</p>
                    </div>
                    <div className="purchases-header-actions">
                        <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                            Limpiar filtros
                        </button>
                        <button type="button" className="btn btn-primary" onClick={() => exportRequests(requests, defaultStatusFilter === 'cerrado' ? 'Pedidos_completos' : 'Pedidos_filtrados')}>
                            Excel
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => exportRequestsPdf(requests, title, defaultStatusFilter === 'cerrado' ? 'Pedidos_completos' : 'Pedidos_filtrados')}>
                            PDF
                        </button>
                    </div>
                </div>

                <div className="card purchases-filters-card">
                    <div className="page-header purchases-filters-header" style={{ marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                        <div>
                            <h3>Filtros</h3>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span className="badge badge-secondary">{activeFilterCount} filtro(s) activos</span>
                            <span className="badge badge-success">
                                {totalCount === 0
                                    ? 'Sin resultados'
                                    : `Mostrando ${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + requests.length} de ${totalCount}`}
                            </span>
                        </div>
                    </div>

                    <div className="purchases-date-range">
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Fecha de carga</label>
                            <div className="purchases-date-range-row">
                                <div className="purchases-date-range-inputs">
                                    <input type="date" value={filters.startDate} onChange={(e) => updateFilter('startDate', e.target.value)} />
                                    <input type="date" value={filters.endDate} onChange={(e) => updateFilter('endDate', e.target.value)} />
                                </div>
                                <div className="purchases-quick-filters">
                                    <button type="button" className="btn btn-secondary" onClick={() => applyQuickDateRange('today')}>Hoy</button>
                                    <button type="button" className="btn btn-secondary" onClick={() => applyQuickDateRange('week')}>Ultimos 7 dias</button>
                                    <button type="button" className="btn btn-secondary" onClick={() => applyQuickDateRange('month')}>Ultimos 30 dias</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="employee-form-grid purchases-filters-grid">
                        <div className="form-group">
                            <label>Pedido #</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                placeholder="Ej: 15"
                                value={filters.requestId}
                                onChange={(e) => updateFilter('requestId', e.target.value.replace(/\D/g, ''))}
                            />
                        </div>
                        <div className="form-group">
                            <label>Estado</label>
                            <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
                                {REQUEST_STATUS_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Servicio</label>
                            <SearchableSelect
                                options={services.map(s => ({ value: s.id, label: s.name }))}
                                value={filters.serviceId}
                                onChange={(val) => updateFilter('serviceId', val)}
                                placeholder="Todos los servicios"
                                searchPlaceholder="Buscar servicio..."
                            />
                        </div>
                        <div className="form-group">
                            <label>Supervisor</label>
                            <select value={filters.supervisorId} onChange={(e) => updateFilter('supervisorId', e.target.value)}>
                                <option value="">Todos los supervisores</option>
                                {supervisors.map((supervisor) => (
                                    <option key={supervisor.id} value={supervisor.id}>{supervisor.surname}, {supervisor.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.2rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontWeight: 500, margin: 0 }}>
                                <input
                                    type="checkbox"
                                    checked={filters.onlyUrgent}
                                    onChange={(e) => updateFilter('onlyUrgent', e.target.checked)}
                                    style={{ width: '18px', height: '18px', accentColor: 'var(--error)', cursor: 'pointer', flexShrink: 0 }}
                                />
                                Solo urgentes
                                {filters.onlyUrgent && <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>URGENTE</span>}
                            </label>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando pedidos...</div>
                ) : error ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--error)', fontWeight: 600 }}>{error}</div>
                ) : (
                    <div className="table-container purchases-table-wrap">
                        <table className="table mobile-cards-table">
                            <thead>
                                <tr>
                                    <th className="purchases-id-col">#</th>
                                    <th>Fecha</th>
                                    <th>Supervisor</th>
                                    <th>Servicio</th>
                                    <th>Insumos</th>
                                    <th>Estado</th>
                                    <th style={{ textAlign: 'right' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {requests.length > 0 ? requests.map((request) => (
                                    <tr key={request.id}>
                                        <td className="purchases-id-col" data-label="#">
                                            <strong style={{ fontSize: '0.9rem' }}>#{request.id}</strong>
                                            {request.urgent ? <span className="badge badge-warning" style={{ marginLeft: '0.4rem', fontSize: '0.68rem', padding: '0.2rem 0.5rem' }}>URGENTE</span> : null}
                                        </td>
                                        <td data-label="Fecha" style={{ whiteSpace: 'nowrap' }}>{formatArgentinaDateTime(request.created_at)}</td>
                                        <td data-label="Supervisor">
                                            <strong>{request.supervisor_surname}, {request.supervisor_name}</strong>
                                        </td>
                                        <td data-label="Servicio">{request.service_name}</td>
                                        <td data-label="Insumos">
                                            <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>{getItemsSummary(request)}</span>
                                            <div style={{ marginTop: '0.3rem' }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    onClick={() => handleShowRequestDetail(request)}
                                                    style={{ padding: '0.28rem 0.6rem', fontSize: '0.78rem' }}
                                                >
                                                    Ver detalle
                                                </button>
                                            </div>
                                        </td>
                                        <td data-label="Estado">
                                            {allowStatusEditing ? (
                                                <select
                                                    value={request.status}
                                                    disabled={updatingRequestId === request.id}
                                                    onChange={(e) => handleStatusChange(request, e.target.value)}
                                                    style={{ width: '100%', fontSize: '0.85rem', padding: '0.35rem 0.5rem' }}
                                                >
                                                    {EDITABLE_STATUS_OPTIONS.map((option) => (
                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span className={`badge ${getStatusBadgeClass(request.status)}`}>
                                                    {getStatusLabel(request.status)}
                                                </span>
                                            )}
                                            {request.completed_at ? (
                                                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                                                    {request.completed_by || 'Compras'} · {formatArgentinaDateTime(request.completed_at)}
                                                </div>
                                            ) : null}
                                        </td>
                                        <td className="purchases-actions-cell mobile-hide-label" data-label="Acciones">
                                            <div className="purchases-actions-group">
                                                {(() => {
                                                    const actionConfig = getPrimaryActionConfig(request.status);
                                                    return allowStatusEditing && actionConfig ? (
                                                        <button
                                                            type="button"
                                                            className="btn purchases-action-primary"
                                                            onClick={() => handlePrimaryStatusAction(request)}
                                                            disabled={updatingRequestId === request.id}
                                                            style={{
                                                                background: actionConfig.color,
                                                                color: '#fff',
                                                                boxShadow: actionConfig.shadow,
                                                            }}
                                                        >
                                                            {updatingRequestId === request.id ? 'Guardando...' : actionConfig.label}
                                                        </button>
                                                    ) : null;
                                                })()}
                                                <div className="purchases-secondary-row">
                                                    <button type="button" className="btn btn-secondary purchases-action-secondary" onClick={() => exportRequests([request], `Pedido_${request.id}`)}>
                                                        Excel
                                                    </button>
                                                    <button type="button" className="btn btn-secondary purchases-action-secondary" onClick={() => exportRequestsPdf([request], `Pedido ${request.id}`, `Pedido_${request.id}`)}>
                                                        PDF
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                            No hay pedidos que coincidan con los filtros actuales.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        {totalPages > 1 && (
                            <Pagination
                                page={page}
                                totalPages={totalPages}
                                onChange={setPage}
                            />
                        )}
                    </div>
                )}

            </div>

            {editingRequest && (
                <EditRequestModal
                    request={editingRequest}
                    supplies={supplies || []}
                    currentUser={currentUser}
                    onClose={() => setEditingRequest(null)}
                    onDeleted={(deletedId) => {
                        setAllRequests(prev => prev.filter(r => r.id !== deletedId));
                        setEditingRequest(null);
                    }}
                    onItemsChanged={(updaterFn) => {
                        setAllRequests(prev => prev.map(r => r.id === editingRequest.id
                            ? { ...r, items: updaterFn(r.items || []) }
                            : r));
                        setEditingRequest(prev => prev ? { ...prev, items: updaterFn(prev.items || []) } : prev);
                    }}
                />
            )}
        </div>
    );
}

function EditRequestModal({ request, supplies, currentUser, onClose, onItemsChanged, onDeleted }) {
    const [addSupplyId, setAddSupplyId] = useState('');
    const [addQty, setAddQty] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const userLabel = currentUser ? `${currentUser.name || ''} ${currentUser.surname || ''}`.trim() : null;

    const handleDeleteRequest = async () => {
        const { default: Swal } = await import('sweetalert2');
        const confirmed = await Swal.fire({
            title: '¿Eliminar el pedido?',
            html: `Se va a borrar por completo el <strong>Pedido #${request.id}</strong> del servicio <strong>${request.service_name || 'sin servicio'}</strong> y todos sus insumos.<br><br>Esta acción no se puede deshacer.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#DC2626',
        });
        if (!confirmed.isConfirmed) return;

        setBusy(true);
        setError('');
        try {
            const res = await fetch(`/api/supply-requests?request_id=${request.id}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'No se pudo eliminar el pedido.');
            await Swal.fire({ title: 'Pedido eliminado', icon: 'success', confirmButtonColor: '#10B981', timer: 1400, showConfirmButton: false });
            onDeleted?.(request.id);
        } catch (e) {
            setError(e.message);
            setBusy(false);
        }
    };

    const callPatch = async (item_id, body) => {
        const res = await fetch('/api/supply-requests/items', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_id, ...body }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el ítem.');
        return data;
    };

    const handleEditCantidad = async (item, nuevaCantidadStr) => {
        const nueva = Number(nuevaCantidadStr);
        if (!Number.isFinite(nueva) || nueva <= 0) {
            setError('La cantidad debe ser mayor a 0.');
            return;
        }
        if (nueva === Number(item.cantidad)) return; // sin cambios
        setBusy(true);
        setError('');
        try {
            const updated = await callPatch(item.id, { cantidad: nueva, editado_por: userLabel });
            onItemsChanged(items => items.map(it => it.id === item.id
                ? { ...it,
                    cantidad: updated.cantidad,
                    cantidad_original: updated.cantidad_original ?? it.cantidad_original,
                    editado_por: updated.editado_por,
                    editado_at: updated.editado_at }
                : it));
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (item) => {
        if (!confirm(`¿Eliminar "${item.nombre}" del pedido?`)) return;
        setBusy(true);
        setError('');
        try {
            const qs = userLabel ? `?item_id=${item.id}&eliminado_por=${encodeURIComponent(userLabel)}` : `?item_id=${item.id}`;
            const res = await fetch(`/api/supply-requests/items${qs}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'No se pudo eliminar el ítem.');
            if (data.hard_deleted) {
                // Agregado borrado por completo.
                onItemsChanged(items => items.filter(it => it.id !== item.id));
            } else {
                // Soft delete: marcamos eliminado y mantenemos en la lista (tachado).
                onItemsChanged(items => items.map(it => it.id === item.id
                    ? { ...it, eliminado: true, eliminado_por: userLabel, eliminado_at: new Date().toISOString() }
                    : it));
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const handleAdd = async () => {
        if (!addSupplyId || !Number(addQty)) {
            setError('Elegí un insumo y una cantidad válida.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/supply-requests/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    request_id: request.id,
                    supply_id: Number(addSupplyId),
                    cantidad: Number(addQty),
                    marcado_por: userLabel,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'No se pudo agregar el ítem.');
            const supply = supplies.find(s => Number(s.id) === Number(addSupplyId));
            onItemsChanged(items => [...items, {
                id: data.id,
                supply_id: data.supply_id,
                cantidad: data.cantidad,
                nombre: supply?.nombre || null,
                unidad: supply?.unidad || null,
                faltante: false,
                agregado: true,
                marcado_por: userLabel,
                marcado_at: data.marcado_at || new Date().toISOString(),
                eliminado: false,
            }]);
            setAddSupplyId('');
            setAddQty('');
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const items = request.items || [];
    const availableSupplies = supplies
        .filter(s => s.activo !== false && !items.some(it => Number(it.supply_id) === Number(s.id)))
        .map(s => ({ value: s.id, label: s.unidad ? `${s.nombre} (${s.unidad})` : s.nombre }));

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                <h2 style={{ marginBottom: '0.25rem' }}>Editar Pedido #{request.id}</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                    {request.service_name || 'Sin servicio'} · {request.supervisor_surname}, {request.supervisor_name}
                </p>

                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '1rem' }}>
                    <div style={{ padding: '0.5rem 1rem', background: 'var(--color-muted-surface)', borderBottom: '1px solid var(--border-color)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Insumo</span><span>Cantidad</span>
                    </div>
                    {items.length === 0 ? (
                        <p style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Este pedido no tiene insumos.</p>
                    ) : items.map((item, i) => (
                        <EditRequestItemRow
                            key={item.id}
                            item={item}
                            isLast={i === items.length - 1}
                            disabled={busy}
                            onEdit={handleEditCantidad}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>

                <div style={{ border: '1px dashed var(--border-color)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                        Agregar un insumo
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 200px', minWidth: '160px' }}>
                            <SearchableSelect
                                options={availableSupplies}
                                value={addSupplyId}
                                onChange={setAddSupplyId}
                                placeholder="Seleccioná insumo"
                            />
                        </div>
                        <input
                            type="number"
                            min="0"
                            step="any"
                            value={addQty}
                            onChange={e => setAddQty(e.target.value)}
                            placeholder="Cantidad"
                            style={{ width: '110px', padding: '0.5rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.88rem' }}
                        />
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busy || !addSupplyId || !Number(addQty)}
                            onClick={handleAdd}
                            style={{ fontSize: '0.85rem' }}
                        >
                            {busy ? '...' : '+ Agregar'}
                        </button>
                    </div>
                </div>

                {request.notas?.trim() && (
                    <div style={{ background: 'var(--color-muted-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.5rem' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>Notas del supervisor</div>
                        <div style={{ fontSize: '0.88rem', whiteSpace: 'pre-wrap' }}>{request.notas}</div>
                    </div>
                )}

                {error && <div style={{ color: 'var(--error)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{error}</div>}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={handleDeleteRequest}
                        style={{ background: '#DC2626', color: '#fff', fontWeight: 700 }}
                    >
                        Eliminar pedido
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
                </div>
            </div>
        </div>
    );
}

function EditRequestItemRow({ item, isLast, disabled, onEdit, onDelete }) {
    const [draftQty, setDraftQty] = useState(String(item.cantidad));
    // Sincronizar si la prop cambia externamente.
    useEffect(() => { setDraftQty(String(item.cantidad)); }, [item.cantidad]);

    const dirty = String(draftQty) !== String(item.cantidad);
    const rowDeleted = item.eliminado;

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.6rem 1rem',
            background: rowDeleted ? '#FEF2F2' : (item.faltante ? '#FEF2F2' : 'transparent'),
            borderBottom: isLast ? 'none' : '1px solid var(--border-color)',
            opacity: rowDeleted ? 0.7 : 1,
        }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{ textDecoration: rowDeleted ? 'line-through' : 'none', color: rowDeleted ? '#B91C1C' : 'inherit' }}>
                        {item.nombre}
                    </span>
                    {item.agregado && (
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#047857', border: '1px solid #A7F3D0', background: '#ECFDF5', borderRadius: '999px', padding: '0.1rem 0.45rem' }}>AGREGADO</span>
                    )}
                    {item.editado_at && !rowDeleted && (
                        <span
                            title={`Cambiado de ${item.cantidad_original ?? '?'} a ${item.cantidad}${item.editado_por ? ' por ' + item.editado_por : ''}${item.editado_at ? ' el ' + formatArgentinaDateTime(item.editado_at) : ''}`}
                            style={{ fontSize: '0.62rem', fontWeight: 700, color: '#92400E', border: '1px solid #FDE68A', background: '#FFFBEB', borderRadius: '999px', padding: '0.1rem 0.45rem', cursor: 'help' }}
                        >EDITADO</span>
                    )}
                    {rowDeleted && (
                        <span
                            title={`Eliminado${item.eliminado_por ? ' por ' + item.eliminado_por : ''}${item.eliminado_at ? ' el ' + formatArgentinaDateTime(item.eliminado_at) : ''}`}
                            style={{ fontSize: '0.62rem', fontWeight: 700, color: '#B91C1C', border: '1px solid #FECACA', background: '#fff', borderRadius: '999px', padding: '0.1rem 0.45rem', cursor: 'help' }}
                        >ELIMINADO</span>
                    )}
                </div>
                {item.unidad && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.unidad}</div>}
            </div>
            {!rowDeleted ? (
                <>
                    <input
                        type="number"
                        min="0"
                        step="any"
                        value={draftQty}
                        onChange={e => setDraftQty(e.target.value)}
                        onBlur={() => dirty && onEdit(item, draftQty)}
                        disabled={disabled}
                        style={{ width: '80px', padding: '0.35rem 0.5rem', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.88rem', textAlign: 'center' }}
                    />
                    <button
                        type="button"
                        onClick={() => onDelete(item)}
                        disabled={disabled}
                        title="Eliminar"
                        style={{ background: 'transparent', border: 'none', color: '#B91C1C', cursor: 'pointer', fontSize: '1.1rem', padding: '0 0.25rem' }}
                    >×</button>
                </>
            ) : (
                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#B91C1C', textDecoration: 'line-through' }}>{item.cantidad}</span>
            )}
        </div>
    );
}

function Pagination({ page, totalPages, onChange }) {
    const pages = [];
    const push = (v) => { if (!pages.includes(v)) pages.push(v); };
    push(1);
    if (page - 1 > 2) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) push(i);
    if (page + 1 < totalPages - 1) pages.push('...');
    if (totalPages > 1) push(totalPages);

    return (
        <nav className="purchases-pagination" aria-label="Paginación">
            <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onChange(page - 1)}
                disabled={page <= 1}
            >‹</button>
            {pages.map((p, i) => (
                p === '...' ? (
                    <span key={`e-${i}`} className="purchases-pagination-ellipsis">…</span>
                ) : (
                    <button
                        key={p}
                        type="button"
                        className={`btn ${p === page ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => onChange(p)}
                    >{p}</button>
                )
            ))}
            <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onChange(page + 1)}
                disabled={page >= totalPages}
            >›</button>
        </nav>
    );
}

