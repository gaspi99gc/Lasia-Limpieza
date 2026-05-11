'use client';

import MainLayout from '@/components/MainLayout';

export default function MaquinariaPage() {
    return (
        <MainLayout>
            <div>
                <header className="page-header" style={{ marginBottom: '2rem' }}>
                    <h1>Maquinaria</h1>
                </header>
                <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Módulo en construcción.
                </div>
            </div>
        </MainLayout>
    );
}
