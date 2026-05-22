'use client';

import { useEffect, useState, useMemo } from 'react';
import MainLayout from '@/components/MainLayout';
import SearchableSelect from '@/components/SearchableSelect';
import { formatArgentinaDateTime } from '@/lib/datetime';
import { getSessionUser } from '@/lib/session';
import { useCatalog } from '@/lib/CatalogContext';

export default function HistoricoPedidosPage() {
    const { supplies: allSupplies } = useCatalog();
    const activeSupplies = (allSupplies || []).filter(s => s.activo !== false);
    const [currentUser, setCurrentUser] = useState(null);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState('');
    const [viewingRequest, setViewingRequest] = useState(null);
    const [addSupplyId, setAddSupplyId] = useState('');
    const [addQty, setAddQty] = useState('');
    const [addBusy, setAddBusy] = useState(false);
    const [addError, setAddError] = useState('');

    const updateRequestItems = (requestId, updater) => {
        setRequests(prev => prev.map(r => r.id !== requestId ? r : { ...r, items: updater(r.items || []) }));
        setViewingRequest(prev => (prev && prev.id === requestId)
            ? { ...prev, items: updater(prev.items || []) }
            : prev);
    };

    const addItem = async () => {
        if (!viewingRequest || !addSupplyId || !Number(addQty)) {
            setAddError('Elegí un insumo y una cantidad válida.');
            return;
        }
        setAddBusy(true);
        setAddError('');
        try {
            const res = await fetch('/api/supply-requests/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    request_id: viewingRequest.id,
                    supply_id: Number(addSupplyId),
                    cantidad: Number(addQty),
                    marcado_por: currentUser ? `${currentUser.name} ${currentUser.surname}` : null,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'No se pudo agregar el insumo.');
            const supply = activeSupplies.find(s => Number(s.id) === Number(addSupplyId));
            const newItem = {
                id: data.id,
                supply_id: data.supply_id,
                cantidad: data.cantidad,
                nombre: supply?.nombre || null,
                unidad: supply?.unidad || null,
                faltante: false,
                agregado: true,
            };
            updateRequestItems(viewingRequest.id, items => [...items, newItem]);
            setAddSupplyId('');
            setAddQty('');
        } catch (e) {
            setAddError(e.message);
        } finally {
            setAddBusy(false);
        }
    };

    const deleteAddedItem = async (item) => {
        if (!viewingRequest) return;
        if (!confirm('¿Quitar este insumo agregado?')) return;
        try {
            const res = await fetch(`/api/supply-requests/items?item_id=${item.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('No se pudo borrar el ítem.');
            updateRequestItems(viewingRequest.id, items => items.filter(it => it.id !== item.id));
        } catch (e) {
            alert(e.message);
        }
    };

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

    const filteredRequests = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return requests;
        return requests.filter(r => r.service_name?.toLowerCase().includes(q));
    }, [requests, search]);

    return (
        <MainLayout>
            {viewingRequest && (
                <div className="modal-overlay" onClick={() => { setViewingRequest(null); setAddSupplyId(''); setAddQty(''); setAddError(''); }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                        <h2 style={{ marginBottom: '0.25rem' }}>Detalle del Pedido</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                            {viewingRequest.service_name} · {formatArgentinaDateTime(viewingRequest.created_at)}
                        </p>

                        {Array.isArray(viewingRequest.items) && viewingRequest.items.length > 0 ? (
                            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', marginBottom: '1rem' }}>
                                <div style={{ padding: '0.5rem 1rem', background: 'var(--color-muted-surface)', borderBottom: '1px solid var(--border-color)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Insumo</span><span>Cantidad</span>
                                </div>
                                {viewingRequest.items.map((item, i) => (
                                    <div key={item.id ?? i} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem',
                                        padding: '0.6rem 1rem',
                                        background: item.faltante ? '#FEF2F2' : 'transparent',
                                        borderBottom: i < viewingRequest.items.length - 1 ? '1px solid var(--border-color)' : 'none',
                                    }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                <span style={{ textDecoration: item.faltante ? 'line-through' : 'none', color: item.faltante ? '#B91C1C' : 'inherit' }}>
                                                    {item.nombre}
                                                </span>
                                                {item.faltante && (
                                                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#B91C1C', border: '1px solid #FECACA', background: '#fff', borderRadius: '999px', padding: '0.1rem 0.45rem' }}>FALTANTE</span>
                                                )}
                                                {item.agregado && (
                                                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#047857', border: '1px solid #A7F3D0', background: '#ECFDF5', borderRadius: '999px', padding: '0.1rem 0.45rem' }}>AGREGADO</span>
                                                )}
                                            </div>
                                            {item.unidad && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.unidad}</div>}
                                        </div>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>{item.cantidad}</span>
                                        {item.agregado && (
                                            <button
                                                type="button"
                                                onClick={() => deleteAddedItem(item)}
                                                title="Quitar agregado"
                                                style={{ background: 'transparent', border: 'none', color: '#B91C1C', cursor: 'pointer', fontSize: '1rem', padding: '0 0.25rem' }}
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>Este pedido no tiene insumos registrados.</p>
                        )}

                        <div style={{ border: '1px dashed var(--border-color)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                Agregar un insumo olvidado
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ flex: '1 1 200px', minWidth: '160px' }}>
                                    <SearchableSelect
                                        options={activeSupplies
                                            .filter(s => !(viewingRequest.items || []).some(it => Number(it.supply_id) === Number(s.id)))
                                            .map(s => ({ value: s.id, label: s.unidad ? `${s.nombre} (${s.unidad})` : s.nombre }))}
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
                                    disabled={addBusy || !addSupplyId || !Number(addQty)}
                                    onClick={addItem}
                                    style={{ fontSize: '0.85rem' }}
                                >
                                    {addBusy ? 'Agregando...' : '+ Agregar'}
                                </button>
                            </div>
                            {addError && <div style={{ color: 'var(--error)', fontSize: '0.8rem', marginTop: '0.4rem' }}>{addError}</div>}
                        </div>

                        {viewingRequest.notas?.trim() && (
                            <div style={{ background: 'var(--color-muted-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.875rem', marginBottom: '1rem' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>Notas</div>
                                {viewingRequest.notas}
                            </div>
                        )}

                        {viewingRequest.urgent && (
                            <div style={{ marginBottom: '1rem' }}>
                                <span className="badge badge-warning">URGENTE</span>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => { setViewingRequest(null); setAddSupplyId(''); setAddQty(''); setAddError(''); }}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="panel-max-wide">
                <div className="card" style={{ padding: 0 }}>
                    <div className="page-header" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <h1>Historico de Pedidos</h1>
                            <p style={{ color: 'var(--text-muted)' }}>
                                {currentUser
                                    ? `Pedidos enviados por ${currentUser.name} ${currentUser.surname}`
                                    : 'Listado de pedidos de insumos enviados por el supervisor'}
                            </p>
                        </div>
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por servicio..."
                            style={{
                                padding: '0.5rem 0.85rem',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                fontSize: '0.875rem',
                                background: 'var(--color-surface)',
                                color: 'var(--text-main)',
                                outline: 'none',
                                width: '220px',
                                flexShrink: 0,
                            }}
                        />
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
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRequests.length > 0 ? filteredRequests.map((request) => (
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
                                                <td className="historico-cell" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary"
                                                        onClick={() => setViewingRequest(request)}
                                                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                                                    >
                                                        Ver
                                                    </button>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr className="historico-empty-row">
                                                <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                                    {search ? 'No hay pedidos para ese servicio.' : 'Todavía no hay pedidos enviados.'}
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
