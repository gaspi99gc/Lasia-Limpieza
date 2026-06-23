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
            <div>
                <header className="page-header" style={{ marginBottom: '1.5rem' }}>
                    <div>
                        <h1>Tickets de mantenimiento</h1>
                    </div>
                </header>
                <MantenimientoPanel />
            </div>
        </MainLayout>
    );
}
