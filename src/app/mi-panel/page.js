'use client';

import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';

export default function SupervisorHomePage() {
    const [currentUser, setCurrentUser] = useState(null);
    const [services, setServices] = useState([]);
    const [selectedServiceId, setSelectedServiceId] = useState('');
    const [status, setStatus] = useState('afuera');
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
                const storedUser = localStorage.getItem('currentUser');

                if (!storedUser) {
                    return;
                }

                const parsedUser = JSON.parse(storedUser);
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
                    localStorage.setItem('currentUser', JSON.stringify(resolvedUser));
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

            const response = await fetch('/api/supervisor-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supervisor_id: currentUser.id,
                    status: nextStatus,
                    service_id: nextStatus === 'chambeando' ? Number(selectedServiceId) : undefined
                })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || 'No se pudo actualizar el estado.');
            }

            setStatus(data.status || nextStatus);
            setSelectedServiceId(data.current_service_id ? String(data.current_service_id) : '');
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
                                {selectedService.address || 'Servicio sin direccion cargada'}
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
                        <p className="supervisor-home-status">
                            Estado actual: <strong>{status === 'chambeando' ? 'chambeando' : 'afuera'}</strong>
                            {status === 'chambeando' && selectedService ? ` en ${selectedService.name}` : ''}
                        </p>
                    ) : (
                        <p className="supervisor-home-error">{error}</p>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}
