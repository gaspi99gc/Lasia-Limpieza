'use client';

import { useState } from 'react';
import MainLayout from '@/components/MainLayout';
import SearchableSelect from '@/components/SearchableSelect';
import { useCatalog } from '@/lib/CatalogContext';

export default function ComprasCrearPedidoPage() {
    const { services, supervisors, supplies: allSupplies, loading: isLoading } = useCatalog();
    const supplies = allSupplies.filter(s => s.activo !== false);
    const [serviceId, setServiceId] = useState('');
    const [supervisorId, setSupervisorId] = useState('');
    const [items, setItems] = useState({});
    const [notes, setNotes] = useState('');
    const [urgent, setUrgent] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const setQty = (supplyId, qty) => {
        setItems(prev => {
            const next = { ...prev };
            if (!qty || qty <= 0) delete next[supplyId];
            else next[supplyId] = qty;
            return next;
        });
    };

    const totalItems = Object.values(items).filter(q => q > 0).length;

    const handleSubmit = async () => {
        const { default: Swal } = await import('sweetalert2');
        if (!serviceId) {
            Swal.fire({ title: 'Seleccioná un servicio', icon: 'warning', confirmButtonColor: '#ef4444' });
            return;
        }
        if (!supervisorId) {
            Swal.fire({ title: 'Seleccioná un supervisor', icon: 'warning', confirmButtonColor: '#ef4444' });
            return;
        }
        const requestItems = Object.entries(items)
            .filter(([, qty]) => qty > 0)
            .map(([supply_id, cantidad]) => ({ supply_id: Number(supply_id), cantidad: Number(cantidad) }));

        if (requestItems.length === 0) {
            Swal.fire({ title: 'Agregá al menos un insumo', icon: 'warning', confirmButtonColor: '#ef4444' });
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/supply-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supervisor_id: Number(supervisorId),
                    service_id: Number(serviceId),
                    items: requestItems,
                    notas: notes.trim(),
                    urgent,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al enviar el pedido');

            await Swal.fire({
                title: 'Pedido creado',
                text: 'El pedido fue registrado correctamente.',
                icon: 'success',
                confirmButtonColor: '#10b981',
            });
            setItems({});
            setNotes('');
            setUrgent(false);
            setServiceId('');
            setSupervisorId('');
        } catch (err) {
            Swal.fire({ title: 'Error', text: err.message, icon: 'error', confirmButtonColor: '#ef4444' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <MainLayout>
            <div style={{ maxWidth: '720px', margin: '0 auto' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Crear Pedido de Insumos</h1>
                </div>

                {isLoading ? (
                    <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                        {/* Servicio y Supervisor */}
                        <div className="card" style={{ padding: '1.5rem' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Asignación
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label>Servicio</label>
                                    <SearchableSelect
                                        options={services.map(s => ({ value: s.id, label: s.name }))}
                                        value={serviceId}
                                        onChange={setServiceId}
                                        placeholder="Seleccioná un servicio"
                                        searchPlaceholder="Buscar servicio..."
                                    />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label>Supervisor</label>
                                    <SearchableSelect
                                        options={supervisors.map(s => ({ value: s.id, label: `${s.surname}, ${s.name}` }))}
                                        value={supervisorId}
                                        onChange={setSupervisorId}
                                        placeholder="Seleccioná un supervisor"
                                        searchPlaceholder="Buscar supervisor..."
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Insumos */}
                        <div className="card" style={{ padding: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Insumos
                                </h3>
                                {totalItems > 0 && (
                                    <span className="badge badge-success">{totalItems} seleccionado{totalItems !== 1 ? 's' : ''}</span>
                                )}
                            </div>

                            {supplies.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay insumos disponibles.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                                    {supplies.map((supply, idx) => (
                                        <div
                                            key={supply.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '1rem',
                                                padding: '0.75rem 0',
                                                borderBottom: idx < supplies.length - 1 ? '1px solid var(--border-color)' : 'none',
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>{supply.nombre}</span>
                                                {supply.unidad && (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginLeft: '0.4rem' }}>({supply.unidad})</span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    style={{ width: '36px', height: '36px', padding: 0, fontSize: '1.2rem', lineHeight: 1, flexShrink: 0 }}
                                                    onClick={() => setQty(supply.id, Math.max(0, (items[supply.id] || 0) - 1))}
                                                >−</button>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={items[supply.id] || ''}
                                                    onChange={e => setQty(supply.id, Number(e.target.value))}
                                                    style={{
                                                        width: '4rem',
                                                        textAlign: 'center',
                                                        padding: '0.4rem 0.3rem',
                                                        borderRadius: 'var(--radius-sm)',
                                                        border: '1px solid var(--border-color)',
                                                        fontSize: '0.95rem',
                                                        background: items[supply.id] > 0 ? 'var(--color-primary-light)' : 'var(--color-surface)',
                                                        fontWeight: items[supply.id] > 0 ? 600 : 400,
                                                        color: 'var(--text-main)',
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    style={{ width: '36px', height: '36px', padding: 0, fontSize: '1.2rem', lineHeight: 1, flexShrink: 0 }}
                                                    onClick={() => setQty(supply.id, (items[supply.id] || 0) + 1)}
                                                >+</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Notas y urgente */}
                        <div className="card" style={{ padding: '1.5rem' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Detalles adicionales
                            </h3>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label>Notas (opcional)</label>
                                <textarea
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder="Aclaraciones sobre el pedido..."
                                    rows={3}
                                    style={{ width: '100%', resize: 'vertical' }}
                                />
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', userSelect: 'none' }}>
                                <input
                                    type="checkbox"
                                    checked={urgent}
                                    onChange={e => setUrgent(e.target.checked)}
                                    style={{ width: '18px', height: '18px', accentColor: 'var(--error)', cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>Marcar como urgente</span>
                                {urgent && <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>URGENTE</span>}
                            </label>
                        </div>

                        {/* Submit */}
                        <button
                            type="button"
                            className="btn btn-primary"
                            style={{ width: '100%', minHeight: '52px', fontSize: '1rem', fontWeight: 700, letterSpacing: '0.02em' }}
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Creando pedido...' : `Crear pedido${totalItems > 0 ? ` (${totalItems} insumo${totalItems !== 1 ? 's' : ''})` : ''}`}
                        </button>
                    </div>
                )}
            </div>
        </MainLayout>
    );
}
