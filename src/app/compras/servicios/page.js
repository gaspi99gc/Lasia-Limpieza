'use client';

import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';

export default function ComprasServiciosPage() {
    const [services, setServices] = useState([]);
    const [serviceSearchTerm, setServiceSearchTerm] = useState('');
    const [editingService, setEditingService] = useState(null);
    const [formData, setFormData] = useState({ name: '', address: '', lat: '', lng: '', geocodeCandidateId: '' });
    const [serviceCandidates, setServiceCandidates] = useState([]);
    const [serviceGeoState, setServiceGeoState] = useState({
        loading: false,
        text: '',
        type: 'idle',
        isValidated: false,
        validatedAddress: '',
        candidateId: '',
    });

    useEffect(() => {
        async function loadServices() {
            try {
                const response = await fetch('/api/services');
                if (response.ok) {
                    setServices(await response.json());
                }
            } catch (error) {
                console.error(error);
            }
        }

        loadServices();
    }, []);

    const getSearchableText = (value) => {
        return (value || '')
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    };

    const filteredServices = useMemo(() => {
        const normalizedSearch = getSearchableText(serviceSearchTerm);

        if (!normalizedSearch) {
            return services;
        }

        return services.filter((service) => {
            const haystack = getSearchableText(`${service.name} ${service.address}`);
            return haystack.includes(normalizedSearch);
        });
    }, [serviceSearchTerm, services]);

    const geocodeServiceAddress = async (address) => {
        const response = await fetch('/api/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || 'No se pudo ubicar la direccion ingresada.');
        }

        return data.candidates || [];
    };

    const resetServiceModal = () => {
        setEditingService(null);
        setServiceCandidates([]);
        setServiceGeoState({
            loading: false,
            text: '',
            type: 'idle',
            isValidated: false,
            validatedAddress: '',
            candidateId: '',
        });
    };

    const openServiceModal = (service = null) => {
        setEditingService(service || {});
        setServiceCandidates([]);

        const hasSavedLocation = Boolean(service?.address && service?.lat && service?.lng);
        setFormData(service ? {
            ...service,
            lat: service.lat ?? '',
            lng: service.lng ?? '',
            geocodeCandidateId: '',
        } : { name: '', address: '', lat: '', lng: '', geocodeCandidateId: '' });

        setServiceGeoState({
            loading: false,
            text: hasSavedLocation
                ? 'Direccion actual cargada. Si la cambias, validala de nuevo dentro de AMBA.'
                : 'Validá la direccion exacta dentro de AMBA antes de guardar.',
            type: 'info',
            isValidated: hasSavedLocation,
            validatedAddress: service?.address || '',
            candidateId: '',
        });
    };

    const handleServiceAddressChange = (value) => {
        const normalizedValue = value.trim();
        const keepValidatedAddress = normalizedValue && normalizedValue === serviceGeoState.validatedAddress;

        setFormData((current) => ({
            ...current,
            address: value,
            lat: keepValidatedAddress ? current.lat : '',
            lng: keepValidatedAddress ? current.lng : '',
            geocodeCandidateId: keepValidatedAddress ? serviceGeoState.candidateId : '',
        }));

        if (keepValidatedAddress) {
            return;
        }

        setServiceCandidates([]);
        setServiceGeoState({
            loading: false,
            text: normalizedValue ? 'La direccion cambio. Validala y elegi una coincidencia exacta dentro de AMBA.' : '',
            type: normalizedValue ? 'info' : 'idle',
            isValidated: false,
            validatedAddress: '',
            candidateId: '',
        });
    };

    const handleLookupServiceAddress = async () => {
        if (!formData.address?.trim()) {
            setServiceCandidates([]);
            setServiceGeoState({ loading: false, text: 'Ingresá la direccion exacta para ubicar el servicio.', type: 'error', isValidated: false, validatedAddress: '', candidateId: '' });
            return;
        }

        try {
            setServiceGeoState({ loading: true, text: 'Buscando direcciones exactas en AMBA...', type: 'info', isValidated: false, validatedAddress: '', candidateId: '' });
            const candidates = await geocodeServiceAddress(formData.address);
            setServiceCandidates(candidates);
            setServiceGeoState({
                loading: false,
                text: candidates.length === 1
                    ? 'Encontramos 1 direccion exacta en AMBA. Seleccionala para guardar.'
                    : `Encontramos ${candidates.length} direcciones exactas en AMBA. Elegi una para guardar.`,
                type: 'info',
                isValidated: false,
                validatedAddress: '',
                candidateId: '',
            });
        } catch (error) {
            setServiceCandidates([]);
            setFormData((current) => ({ ...current, lat: '', lng: '', geocodeCandidateId: '' }));
            setServiceGeoState({ loading: false, text: error.message || 'No se pudo ubicar la direccion.', type: 'error', isValidated: false, validatedAddress: '', candidateId: '' });
        }
    };

    const handleSelectServiceCandidate = (candidate) => {
        setServiceCandidates([]);
        setFormData((current) => ({
            ...current,
            address: candidate.address,
            lat: candidate.lat,
            lng: candidate.lng,
            geocodeCandidateId: candidate.id,
        }));
        setServiceGeoState({
            loading: false,
            text: `Direccion validada en AMBA: ${candidate.address}`,
            type: 'success',
            isValidated: true,
            validatedAddress: candidate.address,
            candidateId: candidate.id,
        });
    };

    const handleSaveService = async () => {
        const isEdit = Boolean(editingService?.id);

        if (!formData.name?.trim()) {
            alert('Ingresá el nombre del servicio.');
            return;
        }

        if (!formData.address?.trim()) {
            alert('Ingresá la direccion exacta del servicio.');
            return;
        }

        if (!serviceGeoState.isValidated || serviceGeoState.validatedAddress !== formData.address.trim()) {
            alert('Validá la direccion y elegí una coincidencia exacta dentro de AMBA antes de guardar.');
            return;
        }

        const payload = {
            ...formData,
            name: formData.name.trim(),
            address: formData.address.trim(),
            geocodeCandidateId: serviceGeoState.candidateId || formData.geocodeCandidateId || '',
        };

        try {
            setServiceGeoState((current) => ({ ...current, loading: true, text: 'Guardando servicio con direccion validada...', type: 'info' }));

            const response = await fetch(isEdit ? `/api/services/${editingService.id}` : '/api/services', {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setServiceGeoState((current) => ({ ...current, loading: false, text: data.error || current.text, type: 'error' }));
                alert(data.error || 'Error al guardar');
                return;
            }

            const savedService = data.id ? data : { ...payload, id: editingService?.id };
            setServices((current) => isEdit
                ? current.map((service) => service.id === editingService.id ? savedService : service)
                : [...current, savedService]
            );

            resetServiceModal();
        } catch (error) {
            console.error(error);
            setServiceGeoState((current) => ({ ...current, loading: false, text: error.message || 'No se pudo validar la direccion.', type: 'error' }));
            alert(error.message || 'Error de red');
        }
    };

    const handleDeleteService = async (serviceId) => {
        if (!confirm('¿Estás seguro de eliminar este servicio?')) return;

        try {
            const response = await fetch(`/api/services/${serviceId}`, { method: 'DELETE' });
            if (response.ok) {
                setServices((current) => current.filter((service) => service.id !== serviceId));
            } else {
                alert('No se pudo eliminar');
            }
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <MainLayout>
            <div className="config-view">
                <header className="page-header" style={{ marginBottom: '2rem' }}>
                    <div>
                        <h1>Servicios</h1>
                        <p style={{ color: 'var(--text-muted)' }}>Gestión de servicios disponible para Compras</p>
                    </div>
                </header>

                <div className="card" style={{ padding: 0 }}>
                    <div className="page-header" style={{ padding: '1.5rem', flexWrap: 'wrap' }}>
                        <h3>Lista de Servicios</h3>
                        <button className="btn btn-primary" onClick={() => openServiceModal()}>+ Añadir Servicio</button>
                    </div>
                    <div style={{ padding: '0 1.5rem 1rem' }}>
                        <input
                            type="text"
                            placeholder="Buscar por nombre o direccion..."
                            value={serviceSearchTerm}
                            onChange={(event) => setServiceSearchTerm(event.target.value)}
                            className="card"
                            style={{ margin: 0, width: '100%' }}
                        />
                    </div>
                    <div className="table-container">
                        <table className="table mobile-cards-table">
                            <thead>
                                <tr>
                                    <th>Servicio</th>
                                    <th>Ubicación</th>
                                    <th>Coordenadas</th>
                                    <th style={{ textAlign: 'right' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredServices.map((service) => (
                                    <tr key={service.id}>
                                        <td data-label="Servicio"><strong>{service.name}</strong></td>
                                        <td data-label="Ubicación">{service.address}</td>
                                        <td data-label="Coordenadas" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {service.lat && service.lng ? `${Number(service.lat)?.toFixed(4)}, ${Number(service.lng)?.toFixed(4)}` : (
                                                <span style={{ color: 'var(--warning)', fontWeight: 600 }}>⚠️ Sin GPS</span>
                                            )}
                                        </td>
                                        <td data-label="Acciones" className="mobile-hide-label" style={{ textAlign: 'right' }}>
                                            <div className="table-action-group">
                                                <button className="btn btn-secondary" onClick={() => openServiceModal(service)}>✏️</button>
                                                <button className="btn btn-secondary" style={{ color: 'var(--error)' }} onClick={() => handleDeleteService(service.id)}>🗑️</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredServices.length === 0 && (
                                    <tr>
                                        <td colSpan="4" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                                            {serviceSearchTerm ? 'No se encontraron servicios con esa busqueda.' : 'No hay servicios cargados todavia.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {editingService && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h2>{editingService.id ? 'Editar Servicio' : 'Crear Servicio'}</h2>
                            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <input
                                    type="text"
                                    placeholder="Nombre del Servicio"
                                    className="card"
                                    style={{ margin: 0 }}
                                    value={formData.name || ''}
                                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                                />
                                <input
                                    type="text"
                                    placeholder="Dirección"
                                    className="card"
                                    style={{ margin: 0 }}
                                    value={formData.address || ''}
                                    onChange={(event) => handleServiceAddressChange(event.target.value)}
                                />
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    Ingresá calle, altura y localidad. Solo se aceptan direcciones exactas dentro de AMBA.
                                </p>
                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <button className="btn btn-secondary" onClick={handleLookupServiceAddress} disabled={serviceGeoState.loading}>
                                        {serviceGeoState.loading ? 'Validando...' : '🧭 Validar direccion AMBA'}
                                    </button>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        {formData.lat && formData.lng ? `GPS: ${Number(formData.lat).toFixed(6)}, ${Number(formData.lng).toFixed(6)}` : 'GPS pendiente de validar'}
                                    </div>
                                </div>
                                {serviceCandidates.length > 0 ? (
                                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                                        {serviceCandidates.map((candidate) => (
                                            <button
                                                key={candidate.id}
                                                type="button"
                                                onClick={() => handleSelectServiceCandidate(candidate)}
                                                style={{
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: 'var(--radius-md)',
                                                    background: 'var(--color-surface)',
                                                    padding: '1rem',
                                                    textAlign: 'left',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <strong style={{ color: 'var(--text-main)' }}>{candidate.address}</strong>
                                                    <span className="badge badge-success">{candidate.type}</span>
                                                </div>
                                                <div style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    {candidate.city || 'AMBA'}{candidate.region ? `, ${candidate.region}` : ''} • Confianza {Math.round(candidate.score)}%
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                                {serviceGeoState.text ? (
                                    <div style={{
                                        padding: '0.85rem 1rem',
                                        borderRadius: 'var(--radius-sm)',
                                        background: serviceGeoState.type === 'success' ? '#DCFCE7' : serviceGeoState.type === 'error' ? '#FEE2E2' : '#E0F2FE',
                                        color: serviceGeoState.type === 'success' ? '#166534' : serviceGeoState.type === 'error' ? '#991B1B' : '#075985',
                                        fontSize: '0.9rem',
                                        lineHeight: 1.5
                                    }}>
                                        {serviceGeoState.text}
                                    </div>
                                ) : null}
                            </div>
                            <div className="config-modal-actions" style={{ marginTop: '2rem' }}>
                                <button className="btn btn-secondary" onClick={resetServiceModal}>Cancelar</button>
                                <button className="btn btn-primary" onClick={handleSaveService} disabled={serviceGeoState.loading}>
                                    {serviceGeoState.loading ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </MainLayout>
    );
}
