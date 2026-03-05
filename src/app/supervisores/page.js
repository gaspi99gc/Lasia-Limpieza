'use client';

import { useState, useEffect } from 'react';
import MainLayout from '@/components/MainLayout';

export default function SupervisoresPage() {
    const [supervisors, setSupervisors] = useState([]);
    const [attendance, setAttendance] = useState([]);
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [supRes, attRes, servRes] = await Promise.all([
                    fetch('/api/supervisors'),
                    fetch('/api/attendance'),
                    fetch('/api/services')
                ]);

                if (supRes.ok) setSupervisors(await supRes.json());
                // If attendance API is implemented to return all, use it. Otherwise, empty array for now.
                if (attRes.ok) setAttendance(await attRes.json());
                if (servRes.ok) setServices(await servRes.json());
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
                <header className="flex-between" style={{ marginBottom: '2rem' }}>
                    <div>
                        <h1>Supervisores y Fichadas</h1>
                        <p style={{ color: 'var(--text-muted)' }}>Monitoreo de actividad de los supervisores en los servicios</p>
                    </div>
                </header>

                <div className="grid" style={{ gridTemplateColumns: '1fr', gap: '2rem' }}>
                    <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                            <h3>Registro de Presentismo Reciente</h3>
                        </div>
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Fecha y Hora</th>
                                        <th>Supervisor</th>
                                        <th>Servicio</th>
                                        <th>Tipo de Accion</th>
                                        <th>Estado GPS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {attendance.length > 0 ? attendance.map(att => {
                                        const sup = supervisors.find(s => s.id === att.supervisor_id);
                                        const serv = services.find(s => s.id === att.service_id);
                                        return (
                                            <tr key={att.id}>
                                                <td>{new Date(att.timestamp).toLocaleString()}</td>
                                                <td><strong>{sup ? `${sup.surname}, ${sup.name}` : `ID: ${att.supervisor_id}`}</strong></td>
                                                <td>{serv ? serv.name : `Servicio ID: ${att.service_id}`}</td>
                                                <td>
                                                    <span className={`badge ${att.type === 'check-in' ? 'badge-success' : 'badge-danger'}`}>
                                                        {att.type === 'check-in' ? 'Entrada' : 'Salida'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span style={{ color: att.verified ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
                                                        {att.verified ? '✅ Verificado' : '⚠️ Lejos del rango'}
                                                    </span>
                                                    {att.distance_meters != null && (
                                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                                                            ({Math.round(att.distance_meters)}m)
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                                No hay registros de presentismo todavía.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                            <h3>Directorio de Supervisores</h3>
                        </div>
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Nombre Completo</th>
                                        <th>DNI</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {supervisors.map(sup => (
                                        <tr key={sup.id}>
                                            <td><strong>{sup.surname}, {sup.name}</strong></td>
                                            <td>{sup.dni}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
