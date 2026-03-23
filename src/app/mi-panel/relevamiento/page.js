'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import MainLayout from '@/components/MainLayout';

function createRequestItem(supplyId = '') {
    return {
        localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        supply_id: supplyId,
        cantidad: '',
    };
}

function getDraftStorageKey(supervisorId) {
    return `supply-request-draft:${supervisorId}`;
}

export default function PedidosInsumosPage() {
    const supplyPickerRef = useRef(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [services, setServices] = useState([]);
    const [supplies, setSupplies] = useState([]);
    const [selectedServiceId, setSelectedServiceId] = useState('');
    const [requestItems, setRequestItems] = useState([]);
    const [supplyPickerValue, setSupplyPickerValue] = useState('');
    const [isUrgent, setIsUrgent] = useState(false);
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [draftReady, setDraftReady] = useState(false);

    useEffect(() => {
        async function loadInitialData() {
            try {
                setLoading(true);
                setError('');
                setFeedback(null);

                const storedUser = localStorage.getItem('currentUser');

                if (!storedUser) {
                    throw new Error('No se encontro una sesión activa.');
                }

                const parsedUser = JSON.parse(storedUser);
                setCurrentUser(parsedUser);

                const [servicesResponse, suppliesResponse] = await Promise.all([
                    fetch('/api/services'),
                    fetch('/api/supplies')
                ]);

                const servicesData = await servicesResponse.json().catch(() => ([]));
                const suppliesData = await suppliesResponse.json().catch(() => ([]));

                if (!servicesResponse.ok) {
                    throw new Error(servicesData.error || 'No se pudieron cargar los servicios.');
                }

                if (!suppliesResponse.ok) {
                    throw new Error(suppliesData.error || 'No se pudieron cargar los insumos.');
                }

                setServices(Array.isArray(servicesData) ? servicesData : []);
                setSupplies(Array.isArray(suppliesData) ? suppliesData : []);

                const draftKey = getDraftStorageKey(parsedUser.id);
                const savedDraft = localStorage.getItem(draftKey);

                if (savedDraft) {
                    const draft = JSON.parse(savedDraft);

                    if (draft?.selectedServiceId) {
                        setSelectedServiceId(String(draft.selectedServiceId));
                    }

                    if (Array.isArray(draft?.items) && draft.items.length > 0) {
                        setRequestItems(draft.items.map((item) => ({
                            localId: createRequestItem().localId,
                            supply_id: item.supply_id ? String(item.supply_id) : '',
                            cantidad: item.cantidad?.toString() || '',
                        })));
                    }

                    if (typeof draft?.notes === 'string') {
                        setNotes(draft.notes);
                    }

                    if (typeof draft?.isUrgent === 'boolean') {
                        setIsUrgent(draft.isUrgent);
                    }
                }
            } catch (loadError) {
                setError(loadError.message || 'No se pudieron cargar los servicios.');
            } finally {
                setLoading(false);
                setDraftReady(true);
            }
        }

        loadInitialData();
    }, []);

    const selectedSupplyIds = useMemo(() => {
        return requestItems
            .map((item) => item.supply_id)
            .filter(Boolean);
    }, [requestItems]);

    const allSuppliesSelected = useMemo(() => {
        return supplies.length > 0 && selectedSupplyIds.length >= supplies.length;
    }, [selectedSupplyIds, supplies]);

    const requestSummary = useMemo(() => {
        const itemsWithQuantity = requestItems.filter((item) => Number(item.cantidad) > 0).length;

        return {
            totalItems: requestItems.length,
            itemsWithQuantity,
        };
    }, [requestItems]);

    const hasDraftContent = useMemo(() => {
        return Boolean(selectedServiceId || notes.trim() || requestItems.length > 0 || isUrgent);
    }, [selectedServiceId, notes, requestItems, isUrgent]);

    const getSupplyById = (supplyId) => {
        return supplies.find((supply) => String(supply.id) === String(supplyId)) || null;
    };

    const updateRequestItem = (localId, field, value) => {
        setRequestItems((currentItems) => currentItems.map((item) => (
            item.localId === localId ? { ...item, [field]: value } : item
        )));
    };

    const handleAddSupplyToRequest = (supplyId) => {
        if (!supplyId) {
            setSupplyPickerValue('');
            return;
        }

        if (selectedSupplyIds.includes(String(supplyId))) {
            setError('Ese insumo ya fue agregado a la lista del pedido.');
            setFeedback(null);
            setSupplyPickerValue('');
            return;
        }

        setRequestItems((currentItems) => [...currentItems, createRequestItem(String(supplyId))]);
        setSupplyPickerValue('');
        setError('');
        setFeedback(null);
    };

    const removeRequestItem = (localId) => {
        setRequestItems((currentItems) => currentItems.filter((item) => item.localId !== localId));
    };

    const handleQuantityEnter = (event) => {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();
        supplyPickerRef.current?.focus();
    };

    const buildPayloadItems = () => {
        const invalidItem = requestItems.find((item) => (
            item.supply_id && (!item.cantidad || Number(item.cantidad) <= 0)
        ));

        if (invalidItem) {
            const supplyName = getSupplyById(invalidItem.supply_id)?.nombre || 'Uno de los insumos';
            throw new Error(`${supplyName} tiene la cantidad vacía o en cero. Completá todos los ítems antes de enviar el pedido.`);
        }

        const preparedItems = requestItems
            .filter((item) => item.supply_id && Number(item.cantidad) > 0)
            .map((item) => ({
                supply_id: Number(item.supply_id),
                cantidad: Number(item.cantidad),
            }));

        const uniqueSupplyIds = new Set(preparedItems.map((item) => item.supply_id));

        if (uniqueSupplyIds.size !== preparedItems.length) {
            throw new Error('No repitas el mismo insumo dentro del mismo pedido.');
        }

        return preparedItems;
    };

    const handleSaveDraft = () => {
        try {
            if (!currentUser?.id) {
                throw new Error('No se encontró un supervisor válido para guardar el borrador.');
            }

            const draftKey = getDraftStorageKey(currentUser.id);
            const draftPayload = {
                selectedServiceId,
                items: requestItems,
                isUrgent,
                notes,
            };

            localStorage.setItem(draftKey, JSON.stringify(draftPayload));
            setFeedback({ type: 'success', text: 'Borrador guardado correctamente.' });
            setError('');
        } catch (draftError) {
            setError(draftError.message || 'No se pudo guardar el borrador.');
            setFeedback(null);
        }
    };

    useEffect(() => {
        if (!draftReady || !currentUser?.id) {
            return;
        }

        const draftKey = getDraftStorageKey(currentUser.id);

        if (!hasDraftContent) {
            localStorage.removeItem(draftKey);
            return;
        }

        const draftPayload = {
            selectedServiceId,
            items: requestItems,
            isUrgent,
            notes,
        };

        localStorage.setItem(draftKey, JSON.stringify(draftPayload));
    }, [draftReady, currentUser, selectedServiceId, requestItems, isUrgent, notes, hasDraftContent]);

    const handleSubmit = async () => {
        try {
            if (!currentUser?.id || currentUser.role !== 'supervisor') {
                throw new Error('No se encontró una sesión válida de supervisor.');
            }

            if (!selectedServiceId) {
                throw new Error('Seleccioná una ubicación antes de guardar el pedido.');
            }

            const items = buildPayloadItems();

            if (items.length === 0) {
                throw new Error('Agregá al menos un insumo con cantidad para enviar el pedido.');
            }

            setIsSubmitting(true);
            setError('');
            setFeedback(null);

            const response = await fetch('/api/supply-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supervisor_id: currentUser.id,
                    service_id: Number(selectedServiceId),
                    notas: notes.trim(),
                    urgent: isUrgent,
                    items,
                })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || 'No se pudo guardar el pedido.');
            }

            localStorage.removeItem(getDraftStorageKey(currentUser.id));
            setRequestItems([]);
            setSupplyPickerValue('');
            setSelectedServiceId('');
            setIsUrgent(false);
            setNotes('');
            setFeedback({ type: 'success', text: 'Pedido guardado correctamente.' });
        } catch (submitError) {
            setError(submitError.message || 'No se pudo guardar el pedido.');
            setFeedback(null);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <MainLayout>
            <div className="panel-max-narrow">
                <div className="card">
                    <header className="page-header" style={{ marginBottom: '1.5rem' }}>
                        <div>
                            <h1>Pedidos Insumos</h1>
                            <p style={{ color: 'var(--text-muted)' }}>Vista inicial del modulo de pedidos</p>
                        </div>
                    </header>

                    <div className="form-group" style={{ marginBottom: '2rem' }}>
                        <label>Ubicacion</label>
                        <select
                            value={selectedServiceId}
                            onChange={(e) => setSelectedServiceId(e.target.value)}
                            disabled={loading || services.length === 0}
                        >
                            <option value="">
                                {loading
                                    ? 'Cargando servicios...'
                                    : services.length === 0
                                        ? 'No hay servicios cargados'
                                        : 'Seleccioná una ubicacion'}
                            </option>
                            {services.map((service) => (
                                <option key={service.id} value={service.id}>
                                    {service.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: '2rem' }}>
                        <div className="page-header" style={{ marginBottom: '1rem' }}>
                            <div>
                                <label style={{ marginBottom: 0 }}>Insumos solicitados</label>
                            </div>
                        </div>

                        <select
                            ref={supplyPickerRef}
                            value={supplyPickerValue}
                            onChange={(e) => {
                                const selectedValue = e.target.value;
                                setSupplyPickerValue(selectedValue);
                                handleAddSupplyToRequest(selectedValue);
                            }}
                            disabled={loading || supplies.length === 0}
                        >
                            <option value="">
                                {loading
                                    ? 'Cargando insumos...'
                                    : allSuppliesSelected
                                        ? 'Ya agregaste todos los insumos disponibles'
                                        : 'Seleccioná un insumo para agregarlo'}
                            </option>
                            {supplies.map((supply) => {
                                const alreadyInRequest = selectedSupplyIds.includes(String(supply.id));

                                return (
                                    <option key={supply.id} value={supply.id} disabled={alreadyInRequest}>
                                        {alreadyInRequest ? `${supply.nombre} - ya en el pedido` : supply.nombre}
                                    </option>
                                );
                            })}
                        </select>

                        <div style={{ display: 'grid', gap: '0.85rem', marginTop: '1rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                            <div
                                style={{
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 'var(--radius-md)',
                                    padding: '0.9rem 1rem',
                                    background: 'var(--color-surface)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    flexWrap: 'wrap'
                                }}
                            >
                                <div>
                                    <strong>Subtotal actual</strong>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                        {requestSummary.totalItems === 0
                                            ? 'Todavía no agregaste insumos.'
                                            : `${requestSummary.totalItems} insumo(s) en la lista para seguir editando.`}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span className="badge badge-secondary">
                                        {requestSummary.totalItems} agregado(s)
                                    </span>
                                    <span className={`badge ${requestSummary.itemsWithQuantity > 0 ? 'badge-success' : 'badge-warning'}`}>
                                        {requestSummary.itemsWithQuantity} con cantidad
                                    </span>
                                </div>
                            </div>

                            {requestItems.length === 0 ? null : requestItems.map((item, index) => {
                                const selectedSupply = getSupplyById(item.supply_id);

                                return (
                                    <div
                                        key={item.localId}
                                        style={{
                                            border: '1px solid var(--border-color)',
                                            borderRadius: 'var(--radius-md)',
                                            padding: '1rem',
                                            background: 'var(--color-muted-surface)',
                                            display: 'grid',
                                            gap: '0.85rem'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                                            <strong>{selectedSupply?.nombre || `Insumo #${index + 1}`}</strong>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                onClick={() => removeRequestItem(item.localId)}
                                                style={{ color: 'var(--error)' }}
                                            >
                                                Quitar
                                            </button>
                                        </div>

                                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                                            <label style={{ marginBottom: 0 }}>Cantidad</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                inputMode="numeric"
                                                placeholder="Ingresá la cantidad"
                                                value={item.cantidad}
                                                onChange={(e) => updateRequestItem(item.localId, 'cantidad', e.target.value)}
                                                onKeyDown={handleQuantityEnter}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {error ? (
                        <div style={{
                            marginBottom: '1rem',
                            padding: '0.85rem 1rem',
                            borderRadius: 'var(--radius-sm)',
                            background: '#FEE2E2',
                            color: '#991B1B',
                            fontWeight: 600
                        }}>
                            {error}
                        </div>
                    ) : null}

                    <div className="form-group" style={{ marginBottom: '2rem' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={isUrgent}
                                onChange={(e) => setIsUrgent(e.target.checked)}
                                style={{ width: 'auto', margin: 0 }}
                            />
                            Marcar pedido como urgente
                        </label>
                    </div>

                    <div className="form-group" style={{ marginBottom: '2rem' }}>
                        <label>Notas</label>
                        <textarea
                            rows="4"
                            placeholder="Observaciones adicionales del pedido"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>

                    {feedback ? (
                        <div style={{
                            marginBottom: '1rem',
                            padding: '0.85rem 1rem',
                            borderRadius: 'var(--radius-sm)',
                            background: '#DCFCE7',
                            color: '#166534',
                            fontWeight: 600
                        }}>
                            {feedback.text}
                        </div>
                    ) : null}

                    <div className="config-modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={handleSaveDraft} disabled={loading || isSubmitting}>
                            Guardar borrador
                        </button>
                        <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={loading || isSubmitting}>
                            {isSubmitting ? 'Guardando...' : 'Guardar'}
                        </button>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
