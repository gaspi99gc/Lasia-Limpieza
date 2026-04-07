'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { formatArgentinaDateTime } from '@/lib/datetime';

export default function HistoricoPedidosPage() {
    const [currentUser, setCurrentUser] = useState(null);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        async function loadRequests() {
            try {
                setLoading(true);
                setError('');

                const storedUser = localStorage.getItem('currentUser');

                if (!storedUser) {
                    throw new Error('No se encontró una sesión activa.');
                }

                const parsedUser = JSON.parse(storedUser);
                setCurrentUser(parsedUser);

                if (!parsedUser?.id || parsedUser.role !== 'supervisor') {
                    throw new Error('No se encontró un supervisor válido.');
                }

                const response = await fetch(`/api/supply-requests?supervisor_id=${parsedUser.id}`);
                const data = await response.json().catch(() => ([]));

                if (!response.ok) {
                    throw new Error(data.error || 'No se pudo cargar el histórico de pedidos.');
                }

                const filteredRequests = Array.isArray(data)
                    ? data.filter((request) => Number(request.supervisor_id) === Number(parsedUser.id))
                    : [];

                setRequests(filteredRequests);
            } catch (loadError) {
                setError(loadError.message || 'No se pudo cargar el histórico de pedidos.');
            } finally {
                setLoading(false);
            }
        }

        loadRequests();
    }, []);

    return (
        <MainLayout>
            <div className="panel-max-wide">
                <div className="card" style={{ padding: 0 }}>
                    <div className="page-header" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                        <div>
                            <h1>Historico de Pedidos</h1>
                            <p style={{ color: 'var(--text-muted)' }}>
                                {currentUser
                                    ? `Pedidos enviados por ${currentUser.name} ${currentUser.surname}`
                                    : 'Listado de pedidos de insumos enviados por el supervisor'}
                            </p>
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            Cargando histórico...
                        </div>
                    ) : error ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--error)', fontWeight: 600 }}>
                            {error}
                        </div>
                    ) : (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Fecha y hora</th>
                                        <th>Servicio</th>
                                        <th>Insumos</th>
                                        <th>Notas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {requests.length > 0 ? requests.map((request) => (
                                        <tr key={request.id}>
                                            <td>{formatArgentinaDateTime(request.created_at)}</td>
                                            <td>
                                                <strong>{request.service_name}</strong>
                                            </td>
                                            <td>
                                                <div style={{ display: 'grid', gap: '0.35rem' }}>
                                                    {Array.isArray(request.items) && request.items.length > 0 ? request.items.map((item, index) => (
                                                        <div key={`${request.id}-${item.nombre}-${index}`}>
                                                            {item.nombre}: <strong>{item.cantidad}</strong>
                                                        </div>
                                                    )) : 'Sin insumos'}
                                                </div>
                                            </td>
                                            <td>{request.notas || 'Sin notas'}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                                Todavía no hay pedidos enviados.
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
