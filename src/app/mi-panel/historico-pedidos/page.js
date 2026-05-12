'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { formatArgentinaDateTime } from '@/lib/datetime';
import { getSessionUser } from '@/lib/session';

export default function HistoricoPedidosPage() {
    const [currentUser, setCurrentUser] = useState(null);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    useEffect(() => {
        async function loadRequests() {
            try {
                setLoading(true);
                setError('');

                const storedUser = getSessionUser();

                if (!storedUser) {
                    throw new Error('No se encontró una sesión activa.');
                }

                setCurrentUser(storedUser);

                if (!storedUser?.id || storedUser.role !== 'supervisor') {
                    throw new Error('No se encontró un supervisor válido.');
                }

                const response = await fetch(
                    `/api/supply-requests?supervisor_id=${storedUser.id}&include_meta=true&page=${page}&limit=20`
                );
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(data.error || 'No se pudo cargar el histórico de pedidos.');
                }

                setRequests(Array.isArray(data.requests) ? data.requests : []);
                setTotalPages(Number(data.totalPages) || 1);
            } catch (loadError) {
                setError(loadError.message || 'No se pudo cargar el histórico de pedidos.');
            } finally {
                setLoading(false);
            }
        }

        loadRequests();
    }, [page]);

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
                        <>
                            <div className="table-container historico-table-container">
                                <table className="table historico-table">
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
                                            <tr key={request.id} className="historico-request-row">
                                                <td data-label="Fecha y hora" className="historico-cell historico-cell-date">
                                                    <div className="historico-inline-field">
                                                        <span className="historico-inline-label">Fecha y hora</span>
                                                        <span className="historico-inline-text">{formatArgentinaDateTime(request.created_at)}</span>
                                                    </div>
                                                </td>
                                                <td data-label="Servicio" className="historico-cell historico-cell-service">
                                                    <div className="historico-inline-field">
                                                        <span className="historico-inline-label">Servicio</span>
                                                        <strong className="historico-inline-text">{request.service_name}</strong>
                                                    </div>
                                                </td>
                                                <td data-label="Insumos" className="historico-cell historico-cell-items">
                                                    {Array.isArray(request.items) && request.items.length > 0
                                                        ? <span className="badge badge-secondary">{request.items.length} insumo{request.items.length !== 1 ? 's' : ''}</span>
                                                        : <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin insumos</span>
                                                    }
                                                </td>
                                                <td data-label="Notas" className="historico-cell historico-notes-cell">
                                                    <div className={`historico-notes-box ${request.notas?.trim() ? 'has-content' : 'is-empty'}`}>
                                                        {request.notas?.trim() || 'Sin notas'}
                                                    </div>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr className="historico-empty-row">
                                                <td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                                    Todavía no hay pedidos enviados.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {totalPages > 1 && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '1.25rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setPage(p => p - 1)}
                                        disabled={page <= 1 || loading}
                                        style={{ minWidth: '90px' }}
                                    >
                                        ← Anterior
                                    </button>
                                    <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                                        Página <strong style={{ color: 'var(--text-main)' }}>{page}</strong> de <strong style={{ color: 'var(--text-main)' }}>{totalPages}</strong>
                                    </span>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setPage(p => p + 1)}
                                        disabled={page >= totalPages || loading}
                                        style={{ minWidth: '90px' }}
                                    >
                                        Siguiente →
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}
