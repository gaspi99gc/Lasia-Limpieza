'use client';

import { useState, useEffect } from 'react';
import MainLayout from '@/components/MainLayout';
import { formatArgentinaDateTime, getArgentinaDateStamp } from '@/lib/datetime';

async function loadPdfLogoDataUrl() {
    const response = await fetch('/branding/logo-lasia-limpieza.svg');

    if (!response.ok) {
        throw new Error('No se pudo cargar el logo para el PDF.');
    }

    const svgText = await response.text();
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    try {
        const image = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('No se pudo preparar el logo para el PDF.'));
            img.src = blobUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;

        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('No se pudo renderizar el logo para el PDF.');
        }

        context.drawImage(image, 0, 0);
        return canvas.toDataURL('image/png');
    } finally {
        URL.revokeObjectURL(blobUrl);
    }
}

export default function SupervisoresPage() {
    const [supervisors, setSupervisors] = useState([]);
    const [attendance, setAttendance] = useState([]);
    const [loading, setLoading] = useState(true);
    const [downloadingSupervisorId, setDownloadingSupervisorId] = useState(null);

    const handleDownloadPresentismo = async (supervisor) => {
        try {
            setDownloadingSupervisorId(supervisor.id);

            const response = await fetch(`/api/presentismo-logs?supervisor_id=${supervisor.id}&days=7`);
            const logs = await response.json().catch(() => ([]));

            if (!response.ok) {
                throw new Error(logs.error || 'No se pudo descargar el presentismo.');
            }

            if (!Array.isArray(logs) || logs.length === 0) {
                alert('Este supervisor no tiene registros de presentismo en los últimos 7 días.');
                return;
            }

            const [{ jsPDF }, { default: autoTable }] = await Promise.all([
                import('jspdf'),
                import('jspdf-autotable')
            ]);

            const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
            const supervisorFullName = `${supervisor.surname}, ${supervisor.name}`;
            const generatedAt = formatArgentinaDateTime(new Date());

            try {
                const logoDataUrl = await loadPdfLogoDataUrl();
                doc.addImage(logoDataUrl, 'PNG', 40, 28, 180, 57);
            } catch (logoError) {
                console.error(logoError);
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.text('Presentismo - Ultimos 7 dias', 40, 108);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(`Supervisor: ${supervisorFullName}`, 40, 130);
            doc.text(`DNI: ${supervisor.dni}`, 40, 146);
            doc.text(`Generado: ${generatedAt}`, 40, 162);

            autoTable(doc, {
                startY: 185,
                head: [[
                    'Fecha y hora',
                    'Supervisor',
                    'DNI',
                    'Servicio',
                    'Direccion',
                    'Evento'
                ]],
                body: logs.map((log) => ([
                    formatArgentinaDateTime(log.occurred_at),
                    `${log.supervisor_surname}, ${log.supervisor_name}`,
                    log.supervisor_dni,
                    log.service_name,
                    log.service_address || 'Sin direccion cargada',
                    log.event_type === 'ingreso' ? 'Ingreso' : 'Salida'
                ])),
                styles: {
                    font: 'helvetica',
                    fontSize: 9,
                    cellPadding: 6,
                    overflow: 'linebreak'
                },
                headStyles: {
                    fillColor: [31, 58, 74],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold'
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252]
                },
                columnStyles: {
                    0: { cellWidth: 110 },
                    1: { cellWidth: 110 },
                    2: { cellWidth: 70 },
                    3: { cellWidth: 110 },
                    4: { cellWidth: 240 },
                    5: { cellWidth: 70 }
                },
                margin: { left: 40, right: 40, bottom: 40 }
            });

            const fileSafeName = `${supervisor.surname}_${supervisor.name}`.replace(/[^a-zA-Z0-9_-]+/g, '_');
            doc.save(`Presentismo_${fileSafeName}_ultimos_7_dias_${getArgentinaDateStamp()}.pdf`);
        } catch (error) {
            alert(error.message || 'No se pudo descargar el presentismo.');
        } finally {
            setDownloadingSupervisorId(null);
        }
    };

    useEffect(() => {
        const loadData = async () => {
            try {
                const [supRes, logsRes] = await Promise.all([
                    fetch('/api/supervisors'),
                    fetch('/api/presentismo-logs?days=7'),
                ]);

                if (supRes.ok) setSupervisors(await supRes.json());
                if (logsRes.ok) setAttendance(await logsRes.json());
            } catch (err) {
                console.error("Error cargando datos:", err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    if (loading) return <MainLayout><div style={{ padding: '2rem' }}>Cargando datos...</div></MainLayout>;

    return (
        <MainLayout>
            <div className="supervisores-view">
                <header className="page-header" style={{ marginBottom: '2rem', flexWrap: 'wrap' }}>
                    <div>
                        <h1>Supervisores y Fichadas</h1>
                        <p style={{ color: 'var(--text-muted)' }}>Monitoreo de actividad de los supervisores en los servicios</p>
                    </div>
                </header>

                <div className="grid" style={{ gridTemplateColumns: '1fr', gap: '2rem' }}>
                    <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                            <h3>Registro de Presentismo Reciente</h3>
                        </div>
                        <div className="table-container">
                            <table className="table mobile-cards-table">
                                <thead>
                                    <tr>
                                        <th>Fecha y Hora</th>
                                        <th>Supervisor</th>
                                        <th>Servicio</th>
                                        <th>Evento</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {attendance.length > 0 ? attendance.map(log => (
                                        <tr key={log.id}>
                                            <td data-label="Fecha y Hora">{formatArgentinaDateTime(log.occurred_at)}</td>
                                            <td data-label="Supervisor">
                                                <strong>{log.supervisor_surname}, {log.supervisor_name}</strong>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>DNI: {log.supervisor_dni}</div>
                                            </td>
                                            <td data-label="Servicio">{log.service_name || 'Sin servicio'}</td>
                                            <td data-label="Evento">
                                                <span className={`badge ${log.event_type === 'ingreso' ? 'badge-success' : 'badge-secondary'}`}>
                                                    {log.event_type === 'ingreso' ? 'Ingreso' : 'Salida'}
                                                </span>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                                No hay registros de presentismo en los últimos 7 días.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

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
                                        <th style={{ textAlign: 'right' }}>Presentismo 7 días</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {supervisors.map(sup => (
                                        <tr key={sup.id}>
                                            <td data-label="Nombre Completo"><strong>{sup.surname}, {sup.name}</strong></td>
                                            <td data-label="DNI">{sup.dni}</td>
                                            <td data-label="Presentismo 7 días" className="mobile-hide-label" style={{ textAlign: 'right' }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    onClick={() => handleDownloadPresentismo(sup)}
                                                    disabled={!sup.id || downloadingSupervisorId === sup.id}
                                                >
                                                    <span className="desktop-only">{sup.id && downloadingSupervisorId === sup.id ? 'Descargando...' : 'Descargar PDF'}</span>
                                                    <span className="mobile-only">{sup.id && downloadingSupervisorId === sup.id ? '...' : '📄'}</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
