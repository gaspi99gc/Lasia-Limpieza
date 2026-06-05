'use client';

import { useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import ServiceDetailModal from '@/components/ServiceDetailModal';
import { useServices } from '@/hooks/queries/useServices';

function normalize(value) {
    return (value || '')
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

export default function OperacionesServiciosPage() {
    const { data: services = [] } = useServices();
    const [search, setSearch] = useState('');
    const [detailServiceId, setDetailServiceId] = useState(null);

    const filtered = useMemo(() => {
        const q = normalize(search);
        if (!q) return services;
        return services.filter(s => normalize(`${s.name} ${s.address}`).includes(q));
    }, [services, search]);

    return (
        <MainLayout>
            <div className="config-view">
                <header className="page-header" style={{ marginBottom: '2rem' }}>
                    <div>
                        <h1>Servicios</h1>
                        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            Lista de todos los servicios. Hacé click en el nombre para ver el detalle.
                        </p>
                    </div>
                </header>

                <div className="card" style={{ padding: 0 }}>
                    <div className="page-header" style={{ padding: '1.5rem' }}>
                        <h3>Lista de Servicios</h3>
                    </div>
                    <div style={{ padding: '0 1.5rem 1rem' }}>
                        <input
                            type="text"
                            placeholder="Buscar por nombre o dirección..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
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
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(service => (
                                    <tr key={service.id}>
                                        <td data-label="Servicio">
                                            <button
                                                type="button"
                                                className="service-detail-name-btn"
                                                onClick={() => setDetailServiceId(service.id)}
                                            >
                                                {service.name}
                                            </button>
                                        </td>
                                        <td data-label="Ubicación">{service.address}</td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan="2" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                                            {search ? 'Sin resultados.' : 'No hay servicios cargados.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {detailServiceId && (
                    <ServiceDetailModal
                        serviceId={detailServiceId}
                        onClose={() => setDetailServiceId(null)}
                    />
                )}
            </div>
        </MainLayout>
    );
}
