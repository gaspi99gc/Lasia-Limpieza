'use client';

import MainLayout from '@/components/MainLayout';

export default function MiPanelTecnicoPage() {
    return (
        <MainLayout>
            <div>
                <header className="page-header" style={{ marginBottom: '2rem' }}>
                    <div>
                        <h1>Panel del Supervisor Técnico</h1>
                    </div>
                </header>
                <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)' }}>
                    <p style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.5rem' }}>En construcción</p>
                    <p>Las tareas del Supervisor Técnico se van a habilitar próximamente.</p>
                </div>
            </div>
        </MainLayout>
    );
}
