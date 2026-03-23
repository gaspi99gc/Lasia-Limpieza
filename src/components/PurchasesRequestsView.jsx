'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { formatArgentinaDateTime, getArgentinaDateStamp } from '@/lib/datetime';

function buildRequestsExportRows(requests) {
    return requests.flatMap((request) => {
        const baseRow = {
            'Pedido ID': request.id,
            Estado: request.status === 'ok' ? 'OK' : 'Pendiente',
            'Fecha y hora': formatArgentinaDateTime(request.created_at),
            Supervisor: `${request.supervisor_surname}, ${request.supervisor_name}`,
            DNI: request.supervisor_dni,
            Servicio: request.service_name,
            Direccion: request.service_address || 'Sin direccion cargada',
            'Completado por': request.completed_by || '',
            'Fecha OK': request.completed_at ? formatArgentinaDateTime(request.completed_at) : '',
            Notas: request.notas || '',
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
            'Fecha y hora',
            'Supervisor',
            'DNI',
            'Servicio',
            'Direccion',
            'Insumo',
            'Cantidad',
            'Unidad',
            'Notas'
        ]],
        body: rows.map((row) => ([
            row['Pedido ID'],
            row.Estado,
            row['Fecha y hora'],
            row.Supervisor,
            row.DNI,
            row.Servicio,
            row.Direccion,
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
        columnStyles: {
            0: { cellWidth: 52 },
            1: { cellWidth: 60 },
            2: { cellWidth: 96 },
            3: { cellWidth: 100 },
            4: { cellWidth: 70 },
            5: { cellWidth: 90 },
            6: { cellWidth: 180 },
            7: { cellWidth: 95 },
            8: { cellWidth: 58 },
            9: { cellWidth: 58 },
            10: { cellWidth: 90 },
        },
        margin: { left: 32, right: 32, bottom: 32 }
    });

    doc.save(`${fileName}_${getArgentinaDateStamp()}.pdf`);
}

export default function PurchasesRequestsView({ title, description, fixedStatus = '' }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [requests, setRequests] = useState([]);
    const [services, setServices] = useState([]);
    const [supervisors, setSupervisors] = useState([]);
    const [filters, setFilters] = useState({
        date: '',
        startDate: '',
        endDate: '',
        serviceId: '',
        supervisorId: '',
    });
    const [loading, setLoading] = useState(true);
    const [updatingRequestId, setUpdatingRequestId] = useState(null);
    const [error, setError] = useState('');

    const activeFilterCount = useMemo(() => {
        return Object.values(filters).filter(Boolean).length;
    }, [filters]);

    const canEditStatus = !fixedStatus;

    useEffect(() => {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            setCurrentUser(JSON.parse(storedUser));
        }
    }, []);

    useEffect(() => {
        async function loadCatalogs() {
            try {
                const [servicesResponse, supervisorsResponse] = await Promise.all([
                    fetch('/api/services'),
                    fetch('/api/supervisors')
                ]);

                const servicesData = await servicesResponse.json().catch(() => ([]));
                const supervisorsData = await supervisorsResponse.json().catch(() => ([]));

                if (servicesResponse.ok) {
                    setServices(Array.isArray(servicesData) ? servicesData : []);
                }

                if (supervisorsResponse.ok) {
                    setSupervisors(Array.isArray(supervisorsData) ? supervisorsData : []);
                }
            } catch (catalogError) {
                console.error(catalogError);
            }
        }

        loadCatalogs();
    }, []);

    useEffect(() => {
        async function loadRequests() {
            try {
                setLoading(true);
                setError('');

                const query = new URLSearchParams();

                if (filters.date) query.set('date', filters.date);
                if (filters.startDate) query.set('start_date', filters.startDate);
                if (filters.endDate) query.set('end_date', filters.endDate);
                if (filters.serviceId) query.set('service_id', filters.serviceId);
                if (filters.supervisorId) query.set('supervisor_id', filters.supervisorId);
                if (fixedStatus) query.set('status', fixedStatus);

                const response = await fetch(`/api/supply-requests?${query.toString()}`);
                const data = await response.json().catch(() => ([]));

                if (!response.ok) {
                    throw new Error(data.error || 'No se pudieron cargar los pedidos.');
                }

                setRequests(Array.isArray(data) ? data : []);
            } catch (loadError) {
                setError(loadError.message || 'No se pudieron cargar los pedidos.');
            } finally {
                setLoading(false);
            }
        }

        loadRequests();
    }, [filters, fixedStatus]);

    const updateFilter = (field, value) => {
        setFilters((current) => ({ ...current, [field]: value }));
    };

    const clearFilters = () => {
        setFilters({
            date: '',
            startDate: '',
            endDate: '',
            serviceId: '',
            supervisorId: '',
        });
    };

    const exportRequests = (exportedRequests, filePrefix) => {
        if (!exportedRequests.length) {
            alert('No hay pedidos para exportar con los filtros actuales.');
            return;
        }

        const rows = buildRequestsExportRows(exportedRequests);
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Pedidos');
        XLSX.writeFile(workbook, `${filePrefix}_${getArgentinaDateStamp()}.xlsx`);
    };

    const getItemsSummary = (request) => {
        const itemCount = Array.isArray(request.items) ? request.items.length : 0;

        if (itemCount === 0) {
            return 'Sin insumos';
        }

        return `${itemCount} insumo(s) cargado(s)`;
    };

    const handleToggleStatus = async (request, checked) => {
        try {
            setUpdatingRequestId(request.id);
            setError('');

            const response = await fetch('/api/supply-requests', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    request_id: request.id,
                    status: checked ? 'ok' : 'pendiente',
                    completed_by: checked ? (currentUser?.dni || currentUser?.name || 'compras') : null,
                })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || 'No se pudo actualizar el estado del pedido.');
            }

            setRequests((currentRequests) => {
                const updatedRequests = currentRequests.map((currentRequest) => (
                    currentRequest.id === request.id
                        ? {
                            ...currentRequest,
                            status: data.status,
                            completed_by: data.completed_by,
                            completed_at: data.completed_at,
                        }
                        : currentRequest
                ));

                return fixedStatus
                    ? updatedRequests.filter((currentRequest) => currentRequest.status === fixedStatus)
                    : updatedRequests;
            });
        } catch (updateError) {
            setError(updateError.message || 'No se pudo actualizar el estado del pedido.');
        } finally {
            setUpdatingRequestId(null);
        }
    };

    return (
        <div className="panel-max-wide">
            <div className="card" style={{ padding: 0 }}>
                <div className="page-header" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    <div>
                        <h1>{title}</h1>
                        <p style={{ color: 'var(--text-muted)' }}>{description}</p>
                    </div>
                    <div className="page-header-actions">
                        <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                            Limpiar filtros
                        </button>
                        <button type="button" className="btn btn-primary" onClick={() => exportRequests(requests, fixedStatus === 'ok' ? 'Pedidos_realizados' : 'Pedidos_filtrados')}>
                            Excel
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => exportRequestsPdf(requests, title, fixedStatus === 'ok' ? 'Pedidos_realizados' : 'Pedidos_filtrados')}>
                            PDF
                        </button>
                    </div>
                </div>

                <div className="card purchases-filters-card" style={{ margin: '1.5rem auto 0' }}>
                    <div className="page-header" style={{ marginBottom: '0.5rem' }}>
                        <div>
                            <h3>Filtros</h3>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span className="badge badge-secondary">{activeFilterCount} filtro(s) activos</span>
                            <span className="badge badge-success">{requests.length} pedido(s)</span>
                        </div>
                    </div>

                    <div className="employee-form-grid purchases-filters-grid">
                        <div className="form-group">
                            <label>Día cargado</label>
                            <input type="date" value={filters.date} onChange={(e) => updateFilter('date', e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Desde</label>
                            <input type="date" value={filters.startDate} onChange={(e) => updateFilter('startDate', e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Hasta</label>
                            <input type="date" value={filters.endDate} onChange={(e) => updateFilter('endDate', e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Servicio</label>
                            <select value={filters.serviceId} onChange={(e) => updateFilter('serviceId', e.target.value)}>
                                <option value="">Todos los servicios</option>
                                {services.map((service) => (
                                    <option key={service.id} value={service.id}>{service.name}</option>
                                ))}
                            </select>
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
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando pedidos...</div>
                ) : error ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--error)', fontWeight: 600 }}>{error}</div>
                ) : (
                    <div className="table-container purchases-table-wrap" style={{ margin: '1.5rem' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Fecha y hora</th>
                                    <th>Supervisor</th>
                                    <th>Servicio</th>
                                    <th>Insumos</th>
                                    <th>Estado</th>
                                    <th>Notas</th>
                                    <th style={{ textAlign: 'right' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {requests.length > 0 ? requests.map((request) => (
                                    <tr key={request.id}>
                                        <td>{formatArgentinaDateTime(request.created_at)}</td>
                                        <td>
                                            <strong>{request.supervisor_surname}, {request.supervisor_name}</strong>
                                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>DNI: {request.supervisor_dni}</div>
                                        </td>
                                        <td>
                                            <strong>{request.service_name}</strong>
                                        </td>
                                        <td>
                                            <strong>{getItemsSummary(request)}</strong>
                                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                                Ver detalle completo en Excel o PDF
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge ${request.status === 'ok' ? 'badge-success' : 'badge-warning'}`}>
                                                {request.status === 'ok' ? 'OK' : 'Pendiente'}
                                            </span>
                                            {request.completed_at ? (
                                                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                                                    {request.completed_by || 'Compras'} - {formatArgentinaDateTime(request.completed_at)}
                                                </div>
                                            ) : null}
                                        </td>
                                        <td>{request.notas || 'Sin notas'}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div className="table-action-group" style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                                                {canEditStatus ? (
                                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)', fontWeight: 600 }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={request.status === 'ok'}
                                                            disabled={updatingRequestId === request.id}
                                                            onChange={(event) => handleToggleStatus(request, event.target.checked)}
                                                        />
                                                        OK
                                                    </label>
                                                ) : null}
                                                <button type="button" className="btn btn-secondary" onClick={() => exportRequests([request], `Pedido_${request.id}`)}>
                                                    Excel
                                                </button>
                                                <button type="button" className="btn btn-secondary" onClick={() => exportRequestsPdf([request], `Pedido ${request.id}`, `Pedido_${request.id}`)}>
                                                    PDF
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
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
