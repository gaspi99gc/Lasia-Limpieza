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
    const [services, setServices] = useState([]);
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
                const [supRes, attRes, servRes] = await Promise.all([
                    fetch('/api/supervisors'),
                    fetch('/api/attendance'),
                    fetch('/api/services')
                ]);

                if (supRes.ok) setSupervisors(await supRes.json());
                // If attendance API is implemented to return all, use it. Otherwise, empty array for now.
                if (attRes.ok) setAttendance(await attRes.json());
                if (servRes.ok) setServices(await servRes.json());
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
                                        <th>Tipo de Accion</th>
                                        <th>Estado GPS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {attendance.length > 0 ? attendance.map(att => {
                                        const sup = supervisors.find(s => s.id === att.supervisor_id);
                                        const serv = services.find(s => s.id === att.service_id);
                                        return (
                                            <tr key={att.id}>
                                                <td data-label="Fecha y Hora">{formatArgentinaDateTime(att.timestamp)}</td>
                                                <td data-label="Supervisor"><strong>{sup ? `${sup.surname}, ${sup.name}` : `ID: ${att.supervisor_id}`}</strong></td>
                                                <td data-label="Servicio">{serv ? serv.name : `Servicio ID: ${att.service_id}`}</td>
                                                <td data-label="Tipo de Accion">
                                                    <span className={`badge ${att.type === 'check-in' ? 'badge-success' : 'badge-danger'}`}>
                                                        {att.type === 'check-in' ? 'Entrada' : 'Salida'}
                                                    </span>
                                                </td>
                                                <td data-label="Estado GPS">
                                                    <div className="gps-badge-wrap" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
                                                        <span style={{ color: att.verified ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
                                                            {att.verified ? '✅ Verificado' : '⚠️ Lejos del rango'}
                                                        </span>
                                                        {att.distance_meters != null && (
                                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                                ({Math.round(att.distance_meters)}m)
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                                No hay registros de presentismo todavía.
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
                                                    disabled={downloadingSupervisorId === sup.id}
                                                >
                                                    <span className="desktop-only">{downloadingSupervisorId === sup.id ? 'Descargando...' : 'Descargar PDF'}</span>
                                                    <span className="mobile-only">{downloadingSupervisorId === sup.id ? '...' : '📄'}</span>
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
