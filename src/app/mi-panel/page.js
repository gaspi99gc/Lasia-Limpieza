'use client';

import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { getSessionUser, saveSession } from '@/lib/session';
import { useCatalog } from '@/lib/CatalogContext';
import { useNearbyServices, formatDistance } from '@/lib/useNearbyServices';

const SERVICE_NEAR_DISTANCE_METERS = 200;

function formatServiceAddress(address) {
    const rawAddress = address?.toString().trim();

    if (!rawAddress) {
        return 'Servicio sin direccion cargada';
    }

    const segments = rawAddress
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean);

    if (segments.length === 0) {
        return 'Servicio sin direccion cargada';
    }

    const streetSegment = segments[0];
    const buenosAiresSegment = segments.find((segment, index) => {
        if (index === 0) return false;
        return segment.toLowerCase().includes('buenos aires');
    });

    if (buenosAiresSegment) {
        return `${streetSegment}, ${buenosAiresSegment}`;
    }

    if (segments.length > 1) {
        return `${streetSegment}, ${segments[1]}`;
    }

    return streetSegment;
}

function getDistanceInMeters(lat1, lng1, lat2, lng2) {
    const earthRadius = 6371e3;
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(deltaPhi / 2) ** 2
        + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadius * c;
}

export default function SupervisorHomePage() {
    const [currentUser, setCurrentUser] = useState(null);
    const { services } = useCatalog();
    const { sortedServices, userLocation, locationLoading } = useNearbyServices(services);
    const [selectedServiceId, setSelectedServiceId] = useState('');
    const [searchText, setSearchText] = useState('');
    const [showResults, setShowResults] = useState(false);
    const [status, setStatus] = useState('afuera');
    const [entryCoordinates, setEntryCoordinates] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const selectedService = useMemo(() => {
        return services.find((service) => String(service.id) === selectedServiceId) || null;
    }, [selectedServiceId, services]);

    const normalize = (v) => (v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    const filteredServices = useMemo(() => {
        const q = normalize(searchText);
        const pool = q && !selectedServiceId
            ? sortedServices.filter((s) => normalize(s.name).includes(q) || normalize(s.address).includes(q))
            : sortedServices;

        if (!pool.length) return [];

        const [nearest, ...rest] = pool;
        const alphabetical = [...rest].sort((a, b) => a.name.localeCompare(b.name, 'es'));
        return [{ ...nearest, _recommended: true }, ...alphabetical];
    }, [searchText, selectedServiceId, sortedServices]);

    // Sync search text when initial status loads (supervisor already checked in)
    useEffect(() => {
        if (selectedServiceId && services.length > 0 && !searchText) {
            const service = services.find((s) => String(s.id) === selectedServiceId);
            if (service) setSearchText(service.name);
        }
    }, [selectedServiceId, services]);

    useEffect(() => {
        let cancelled = false;

        async function loadStatus() {
            try {
                const storedUser = getSessionUser();

                if (!storedUser) {
                    return;
                }

                const resolvedUser = storedUser;

                if (cancelled) return;

                setCurrentUser(resolvedUser);

                const supervisorId = Number(resolvedUser?.id);

                // Acceso rápido sin ID real — mostrar panel vacío
                if (!Number.isFinite(supervisorId) || supervisorId <= 0) {
                    setIsLoading(false);
                    return;
                }

                const response = await fetch(`/api/supervisor-status?supervisor_id=${supervisorId}`);
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(data.error || 'No se pudo obtener el estado actual.');
                }

                if (!cancelled) {
                    setStatus(data.status || 'afuera');
                    setSelectedServiceId(data.current_service_id ? String(data.current_service_id) : '');
                    setEntryCoordinates(
                        Number.isFinite(Number(data.entered_lat)) && Number.isFinite(Number(data.entered_lng))
                            ? { lat: Number(data.entered_lat), lng: Number(data.entered_lng) }
                            : null
                    );
                }

            } catch (loadError) {
                if (!cancelled) {
                    setError(loadError.message || 'No se pudo obtener el estado actual.');
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        loadStatus();

        return () => {
            cancelled = true;
        };
    }, []);


    const buttonLabel = useMemo(() => {
        if (isLoading) return 'CARGANDO...';
        return status === 'chambeando' ? 'SALIDA' : 'INGRESAR';
    }, [isLoading, status]);

    const getCurrentCoordinates = async () => {
        if (typeof window === 'undefined' || !navigator.geolocation) {
            throw new Error('Tu dispositivo no permite obtener la ubicacion exacta.');
        }

        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (position) => resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                }),
                (geoError) => reject(new Error(geoError.message || 'No se pudo obtener la ubicacion exacta del ingreso.')),
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0,
                }
            );
        });
    };

    const handleToggleStatus = async () => {
        if (!currentUser?.id || currentUser.id <= 0 || isLoading || isSaving) {
            return;
        }
        const { default: Swal } = await import('sweetalert2');

        const nextStatus = status === 'chambeando' ? 'afuera' : 'chambeando';

        if (nextStatus === 'chambeando' && !selectedServiceId) {
            setError('Seleccioná un servicio antes de ingresar.');
            return;
        }

        try {
            setIsSaving(true);
            setError('');

            const ingresoCoordinates = nextStatus === 'chambeando'
                ? await getCurrentCoordinates()
                : null;

            if (
                nextStatus === 'chambeando'
                && ingresoCoordinates
                && Number.isFinite(Number(selectedService?.lat))
                && Number.isFinite(Number(selectedService?.lng))
            ) {
                const distanceMeters = getDistanceInMeters(
                    ingresoCoordinates.lat,
                    ingresoCoordinates.lng,
                    Number(selectedService.lat),
                    Number(selectedService.lng)
                );

                if (distanceMeters > SERVICE_NEAR_DISTANCE_METERS) {
                    await Swal.fire({
                        title: 'No estas en el servicio',
                        text: `Segui igual. La ubicacion de ingreso se registro a ${Math.round(distanceMeters)} metros del servicio seleccionado.`,
                        icon: 'warning',
                        iconColor: '#ef4444',
                        confirmButtonText: 'Entendido',
                        confirmButtonColor: '#ef4444',
                        background: '#ffffff',
                    });
                }
            }

            const response = await fetch('/api/supervisor-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supervisor_id: currentUser.id,
                    status: nextStatus,
                    service_id: nextStatus === 'chambeando' ? Number(selectedServiceId) : undefined,
                    lat: ingresoCoordinates?.lat,
                    lng: ingresoCoordinates?.lng,
                })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || 'No se pudo actualizar el estado.');
            }

            setStatus(data.status || nextStatus);
            const newServiceId = data.current_service_id ? String(data.current_service_id) : '';
            setSelectedServiceId(newServiceId);
            if (!newServiceId) setSearchText('');
            setEntryCoordinates(
                Number.isFinite(Number(data.entered_lat)) && Number.isFinite(Number(data.entered_lng))
                    ? { lat: Number(data.entered_lat), lng: Number(data.entered_lng) }
                    : null
            );
        } catch (saveError) {
            setError(saveError.message || 'No se pudo actualizar el estado.');
        } finally {
            setIsSaving(false);
        }
    };


    return (
        <MainLayout>
            <div className="supervisor-home-view">
                <div className="supervisor-home-panel">
                    <div className="form-group supervisor-home-service-group">
                        <label>Ubicacion</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="text"
                                placeholder={
                                    isLoading ? 'Cargando servicios...'
                                    : services.length === 0 ? 'No hay servicios cargados'
                                    : 'Buscar servicio...'
                                }
                                value={searchText}
                                onChange={(e) => {
                                    setSearchText(e.target.value);
                                    setSelectedServiceId('');
                                    setShowResults(true);
                                }}
                                onFocus={() => { if (!selectedServiceId) setShowResults(true); }}
                                onBlur={() => setTimeout(() => setShowResults(false), 150)}
                                disabled={isLoading || isSaving || status === 'chambeando' || services.length === 0}
                                autoComplete="off"
                                style={{
                                    width: '100%',
                                    padding: '0.75rem 2.5rem 0.75rem 1rem',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--color-surface)',
                                    fontSize: '1rem',
                                    color: 'var(--text-main)',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                }}
                            />
                            {searchText && !isLoading && !isSaving && status !== 'chambeando' && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchText('');
                                        setSelectedServiceId('');
                                        setShowResults(false);
                                    }}
                                    style={{
                                        position: 'absolute', right: '0.75rem', top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: 'var(--text-muted)', fontSize: '1.1rem',
                                        lineHeight: 1, padding: '0.1rem 0.2rem',
                                        display: 'flex', alignItems: 'center',
                                    }}
                                    tabIndex={-1}
                                    aria-label="Limpiar"
                                >×</button>
                            )}
                            {showResults && !selectedServiceId && filteredServices.length > 0 && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                                    background: 'var(--color-surface)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 'var(--radius-md)',
                                    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                                    maxHeight: '220px', overflowY: 'auto',
                                    marginTop: '0.25rem',
                                }}>
                                    {filteredServices.map((service) => (
                                        <button
                                            key={service.id}
                                            type="button"
                                            onMouseDown={() => {
                                                setSelectedServiceId(String(service.id));
                                                setSearchText(service.name);
                                                setShowResults(false);
                                            }}
                                            style={{
                                                display: 'block', width: '100%', textAlign: 'left',
                                                padding: '0.75rem 1rem', background: service._recommended ? 'var(--color-primary-light, #f0f7ff)' : 'none', border: 'none',
                                                borderBottom: '1px solid var(--border-color)',
                                                cursor: 'pointer', color: 'var(--text-main)',
                                            }}
                                        >
                                            {service._recommended && (
                                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.15rem' }}>
                                                    Recomendado
                                                </div>
                                            )}
                                            <div style={{ fontWeight: 600 }}>{service.name}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>

                    <button
                        type="button"
                        className={`btn supervisor-home-button ${status === 'chambeando' ? 'supervisor-home-button-active' : 'btn-primary'}`}
                        onClick={handleToggleStatus}
                        disabled={isLoading || isSaving || !currentUser?.id || currentUser.id <= 0}
                    >
                        {isSaving ? 'GUARDANDO...' : buttonLabel}
                    </button>

                    {!error ? (
                        <>
                            <p className="supervisor-home-status">
                                Estado actual: <strong>{status === 'chambeando' ? 'chambeando' : 'afuera'}</strong>
                                {status === 'chambeando' && selectedService ? ` en ${selectedService.name}` : ''}
                            </p>
                        </>
                    ) : (
                        <p className="supervisor-home-error">{error}</p>
                    )}


                </div>
            </div>
        </MainLayout>
    );
}
