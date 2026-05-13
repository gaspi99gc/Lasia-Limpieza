'use client';

import { useState, useEffect } from 'react';
import MainLayout from '@/components/MainLayout';
import { formatArgentinaDateTime } from '@/lib/datetime';
import { useCatalog } from '@/lib/CatalogContext';

export default function SupervisoresPage() {
    const { supervisors } = useCatalog();
    const [todayLogs, setTodayLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [downloadingSupervisorId, setDownloadingSupervisorId] = useState(null);
    const [downloadingExcelId, setDownloadingExcelId] = useState(null);
    const [downloadingPdfId, setDownloadingPdfId] = useState(null);

    const handleDownloadWeeklyExcel = async (supervisor) => {
        const { default: Swal } = await import('sweetalert2');
        try {
            setDownloadingExcelId(supervisor.id);
            const response = await fetch(`/api/reports/weekly-excel?supervisor_id=${supervisor.id}`);

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Error del servidor (${response.status})`);
            }

            const blob = await response.blob();
            const filename = response.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1]
                ?? `Reporte_Semanal_${supervisor.surname}_${supervisor.name}.xlsx`;

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (error) {
            console.error('Error descargando reporte semanal:', error);
            await Swal.fire({
                title: 'Error',
                text: error.message || 'No se pudo descargar el reporte.',
                icon: 'error',
                confirmButtonColor: '#ef4444',
            });
        } finally {
            setDownloadingExcelId(null);
        }
    };

    const handleDownloadWeeklyPdf = async (supervisor) => {
        const { default: Swal } = await import('sweetalert2');
        try {
            setDownloadingPdfId(supervisor.id);
            const response = await fetch(`/api/reports/weekly-pdf?supervisor_id=${supervisor.id}`);

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Error del servidor (${response.status})`);
            }

            const blob = await response.blob();
            const filename = response.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1]
                ?? `Reporte_Semanal_${supervisor.surname}_${supervisor.name}.pdf`;

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (error) {
            console.error('Error descargando reporte semanal PDF:', error);
            await Swal.fire({
                title: 'Error',
                text: error.message || 'No se pudo descargar el reporte.',
                icon: 'error',
                confirmButtonColor: '#ef4444',
            });
        } finally {
            setDownloadingPdfId(null);
        }
    };

    const handleDownloadPresentismo = async (supervisor) => {
        const { default: Swal } = await import('sweetalert2');
        try {
            setDownloadingSupervisorId(supervisor.id);

            const response = await fetch(`/api/presentismo-pdf?supervisor_id=${supervisor.id}&days=7`);

            if (response.status === 404) {
                await Swal.fire({
                    title: 'Sin registros',
                    text: 'Este supervisor no tiene registros de presentismo en los últimos 7 días.',
                    icon: 'info',
                    confirmButtonColor: '#1f3a4a',
                });
                return;
            }

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Error del servidor (${response.status})`);
            }

            const blob = await response.blob();
            const filename = response.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1]
                ?? `Presentismo_${supervisor.surname}_${supervisor.name}.pdf`;

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (error) {
            console.error('Error descargando presentismo:', error);
            await Swal.fire({
                title: 'Error',
                text: error.message || 'No se pudo descargar el presentismo.',
                icon: 'error',
                confirmButtonColor: '#ef4444',
            });
        } finally {
            setDownloadingSupervisorId(null);
        }
    };

    useEffect(() => {
        const loadData = async () => {
            try {
                const res = await fetch('/api/presentismo-logs?days=1');
                if (res.ok) {
                    const all = await res.json();

                    // Keep today's logs only (Argentina timezone)
                    const todayAR = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
                    const todayFiltered = all.filter(log => {
                        const logDate = new Date(log.occurred_at).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
                        return logDate === todayAR;
                    });

                    // Max 3 per supervisor, most recent first
                    const countBySup = {};
                    const limited = todayFiltered.filter(log => {
                        const key = log.supervisor_id;
                        countBySup[key] = (countBySup[key] || 0) + 1;
                        return countBySup[key] <= 3;
                    });

                    setTodayLogs(limited);
                }
            } catch (err) {
                console.error('Error cargando datos:', err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    if (loading) return <MainLayout><div style={{ padding: '2rem' }}>Cargando datos...</div></MainLayout>;

    return (
        <MainLayout>
            <div className="supervisores-view">
                <header className="page-header" style={{ marginBottom: '2rem' }}>
                    <h1>Supervisores</h1>
                </header>

                <div className="grid" style={{ gridTemplateColumns: '1fr', gap: '2rem' }}>
                    {/* Directorio */}
                    <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                            <h3>Directorio de Supervisores</h3>
                        </div>
                        <div className="table-container">
                            <table className="table mobile-cards-table">
                                <thead>
                                    <tr>
                                        <th>Nombre Completo</th>
                                        <th>DNI</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {supervisors.map(sup => (
                                        <tr key={sup.id}>
                                            <td data-label="Nombre Completo"><strong>{sup.surname}, {sup.name}</strong></td>
                                            <td data-label="DNI">{sup.dni}</td>
                                            <td data-label="Acciones" className="mobile-hide-label" style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <span className="desktop-only" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Reporte Semanal:</span>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary"
                                                        onClick={() => handleDownloadWeeklyPdf(sup)}
                                                        disabled={!sup.id || downloadingPdfId === sup.id}
                                                    >
                                                        {sup.id && downloadingPdfId === sup.id ? '...' : 'PDF'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary"
                                                        onClick={() => handleDownloadWeeklyExcel(sup)}
                                                        disabled={!sup.id || downloadingExcelId === sup.id}
                                                    >
                                                        {sup.id && downloadingExcelId === sup.id ? '...' : 'Excel'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary"
                                                        onClick={() => handleDownloadPresentismo(sup)}
                                                        disabled={!sup.id || downloadingSupervisorId === sup.id}
                                                    >
                                                        <span className="desktop-only">{sup.id && downloadingSupervisorId === sup.id ? 'Descargando...' : 'Presentismo PDF'}</span>
                                                        <span className="mobile-only">{sup.id && downloadingSupervisorId === sup.id ? '...' : '📄'}</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Fichadas de hoy */}
                    <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                            <h3 style={{ margin: 0 }}>Fichadas de hoy</h3>
                        </div>
                        <div className="table-container">
                            {todayLogs.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    No hay fichadas registradas hoy.
                                </div>
                            ) : (
                                <table className="table mobile-cards-table">
                                    <thead>
                                        <tr>
                                            <th>Hora</th>
                                            <th>Supervisor</th>
                                            <th>Servicio</th>
                                            <th>Evento</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {todayLogs.map(log => (
                                            <tr key={log.id}>
                                                <td data-label="Hora">{formatArgentinaDateTime(log.occurred_at)}</td>
                                                <td data-label="Supervisor">
                                                    <strong>{log.supervisor_surname}, {log.supervisor_name}</strong>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>DNI: {log.supervisor_dni}</div>
                                                </td>
                                                <td data-label="Servicio">{log.service_name || 'Sin servicio'}</td>
                                                <td data-label="Evento">
                                                    <span className={`badge ${log.event_type === 'ingreso' ? 'badge-success' : 'badge-secondary'}`}>
                                                        {log.event_type === 'ingreso' ? 'Ingreso' : 'Salida'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
