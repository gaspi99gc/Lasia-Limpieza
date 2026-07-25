'use client';

import { useState } from 'react';
import MainLayout from '@/components/MainLayout';
import ServicesMap from '@/components/ServicesMap';
import ServiceDetailModal from '@/components/ServiceDetailModal';
import { useServices } from '@/hooks/queries/useServices';

export default function MapaServiciosPage() {
    const { data: services = [] } = useServices();
    const [detailServiceId, setDetailServiceId] = useState(null);

    return (
        <MainLayout>
            <div className="mapa-servicios-page">
                <header className="page-header mapa-servicios-header">
                    <div>
                        <h1>Mapa de Servicios</h1>
                        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            Ubicación geográfica de todas las sucursales y servicios activos en el AMBA.
                        </p>
                    </div>
                </header>

                <div className="card mapa-servicios-card">
                    <div className="mapa-servicios-map-wrap">
                        <ServicesMap
                            services={services}
                            height="100%"
                            onSelectService={(id) => setDetailServiceId(id)}
                        />
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
