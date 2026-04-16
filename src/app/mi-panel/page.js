'use client';

import { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import MainLayout from '@/components/MainLayout';
import { getSessionUser, saveSession } from '@/lib/session';

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
    const [services, setServices] = useState([]);
    const [selectedServiceId, setSelectedServiceId] = useState('');
    const [status, setStatus] = useState('afuera');
    const [entryCoordinates, setEntryCoordinates] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const selectedService = useMemo(() => {
        return services.find((service) => String(service.id) === selectedServiceId) || null;
    }, [selectedServiceId, services]);

    useEffect(() => {
        let cancelled = false;

        async function loadStatus() {
            try {
                const storedUser = getSessionUser();

                if (!storedUser) {
                    return;
                }

                const parsedUser = storedUser;
                let resolvedUser = parsedUser;

                if (
                    parsedUser.role === 'supervisor'
                    && (!parsedUser.id || Number(parsedUser.id) <= 0)
                    && parsedUser.dni === 'supervisor'
                ) {
                    const loginResponse = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: 'supervisor', password: 'supervisor' })
                    });

                    const loginData = await loginResponse.json().catch(() => ({}));

                    if (!loginResponse.ok || !loginData.user) {
                        throw new Error(loginData.error || 'No se pudo restaurar el perfil del supervisor. Volvé a iniciar sesión.');
                    }

                    resolvedUser = loginData.user;
                    saveSession(resolvedUser);
                }

                if (cancelled) {
                    return;
                }

                setCurrentUser(resolvedUser);

                const supervisorId = Number(resolvedUser?.id);

                if (resolvedUser?.role !== 'supervisor' || !Number.isFinite(supervisorId) || supervisorId <= 0) {
                    throw new Error('El perfil del supervisor no es valido. Volvé a iniciar sesión.');
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

                const servicesResponse = await fetch('/api/services');
                const servicesData = await servicesResponse.json().catch(() => ([]));

                if (!servicesResponse.ok) {
                    throw new Error(servicesData.error || 'No se pudieron cargar los servicios.');
                }

                if (!cancelled) {
                    setServices(Array.isArray(servicesData) ? servicesData : []);
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
            setSelectedServiceId(data.current_service_id ? String(data.current_service_id) : '');
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
                        <select
                            value={selectedServiceId}
                            onChange={(e) => setSelectedServiceId(e.target.value)}
                            disabled={isLoading || isSaving || status === 'chambeando' || services.length === 0}
                        >
                            <option value="">
                                {isLoading
                                    ? 'Cargando servicios...'
                                    : services.length === 0
                                        ? 'No hay servicios cargados'
                                        : 'Seleccioná un servicio'}
                            </option>
                            {services.map((service) => (
                                <option key={service.id} value={service.id}>
                                    {service.name}
                                </option>
                            ))}
                        </select>

                        {selectedService ? (
                            <div className="placeholder-field" style={{ marginTop: '0.75rem' }}>
                                {formatServiceAddress(selectedService.address)}
                            </div>
                        ) : null}
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
                            {status === 'chambeando' && entryCoordinates ? (
                                <p className="supervisor-home-status">
                                    Coordenadas de ingreso: <strong>{entryCoordinates.lat.toFixed(6)}, {entryCoordinates.lng.toFixed(6)}</strong>
                                </p>
                            ) : null}
                        </>
                    ) : (
                        <p className="supervisor-home-error">{error}</p>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}
