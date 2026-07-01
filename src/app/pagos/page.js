'use client';

import MainLayout from '@/components/MainLayout';

export default function PagosPage() {
    return (
        <MainLayout>
            <div className="config-view">
                <header className="page-header" style={{ marginBottom: '2rem' }}>
                    <div>
                        <h1>Pagos</h1>
                    </div>
                </header>

                <div
                    className="card"
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        padding: '4rem 2rem',
                        gap: '1rem',
                    }}
                >
                    <div style={{ fontSize: '3rem', lineHeight: 1 }}>🚧</div>
                    <h2 style={{ margin: 0, color: 'var(--text-main)' }}>Sección en construcción</h2>
                    <p style={{ margin: 0, color: 'var(--text-muted)', maxWidth: '460px', lineHeight: 1.6 }}>
                        Estamos trabajando en el módulo de Pagos. Muy pronto vas a poder gestionarlo desde acá.
                    </p>
                </div>
            </div>
        </MainLayout>
    );
}
