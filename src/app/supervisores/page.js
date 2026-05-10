'use client';

import { useState, useEffect } from 'react';
import MainLayout from '@/components/MainLayout';
import SearchableSelect from '@/components/SearchableSelect';
import { formatArgentinaDateTime } from '@/lib/datetime';
import { useCatalog } from '@/lib/CatalogContext';


export default function SupervisoresPage() {
    const { supervisors } = useCatalog();
    const [attendance, setAttendance] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterSupervisor, setFilterSupervisor] = useState('');
    const [filterService, setFilterService] = useState('');
    const [downloadingSupervisorId, setDownloadingSupervisorId] = useState(null);
    const [tabParam, setTabParam] = useState(null);

    useEffect(() => {
        setTabParam(new URLSearchParams(window.location.search).get('tab'));
    }, []);

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
                const logsRes = await fetch('/api/presentismo-logs?days=7');
                if (logsRes.ok) setAttendance(await logsRes.json());
            } catch (err) {
                console.error("Error cargando datos:", err);
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
                <header className="page-header" style={{ marginBottom: '2rem', flexWrap: 'wrap' }}>
                    <div>
                        <h1>{tabParam === 'presentismo' ? 'Registro de Presentismo' : 'Supervisores'}</h1>
                    </div>
                </header>

                <div className="grid" style={{ gridTemplateColumns: '1fr', gap: '2rem' }}>
                    {tabParam !== 'presentismo' && <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                            <h3>Directorio de Supervisores</h3>
                        </div>
                        <div className="table-container">
                            <table className="table mobile-cards-table">
                                <thead>
                                    <tr>
                                        <th>Nombre Completo</th>
                                        <th>DNI</th>
                                        <th style={{ textAlign: 'right' }}>Presentismo 7 días</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {supervisors.map(sup => (
                                        <tr key={sup.id}>
                                            <td data-label="Nombre Completo"><strong>{sup.surname}, {sup.name}</strong></td>
                                            <td data-label="DNI">{sup.dni}</td>
                                            <td data-label="Presentismo 7 días" className="mobile-hide-label" style={{ textAlign: 'right' }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    onClick={() => handleDownloadPresentismo(sup)}
                                                    disabled={!sup.id || downloadingSupervisorId === sup.id}
                                                >
                                                    <span className="desktop-only">{sup.id && downloadingSupervisorId === sup.id ? 'Descargando...' : 'Descargar PDF'}</span>
                                                    <span className="mobile-only">{sup.id && downloadingSupervisorId === sup.id ? '...' : '📄'}</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>}

                    {tabParam === 'presentismo' && <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0 }}>Registro de Presentismo Reciente</h3>
                            <div style={{ display: 'flex', flexDirection: 'row', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ width: '200px' }}>
                                    <select
                                        value={filterSupervisor}
                                        onChange={e => setFilterSupervisor(e.target.value)}
                                        style={{ width: '100%', padding: '0.45rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.88rem', background: 'var(--color-surface)', color: 'var(--text-main)', cursor: 'pointer' }}
                                    >
                                        <option value="">Todos los supervisores</option>
                                        {supervisors.map(s => (
                                            <option key={s.id} value={`${s.surname}, ${s.name}`}>{s.surname}, {s.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ width: '200px' }}>
                                    <SearchableSelect
                                        options={[...new Set(attendance.map(l => l.service_name).filter(Boolean))].sort().map(name => ({ value: name, label: name }))}
                                        value={filterService}
                                        onChange={setFilterService}
                                        placeholder="Todos los servicios"
                                        searchPlaceholder="Buscar servicio..."
                                    />
                                </div>
                                {(filterSupervisor || filterService) && (
                                    <button
                                        onClick={() => { setFilterSupervisor(''); setFilterService(''); }}
                                        style={{ padding: '0.45rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.88rem', background: 'var(--color-surface)', color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                    >
                                        Limpiar
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="table-container">
                            <table className="table mobile-cards-table">
                                <thead>
                                    <tr>
                                        <th>Fecha y Hora</th>
                                        <th>Supervisor</th>
                                        <th>Servicio</th>
                                        <th>Evento</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        const filtered = attendance.filter(log => {
                                            const matchSup = !filterSupervisor || `${log.supervisor_surname}, ${log.supervisor_name}` === filterSupervisor;
                                            const matchSvc = !filterService || log.service_name === filterService;
                                            return matchSup && matchSvc;
                                        });
                                        return filtered.length > 0 ? filtered.map(log => (
                                        <tr key={log.id}>
                                            <td data-label="Fecha y Hora">{formatArgentinaDateTime(log.occurred_at)}</td>
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
                                    )) : (
                                        <tr>
                                            <td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                                No hay registros de presentismo en los últimos 7 días.
                                            </td>
                                        </tr>
                                    );
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>}
                </div>
            </div>
        </MainLayout>
    );
}
