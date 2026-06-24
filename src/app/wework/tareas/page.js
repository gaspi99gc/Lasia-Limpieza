'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import MaintenanceTasksPanel from '@/components/MaintenanceTasksPanel';
import { getSessionUser } from '@/lib/session';

export default function WeWorkTareasPage() {
    const router = useRouter();

    useEffect(() => {
        const user = getSessionUser();
        if (!user) { router.push('/login'); return; }
    }, [router]);

    return (
        <MainLayout>
            <div className="wework-page">
                <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.4rem' }}>Tareas de mantenimiento</h1>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: '0 0 1.5rem' }}>
                    Elegí el servicio para ver el avance de las tareas preventivas y correctivas.
                </p>
                <MaintenanceTasksPanel canRegister={false} />
            </div>

            <style jsx>{`
                .wework-page {
                    max-width: 760px;
                    margin: 0 auto;
                    padding: 1.25rem 1rem calc(2rem + env(safe-area-inset-bottom));
                }
                @media (min-width: 700px) {
                    .wework-page {
                        padding: 1.75rem 1.25rem 3rem;
                    }
                }
            `}</style>
        </MainLayout>
    );
}
