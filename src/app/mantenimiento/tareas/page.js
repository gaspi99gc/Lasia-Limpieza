'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { getSessionUser } from '@/lib/session';

export default function MantenimientoTareasPage() {
    const router = useRouter();

    useEffect(() => {
        const user = getSessionUser();
        if (!user) { router.push('/login'); return; }
    }, [router]);

    return (
        <MainLayout>
            <div style={{ maxWidth: '760px', margin: '0 auto', padding: '1.25rem 1rem' }}>
                <h1 style={{ fontSize: 'clamp(1.3rem, 5vw, 1.6rem)', fontWeight: 700, margin: '0 0 0.4rem' }}>Tareas de mantenimiento</h1>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: '0 0 1.5rem' }}>
                    Control de tareas preventivas por servicio.
                </p>

                <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🚧</div>
                    <strong style={{ display: 'block', fontSize: '1.05rem', marginBottom: '0.4rem' }}>En proceso</strong>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                        Estamos trabajando en esta sección. Pronto vas a tener novedades.
                    </p>
                </div>
            </div>
        </MainLayout>
    );
}
