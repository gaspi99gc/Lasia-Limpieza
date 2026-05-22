'use client';

import { useEffect, useMemo, useState } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { formatArgentinaDateTime, getArgentinaDateStamp, parseAppDate } from '@/lib/datetime';
import { getSessionUser } from '@/lib/session';
import { useCatalog } from '@/lib/CatalogContext';

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
        alert('No hay pedidos para exportar con los filtros actuales.');
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
    const { services, supervisors } = useCatalog();
    const [currentUser, setCurrentUser] = useState(null);
    const [allRequests, setAllRequests] = useState([]);
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
                if (defaultStatusFilter && defaultStatusFilter !== 'todos') {
                    query.set('status', defaultStatusFilter);
                }
                query.set('limit', '1000');
                const response = await fetch(`/api/supply-requests?${query.toString()}`);
                const data = await response.json().catch(() => []);
                if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los pedidos.');
                setAllRequests(Array.isArray(data) ? data : (Array.isArray(data.requests) ? data.requests : []));
            } catch (loadError) {
                setError(loadError.message || 'No se pudieron cargar los pedidos.');
            } finally {
                setLoading(false);
            }
        }
        loadRequests();
    }, [defaultStatusFilter]);

    const requests = useMemo(() => {
        return allRequests.filter((r) => {
            if (filters.requestId && String(r.id) !== filters.requestId) return false;
            if (filters.status && filters.status !== 'todos' && filters.status !== defaultStatusFilter) {
                if (filters.status === 'activos') {
                    if (!['pendiente', 'revisado'].includes(r.status)) return false;
                } else {
                    if (r.status !== filters.status) return false;
                }
            }
            if (filters.serviceId && String(r.service_id) !== String(filters.serviceId)) return false;
            if (filters.supervisorId && String(r.supervisor_id) !== String(filters.supervisorId)) return false;
            if (filters.onlyUrgent && !r.urgent) return false;
            if (filters.startDate) {
                const [y, m, d] = filters.startDate.split('-').map(Number);
                const start = new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
                if (new Date(r.created_at) < start) return false;
            }
            if (filters.endDate) {
                const [y, m, d] = filters.endDate.split('-').map(Number);
                const end = new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0));
                if (new Date(r.created_at) >= end) return false;
            }
            return true;
        });
    }, [allRequests, filters, defaultStatusFilter]);

    const updateFilter = (field, value) => {
        setFilters((current) => ({ ...current, [field]: value }));
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
    };

    const applyQuickDateRange = (mode) => {
        const range = getQuickDateRange(mode);
        setFilters((current) => ({
            ...current,
            startDate: range.startDate,
            endDate: range.endDate,
        }));
    };

    const exportRequests = async (exportedRequests, filePrefix) => {
        if (!exportedRequests.length) {
            alert('No hay pedidos para exportar con los filtros actuales.');
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
        const { default: Swal } = await import('sweetalert2');
        const summaryItems = Array.isArray(request.items)
            ? request.items.map((item) => {
                const base = `${escapeHtml(item.nombre)}: ${escapeHtml(item.cantidad)}`;
                if (!item.agregado) return base;

                const badge = `<span style="font-size:0.68rem; font-weight:700; color:#047857; border:1px solid #A7F3D0; background:#ECFDF5; border-radius:999px; padding:0.05rem 0.45rem; margin-left:0.3rem;">AGREGADO</span>`;
                let ficha = '';
                if (item.marcado_at) {
                    const cuando = formatArgentinaDateTime(item.marcado_at);
                    const quien = item.marcado_por ? ` por ${escapeHtml(item.marcado_por)}` : '';
                    ficha = `<div style="font-size:0.74rem; color:#B45309; margin-top:0.1rem;">Agregado el ${escapeHtml(cuando)}${quien}</div>`;
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
                            <span className="badge badge-success">Mostrando {requests.length} de {allRequests.length}</span>
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
                    </div>
                )}

            </div>
        </div>
    );
}

