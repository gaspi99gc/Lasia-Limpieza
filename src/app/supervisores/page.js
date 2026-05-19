'use client';

import { useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { useCatalog } from '@/lib/CatalogContext';

export default function SupervisoresPage() {
    const { supervisors } = useCatalog();
    const [downloadingSupervisorId, setDownloadingSupervisorId] = useState(null);

    const handleDownloadPresentismo = async (supervisor) => {
        const { default: Swal } = await import('sweetalert2');
        try {
            setDownloadingSupervisorId(supervisor.id);

            const response = await fetch(`/api/presentismo-pdf?supervisor_id=${supervisor.id}&days=7`);

            if (response.status === 404) {
                await Swal.fire({
                    title: 'Sin registros',
                    text: 'Este supervisor no tiene registros de presentismo en los últimos 7 días.',
                    icon: 'info',
                    confirmButtonColor: '#1f3a4a',
                });
                return;
            }

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Error del servidor (${response.status})`);
            }

            const blob = await response.blob();
            const filename = response.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1]
                ?? `Presentismo_${supervisor.surname}_${supervisor.name}.pdf`;

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (error) {
            console.error('Error descargando presentismo:', error);
            await Swal.fire({
                title: 'Error',
                text: error.message || 'No se pudo descargar el presentismo.',
                icon: 'error',
                confirmButtonColor: '#ef4444',
            });
        } finally {
            setDownloadingSupervisorId(null);
        }
    };

    return (
        <MainLayout>
            <div className="supervisores-view">
                <header className="page-header" style={{ marginBottom: '2rem' }}>
                    <h1>Supervisores</h1>
                </header>

                <div className="card" style={{ padding: 0 }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                        <h3>Directorio de Supervisores</h3>
                    </div>
                    <div className="table-container">
                        <table className="table mobile-cards-table">
                            <thead>
                                <tr>
                                    <th>Nombre Completo</th>
                                    <th>DNI</th>
                                    <th style={{ textAlign: 'right' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {supervisors.map(sup => (
                                    <tr key={sup.id}>
                                        <td data-label="Nombre Completo"><strong>{sup.surname}, {sup.name}</strong></td>
                                        <td data-label="DNI">{sup.dni}</td>
                                        <td data-label="Acciones" className="mobile-hide-label" style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    onClick={() => handleDownloadPresentismo(sup)}
                                                    disabled={!sup.id || downloadingSupervisorId === sup.id}
                                                >
                                                    <span className="desktop-only">{sup.id && downloadingSupervisorId === sup.id ? 'Descargando...' : 'Presentismo PDF'}</span>
                                                    <span className="mobile-only">{sup.id && downloadingSupervisorId === sup.id ? '...' : '📄'}</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
