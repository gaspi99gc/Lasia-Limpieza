'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import MantenimientoPanel from '@/components/MantenimientoPanel';
import { getSessionUser } from '@/lib/session';

export default function MantenimientoPage() {
    const router = useRouter();

    useEffect(() => {
        const user = getSessionUser();
        if (!user) { router.push('/login'); return; }
    }, [router]);

    return (
        <MainLayout>
            <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                <h1 style={{ fontSize: 'clamp(1.3rem, 5vw, 1.6rem)', fontWeight: 700, margin: '0 0 1.25rem' }}>
                    Tickets de mantenimiento
                </h1>
                <MantenimientoPanel />
            </div>
        </MainLayout>
    );
}
