'use client';

import { useState, useRef } from 'react';
import MainLayout from '@/components/MainLayout';
import { useCatalog } from '@/lib/CatalogContext';

export default function AltaPersonalPage() {
    const { services } = useCatalog();
    const [showForm, setShowForm] = useState(false);
    const [nextLegajo, setNextLegajo] = useState('');
    const [loadingLegajo, setLoadingLegajo] = useState(false);
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);
    const fileInputRef = useRef(null);

    const handleOpenForm = async () => {
        setLoadingLegajo(true);
        try {
            const res = await fetch('/api/employees/next-legajo');
            const json = await res.json();
            setNextLegajo(String(json.nextLegajo ?? ''));
        } catch {
            setNextLegajo('');
        } finally {
            setLoadingLegajo(false);
        }
        setShowForm(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const { default: Swal } = await import('sweetalert2');
        setSaving(true);
        try {
            const formData = new FormData(e.target);
            const empData = {
                legajo: formData.get('legajo'),
                nombre: formData.get('nombre'),
                apellido: formData.get('apellido'),
                dni: formData.get('dni'),
                cuil: formData.get('cuil'),
                celular: formData.get('celular') || null,
                fecha_ingreso: formData.get('fecha_ingreso') || null,
                servicio_id: formData.get('servicio_id') || null,
            };

            const res = await fetch('/api/employees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(empData),
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Error al guardar');

            setShowForm(false);

            const { isConfirmed } = await Swal.fire({
                title: `Legajo ${empData.legajo} creado`,
                text: `${empData.apellido}, ${empData.nombre} fue dado de alta correctamente.`,
                icon: 'success',
                showCancelButton: true,
                confirmButtonText: 'Ir a Nómina',
                cancelButtonText: 'Agregar otro',
                confirmButtonColor: '#1f3a4a',
            });

            if (isConfirmed) {
                window.location.href = '/rrhh?tab=personal';
            } else {
                handleOpenForm();
            }
        } catch (err) {
            const { default: Swal } = await import('sweetalert2');
            await Swal.fire({ title: 'Error', text: err.message, icon: 'error', confirmButtonColor: '#ef4444' });
        } finally {
            setSaving(false);
        }
    };

    const handleDownloadTemplate = async () => {
        const XLSX = await import('xlsx');
        const headers = ['Legajo', 'Nombre', 'Apellido', 'DNI', 'CUIL', 'Celular', 'Fecha Ingreso'];
        const example = ['1901', 'Juan', 'García', '12345678', '20-12345678-0', '11 1234-5678', '01/01/2025'];
        const ws = XLSX.utils.aoa_to_sheet([headers, example]);

        // Column widths
        ws['!cols'] = [14, 18, 18, 14, 18, 16, 16].map(w => ({ wch: w }));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Personal');
        XLSX.writeFile(wb, 'Modelo_Alta_Personal.xlsx');
    };

    const handleFileUpload = async (e) => {
        const { default: Swal } = await import('sweetalert2');
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';

        setImporting(true);
        try {
            const XLSX = await import('xlsx');
            const bstr = await file.arrayBuffer();
            const wb = XLSX.read(bstr, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws);

            let added = 0;
            let skipped = 0;

            for (const row of rows) {
                const legajo = String(row.Legajo || row.legajo || '').trim();
                const empData = {
                    legajo: legajo || null,
                    nombre: String(row.Nombre || row.nombre || '').trim(),
                    apellido: String(row.Apellido || row.apellido || '').trim(),
                    dni: String(row.DNI || row.dni || '').trim() || null,
                    cuil: String(row.CUIL || row.cuil || '').trim() || null,
                    celular: String(row.Celular || row.celular || '').trim() || null,
                    fecha_ingreso: String(row['Fecha Ingreso'] || row.fecha_ingreso || '').trim() || null,
                    servicio_id: row.ServicioID || row.servicio_id || null,
                };

                if (!empData.nombre || !empData.apellido) { skipped++; continue; }

                const res = await fetch('/api/employees', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(empData),
                });

                if (res.ok) added++;
                else skipped++;
            }

            await Swal.fire({
                title: 'Importación completa',
                html: `<strong>${added}</strong> empleado${added !== 1 ? 's' : ''} importado${added !== 1 ? 's' : ''}${skipped > 0 ? `<br><span style="color:var(--text-muted);font-size:0.9rem">${skipped} omitido${skipped !== 1 ? 's' : ''} (legajo duplicado o datos incompletos)</span>` : ''}`,
                icon: 'success',
                confirmButtonColor: '#1f3a4a',
                confirmButtonText: 'Ver Nómina',
                showCancelButton: true,
                cancelButtonText: 'Cerrar',
            }).then(r => { if (r.isConfirmed) window.location.href = '/rrhh?tab=personal'; });
        } catch (err) {
            await Swal.fire({ title: 'Error al importar', text: err.message, icon: 'error', confirmButtonColor: '#ef4444' });
        } finally {
            setImporting(false);
        }
    };

    return (
        <MainLayout>
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
                        <h2>Alta de Nuevo Legajo</h2>
                        <form onSubmit={handleSave} style={{ marginTop: '1.5rem' }}>
                            <div className="employee-form-grid">
                                <div className="form-group">
                                    <label>Legajo</label>
                                    <input name="legajo" required defaultValue={nextLegajo} />
                                </div>
                                <div className="form-group">
                                    <label>DNI</label>
                                    <input name="dni" required />
                                </div>
                                <div className="form-group">
                                    <label>Nombre</label>
                                    <input name="nombre" required />
                                </div>
                                <div className="form-group">
                                    <label>Apellido</label>
                                    <input name="apellido" required />
                                </div>
                                <div className="form-group">
                                    <label>CUIL</label>
                                    <input name="cuil" required />
                                </div>
                                <div className="form-group">
                                    <label>Fecha Ingreso</label>
                                    <input name="fecha_ingreso" type="date" required />
                                </div>
                                <div className="form-group">
                                    <label>Celular</label>
                                    <input name="celular" type="tel" placeholder="Ej: 11 1234-5678" />
                                </div>
                                <div className="form-group">
                                    <label>Servicio Asignado</label>
                                    <select name="servicio_id" defaultValue="">
                                        <option value="">Ninguno</option>
                                        {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="config-modal-actions" style={{ marginTop: '2rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Guardando...' : 'Guardar Legajo'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="panel-max-wide">
                <header className="page-header" style={{ marginBottom: '2rem' }}>
                    <div>
                        <h1>Alta de Personal</h1>
                        <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            Registrá nuevos empleados de forma individual o importá una tanda desde Excel.
                        </p>
                    </div>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                    {/* Alta individual */}
                    <div className="card" style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '10px',
                                background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M20 8v6" /><path d="M23 11h-6" />
                                </svg>
                            </div>
                            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Alta Individual</h2>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.75rem', lineHeight: 1.6 }}>
                            Cargá un empleado a la vez. El número de legajo se genera automáticamente tomando el último registrado como base.
                        </p>
                        <button
                            className="btn btn-primary"
                            onClick={handleOpenForm}
                            disabled={loadingLegajo}
                            style={{ width: '100%' }}
                        >
                            {loadingLegajo ? 'Calculando legajo...' : '+ Nuevo Legajo'}
                        </button>
                    </div>

                    {/* Importación masiva */}
                    <div className="card" style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '10px',
                                background: 'var(--color-surface-raised, #2a3a4a)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: '1px solid var(--border-color)',
                            }}>
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--text-main)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                            </div>
                            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Importación Masiva</h2>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.75rem', lineHeight: 1.6 }}>
                            Subí un Excel con múltiples empleados a la vez. Descargá el modelo para ver el formato esperado de las columnas.
                        </p>

                        <div style={{ background: 'var(--color-muted-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.4rem' }}>Columnas esperadas:</strong>
                            Legajo · Nombre · Apellido · DNI · CUIL · Celular · Fecha Ingreso
                        </div>

                        <input type="file" ref={fileInputRef} hidden onChange={handleFileUpload} accept=".xlsx,.csv" />

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={handleDownloadTemplate}
                                style={{ width: '100%' }}
                            >
                                📥 Descargar Modelo Excel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => fileInputRef.current.click()}
                                disabled={importing}
                                style={{ width: '100%' }}
                            >
                                {importing ? 'Importando...' : '📤 Subir Excel'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
