'use client';

import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';

export default function PedidosInsumosPage() {
    const [services, setServices] = useState([]);
    const [selectedServiceId, setSelectedServiceId] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        async function loadServices() {
            try {
                setLoading(true);
                setError('');

                const response = await fetch('/api/services');
                const data = await response.json().catch(() => ([]));

                if (!response.ok) {
                    throw new Error(data.error || 'No se pudieron cargar los servicios.');
                }

                setServices(Array.isArray(data) ? data : []);
            } catch (loadError) {
                setError(loadError.message || 'No se pudieron cargar los servicios.');
            } finally {
                setLoading(false);
            }
        }

        loadServices();
    }, []);

    const selectedService = useMemo(() => {
        return services.find((service) => String(service.id) === selectedServiceId) || null;
    }, [selectedServiceId, services]);

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
                        {error ? (
                            <p style={{ color: 'var(--error)', fontSize: '0.9rem', marginTop: '0.5rem' }}>{error}</p>
                        ) : null}
                        {!error && selectedService ? (
                            <div className="placeholder-field" style={{ marginTop: '0.75rem' }}>
                                {selectedService.address || 'Servicio sin direccion cargada'}
                            </div>
                        ) : null}
                    </div>

                    <div className="config-modal-actions">
                        <button type="button" className="btn btn-secondary">Guardar borrador</button>
                        <button type="button" className="btn btn-primary">Guardar</button>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
