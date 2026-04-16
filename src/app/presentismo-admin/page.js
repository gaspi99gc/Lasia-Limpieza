'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { formatArgentinaDateTime } from '@/lib/datetime';

export default function PresentismoAdminPage() {
    const [activeSupervisors, setActiveSupervisors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        async function loadActiveSupervisors() {
            try {
                if (!cancelled) {
                    setError('');
                }

                const response = await fetch('/api/supervisor-status?status=chambeando');
                const data = await response.json().catch(() => ([]));

                if (!response.ok) {
                    throw new Error(data.error || 'No se pudo cargar el presentismo en tiempo real.');
                }

                if (!cancelled) {
                    setActiveSupervisors(Array.isArray(data) ? data : []);
                }
            } catch (loadError) {
                if (!cancelled) {
                    setError(loadError.message || 'No se pudo cargar el presentismo en tiempo real.');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadActiveSupervisors();
        const intervalId = setInterval(loadActiveSupervisors, 15000);

        return () => {
            cancelled = true;
            clearInterval(intervalId);
        };
    }, []);

    return (
        <MainLayout>
            <div className="presentismo-admin-view">
                <header className="page-header" style={{ marginBottom: '2rem', flexWrap: 'wrap' }}>
                    <div>
                        <h1>Presentismo en Tiempo Real</h1>
                        <p style={{ color: 'var(--text-muted)' }}>Supervisores que estan chambeando ahora mismo</p>
                    </div>
                    <div className="page-header-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div className="badge badge-success" style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                            {activeSupervisors.length} activos
                        </div>
                    </div>
                </header>

                <div className="card" style={{ padding: 0 }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                        <h3>Quienes estan chambeando</h3>
                    </div>

                    {loading ? (
                        <div style={{ padding: '2rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                            Cargando presentismo...
                        </div>
                    ) : error ? (
                        <div style={{ padding: '2rem', color: 'var(--error)', textAlign: 'center', fontWeight: 600 }}>
                            {error}
                        </div>
                    ) : (
                        <div className="table-container">
                            <table className="table mobile-cards-table">
                                <thead>
                                    <tr>
                                        <th>Supervisor</th>
                                        <th>Servicio</th>
                                        <th>Direccion</th>
                                        <th>Hora de ingreso</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeSupervisors.length > 0 ? activeSupervisors.map((item) => (
                                        <tr key={item.supervisor_id}>
                                            <td data-label="Supervisor">
                                                <strong>{item.supervisor_surname}, {item.supervisor_name}</strong>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>DNI: {item.supervisor_dni}</div>
                                            </td>
                                            <td data-label="Servicio">{item.current_service_name || 'Sin servicio'}</td>
                                            <td data-label="Direccion">{item.current_service_address || 'Sin direccion cargada'}</td>
                                            <td data-label="Hora de ingreso">
                                                {item.entered_at
                                                    ? formatArgentinaDateTime(item.entered_at)
                                                    : 'Sin registro'}
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                                No hay supervisores chambeando en este momento.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}
