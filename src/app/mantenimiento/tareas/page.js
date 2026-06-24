'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import MaintenanceTasksPanel from '@/components/MaintenanceTasksPanel';
import { getSessionUser } from '@/lib/session';

export default function MantenimientoTareasPage() {
    const router = useRouter();

    useEffect(() => {
        const user = getSessionUser();
        if (!user) { router.push('/login'); return; }
    }, [router]);

    return (
        <MainLayout>
            <div style={{ maxWidth: '760px', margin: '0 auto', padding: '1.25rem 1rem 3rem' }}>
                <h1 style={{ fontSize: 'clamp(1.3rem, 5vw, 1.6rem)', fontWeight: 700, margin: '0 0 0.4rem' }}>Tareas de mantenimiento</h1>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: '0 0 1.5rem' }}>
                    Elegí el servicio y registrá las tareas preventivas y correctivas a medida que las realizás.
                </p>
                <MaintenanceTasksPanel canRegister />
            </div>
        </MainLayout>
    );
}
