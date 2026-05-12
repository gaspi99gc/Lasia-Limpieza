'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { useCatalog } from '@/lib/CatalogContext';

function EyeIcon({ open }) {
    return open ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
    ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
    );
}

function PasswordInput({ placeholder, value, onChange, show, onToggle }) {
    return (
        <div style={{ position: 'relative' }}>
            <input
                type={show ? 'text' : 'password'}
                placeholder={placeholder}
                className="card"
                style={{ margin: 0, width: '100%', paddingRight: '2.5rem' }}
                value={value}
                onChange={onChange}
            />
            <button type="button" onClick={onToggle} tabIndex={-1} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}>
                <EyeIcon open={show} />
            </button>
        </div>
    );
}

function TabReader({ onTab }) {
    const params = useSearchParams();
    useEffect(() => {
        const tab = params.get('tab');
        onTab(tab && ['supervisors', 'services', 'supplies'].includes(tab) ? tab : 'supervisors');
    }, [params, onTab]);
    return null;
}

export default function ConfigPage() {
    const [configTab, setConfigTab] = useState('supervisors');
    const [editingEntity, setEditingEntity] = useState(null);
    const [formData, setFormData] = useState({});
    const { supervisors, services, supplies, refetch: refetchCatalog } = useCatalog();
    const [showModalPassword, setShowModalPassword] = useState(false);
    const [showModalConfirmPassword, setShowModalConfirmPassword] = useState(false);
    const [serviceSearchTerm, setServiceSearchTerm] = useState('');
    const [suppliesImportModal, setSuppliesImportModal] = useState(null);
    const [serviceGeoState, setServiceGeoState] = useState({
        loading: false,
        text: '',
        type: 'idle',
        isValidated: false,
        validatedAddress: '',
        candidateId: '',
    });
    const [serviceCandidates, setServiceCandidates] = useState([]);
    const [importModal, setImportModal] = useState(null);

    const getSearchableText = (value) => {
        return (value || '')
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '');
    };

    const geocodeServiceAddress = async (address) => {
        const res = await fetch('/api/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'No se pudo ubicar la direccion ingresada.');
        return data.candidates || [];
    };

    const closeModal = () => {
        setEditingEntity(null);
        setServiceCandidates([]);
        setShowModalPassword(false);
        setShowModalConfirmPassword(false);
        setServiceGeoState({ loading: false, text: '', type: 'idle', isValidated: false, validatedAddress: '', candidateId: '' });
    };

    const openModal = (type, data = null) => {
        setEditingEntity({ type, data });
        setServiceCandidates([]);
        if (type === 'supervisor') {
            setFormData(data ? {
                ...data,
                login_enabled: data.login_enabled !== false,
                password: '',
                confirmPassword: '',
            } : {
                name: '',
                surname: '',
                dni: '',
                login_enabled: true,
                password: '',
                confirmPassword: '',
            });
            setServiceGeoState({ loading: false, text: '', type: 'idle', isValidated: false, validatedAddress: '', candidateId: '' });
        } else if (type === 'service') {
            const hasSavedLocation = Boolean(data?.address && data?.lat && data?.lng);
            setFormData(data ? {
                ...data,
                lat: data.lat ?? '',
                lng: data.lng ?? '',
                geocodeCandidateId: '',
            } : { name: '', address: '', lat: '', lng: '', geocodeCandidateId: '' });
            setServiceGeoState({
                loading: false,
                text: hasSavedLocation
                    ? 'Direccion actual cargada. Si la cambias, validala de nuevo dentro de AMBA.'
                    : 'Validá la direccion exacta dentro de AMBA antes de guardar.',
                type: 'info',
                isValidated: hasSavedLocation,
                validatedAddress: data?.address || '',
                candidateId: '',
            });
        } else if (type === 'supply') {
            setFormData(data || { nombre: '', unidad: '', proveedor: '', activo: true });
            setServiceGeoState({ loading: false, text: '', type: 'idle', isValidated: false, validatedAddress: '', candidateId: '' });
        }
    };

    const handleServiceAddressChange = (value) => {
        const normalizedValue = value.trim();
        const keepValidatedAddress = normalizedValue && normalizedValue === serviceGeoState.validatedAddress;
        setFormData(prev => ({
            ...prev,
            address: value,
            lat: keepValidatedAddress ? prev.lat : '',
            lng: keepValidatedAddress ? prev.lng : '',
            geocodeCandidateId: keepValidatedAddress ? serviceGeoState.candidateId : '',
        }));
        if (keepValidatedAddress) return;
        setServiceCandidates([]);
        setServiceGeoState({
            loading: false,
            text: normalizedValue ? 'La direccion cambio. Validala y elegi una coincidencia exacta dentro de AMBA.' : '',
            type: normalizedValue ? 'info' : 'idle',
            isValidated: false,
            validatedAddress: '',
            candidateId: '',
        });
    };

    const handleLookupServiceAddress = async () => {
        if (!formData.address?.trim()) {
            setServiceCandidates([]);
            setServiceGeoState({ loading: false, text: 'Ingresá la direccion exacta para ubicar el servicio.', type: 'error', isValidated: false, validatedAddress: '', candidateId: '' });
            return;
        }
        try {
            setServiceGeoState({ loading: true, text: 'Buscando direcciones exactas en AMBA...', type: 'info', isValidated: false, validatedAddress: '', candidateId: '' });
            const candidates = await geocodeServiceAddress(formData.address);
            setServiceCandidates(candidates);
            setServiceGeoState({
                loading: false,
                text: candidates.length === 1
                    ? 'Encontramos 1 direccion exacta en AMBA. Seleccionala para guardar.'
                    : `Encontramos ${candidates.length} direcciones exactas en AMBA. Elegi una para guardar.`,
                type: 'info',
                isValidated: false,
                validatedAddress: '',
                candidateId: '',
            });
        } catch (error) {
            setServiceCandidates([]);
            setFormData(prev => ({ ...prev, lat: '', lng: '', geocodeCandidateId: '' }));
            setServiceGeoState({ loading: false, text: error.message || 'No se pudo ubicar la direccion.', type: 'error', isValidated: false, validatedAddress: '', candidateId: '' });
        }
    };

    const handleSelectServiceCandidate = (candidate) => {
        setServiceCandidates([]);
        setFormData(prev => ({
            ...prev,
            address: candidate.address,
            lat: candidate.lat,
            lng: candidate.lng,
            geocodeCandidateId: candidate.id,
        }));
        setServiceGeoState({
            loading: false,
            text: `Direccion validada en AMBA: ${candidate.address}`,
            type: 'success',
            isValidated: true,
            validatedAddress: candidate.address,
            candidateId: candidate.id,
        });
    };

    const handleSave = async () => {
        const type = editingEntity.type;
        const isEdit = !!editingEntity.data;
        let endpoint = '/api/services';
        if (type === 'supervisor') endpoint = '/api/supervisors';
        else if (type === 'supply') endpoint = '/api/supplies';
        const url = isEdit ? `${endpoint}/${editingEntity.data.id}` : endpoint;
        const method = isEdit ? 'PUT' : 'POST';
        let payload = formData;

        try {
            if (type === 'supervisor') {
                if (!formData.name?.trim() || !formData.surname?.trim() || !formData.dni?.toString().trim()) {
                    alert('Completá nombre, apellido y DNI del supervisor.');
                    return;
                }
                if (!isEdit && !formData.password) {
                    alert('Definí una contraseña inicial para el supervisor.');
                    return;
                }
                if (formData.password && formData.password.length < 6) {
                    alert('La contraseña debe tener al menos 6 caracteres.');
                    return;
                }
                if ((formData.password || formData.confirmPassword) && formData.password !== formData.confirmPassword) {
                    alert('Las contraseñas no coinciden.');
                    return;
                }
                payload = {
                    name: formData.name.trim(),
                    surname: formData.surname.trim(),
                    dni: formData.dni.toString().trim(),
                    login_enabled: formData.login_enabled !== false,
                    password: formData.password || undefined,
                };
            } else if (type === 'service') {
                if (!formData.name?.trim()) {
                    alert('Ingresá el nombre del servicio.');
                    return;
                }
                if (!formData.address?.trim()) {
                    alert('Ingresá la direccion exacta del servicio.');
                    return;
                }
                if (!serviceGeoState.isValidated || serviceGeoState.validatedAddress !== formData.address.trim()) {
                    alert('Validá la direccion y elegí una coincidencia exacta dentro de AMBA antes de guardar.');
                    return;
                }
                payload = {
                    ...formData,
                    name: formData.name.trim(),
                    address: formData.address.trim(),
                    geocodeCandidateId: serviceGeoState.candidateId || formData.geocodeCandidateId || '',
                };
                setFormData(payload);
                setServiceGeoState(prev => ({ ...prev, loading: true, text: 'Guardando servicio con direccion validada...', type: 'info' }));
            } else if (type === 'supply') {
                if (!formData.nombre?.trim()) { alert('El nombre es obligatorio.'); return; }
                if (!formData.proveedor?.trim()) { alert('El proveedor es obligatorio.'); return; }
            }

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json().catch(() => ({}));

            if (res.ok) {
                refetchCatalog();
                closeModal();
            } else {
                if (type === 'service') {
                    setServiceGeoState(prev => ({ ...prev, loading: false, text: data.error || prev.text, type: 'error' }));
                }
                alert(data.error || 'Error al guardar');
            }
        } catch (err) {
            console.error(err);
            if (type === 'service') {
                setServiceGeoState(prev => ({ ...prev, loading: false, text: err.message || 'No se pudo validar la direccion.', type: 'error' }));
            }
            alert(err.message || 'Error de red');
        }
    };

    const handleDelete = async (type, id) => {
        const label = type === 'supervisor' ? 'supervisor' : type === 'service' ? 'servicio' : 'insumo';
        if (!confirm(`¿Estás seguro de eliminar este ${label}?`)) return;
        const endpoint = type === 'supervisor' ? `/api/supervisors/${id}` : type === 'service' ? `/api/services/${id}` : `/api/supplies/${id}`;
        try {
            const res = await fetch(endpoint, { method: 'DELETE' });
            if (res.ok) {
                refetchCatalog();
            } else {
                alert('No se pudo eliminar');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleServicesImport = async (file) => {
        setImportModal({ status: 'loading' });
        try {
            const body = new FormData();
            body.append('file', file);
            const res = await fetch('/api/services/import', { method: 'POST', body });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setImportModal({ status: 'done', imported: 0, failedRows: [{ fila: '-', nombre: '-', direccion: '-', lat: '', lng: '', motivo: data.error || 'Error desconocido' }] });
                return;
            }
            setImportModal({ status: 'done', imported: data.imported, failedRows: data.failedRows || [] });
            if (data.imported > 0) refetchCatalog();
        } catch (err) {
            setImportModal({ status: 'done', imported: 0, failedRows: [{ fila: '-', nombre: '-', direccion: '-', lat: '', lng: '', motivo: err.message || 'Error de red' }] });
        }
    };

    const downloadFailedCsv = (failedRows) => {
        const header = ['fila', 'nombre', 'direccion', 'lat', 'lng', 'motivo'];
        const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [header.join(','), ...failedRows.map(r => header.map(k => escape(r[k])).join(','))];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'servicios-no-importados.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleSuppliesImport = async (file) => {
        setSuppliesImportModal({ status: 'loading' });
        try {
            const body = new FormData();
            body.append('file', file);
            const res = await fetch('/api/supplies/import', { method: 'POST', body });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSuppliesImportModal({ status: 'done', imported: 0, failedRows: [{ fila: '-', nombre: '-', unidad: '-', motivo: data.error || 'Error desconocido' }] });
                return;
            }
            setSuppliesImportModal({ status: 'done', imported: data.imported, failedRows: data.failedRows || [] });
            if (data.imported > 0) refetchCatalog();
        } catch (err) {
            setSuppliesImportModal({ status: 'done', imported: 0, failedRows: [{ fila: '-', nombre: '-', unidad: '-', motivo: err.message || 'Error de red' }] });
        }
    };

    const handleSuppliesExport = () => {
        const header = ['insumo', 'proveedor'];
        const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [header.join(','), ...supplies.map(s => [escape(s.nombre), escape(s.proveedor)].join(','))];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'insumos.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const filteredServices = useMemo(() => {
        const normalizedSearch = getSearchableText(serviceSearchTerm);
        if (!normalizedSearch) return services;
        return services.filter(service => {
            const haystack = getSearchableText(`${service.name} ${service.address}`);
            return haystack.includes(normalizedSearch);
        });
    }, [serviceSearchTerm, services]);

    return (
        <MainLayout>
            <Suspense fallback={null}>
                <TabReader onTab={setConfigTab} />
            </Suspense>
            <div className="config-view">

                {/* ============ SUPERVISORES ============ */}
                {configTab === 'supervisors' && (
                    <div className="card" style={{ padding: 0 }}>
                        <div className="page-header" style={{ padding: '1.5rem' }}>
                            <h3>Lista de Supervisores</h3>
                            <button className="btn btn-primary" onClick={() => openModal('supervisor')}>+ Añadir Supervisor</button>
                        </div>
                        <div className="table-container">
                            <table className="table mobile-cards-table">
                                <thead>
                                    <tr>
                                        <th>Nombre completo</th>
                                        <th>DNI</th>
                                        <th>Acceso</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {supervisors.map(s => (
                                        <tr key={s.id}>
                                            <td data-label="Nombre completo"><strong>{s.surname}, {s.name}</strong></td>
                                            <td data-label="DNI">
                                                <strong>{s.dni}</strong>
                                            </td>
                                            <td data-label="Acceso">
                                                <span className={`badge ${s.login_enabled ? 'badge-success' : 'badge-danger'}`}>
                                                    {s.login_enabled ? 'Habilitado' : 'Bloqueado'}
                                                </span>
                                            </td>
                                            <td data-label="Acciones" className="mobile-hide-label" style={{ textAlign: 'right' }}>
                                                <div className="table-action-group">
                                                    <button className="btn btn-secondary" onClick={() => openModal('supervisor', s)}>✏️</button>
                                                    <button className="btn btn-secondary" style={{ color: 'var(--error)' }} onClick={() => handleDelete('supervisor', s.id)}>🗑️</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ============ SERVICIOS ============ */}
                {configTab === 'services' && (
                    <div className="card" style={{ padding: 0 }}>
                        <div className="page-header" style={{ padding: '1.5rem', flexWrap: 'wrap' }}>
                            <h3>Lista de Servicios</h3>
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <button className="btn btn-secondary" onClick={() => setImportModal({ status: 'idle' })}>Importar Excel</button>
                                <button className="btn btn-primary" onClick={() => openModal('service')}>+ Añadir Servicio</button>
                            </div>
                        </div>
                        <div style={{ padding: '0 1.5rem 1rem' }}>
                            <input
                                type="text"
                                placeholder="Buscar por nombre o direccion..."
                                value={serviceSearchTerm}
                                onChange={(e) => setServiceSearchTerm(e.target.value)}
                                className="card"
                                style={{ margin: 0, width: '100%' }}
                            />
                        </div>
                        <div className="table-container">
                            <table className="table mobile-cards-table">
                                <thead>
                                    <tr>
                                        <th>Servicio</th>
                                        <th>Ubicación</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredServices.map(s => (
                                        <tr key={s.id}>
                                            <td data-label="Servicio"><strong>{s.name}</strong></td>
                                            <td data-label="Ubicación">{s.address}</td>
                                            <td data-label="Acciones" className="mobile-hide-label" style={{ textAlign: 'right' }}>
                                                <div className="table-action-group">
                                                    <button className="btn btn-secondary" onClick={() => openModal('service', s)}>✏️</button>
                                                    <button className="btn btn-secondary" style={{ color: 'var(--error)' }} onClick={() => handleDelete('service', s.id)}>🗑️</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredServices.length === 0 && (
                                        <tr>
                                            <td colSpan="4" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                                                {serviceSearchTerm ? 'No se encontraron servicios con esa busqueda.' : 'No hay servicios cargados todavia.'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ============ INSUMOS ============ */}
                {configTab === 'supplies' && (
                    <div className="card" style={{ padding: 0 }}>
                        <div className="page-header" style={{ padding: '1.5rem' }}>
                            <h3>Lista Fija de Insumos</h3>
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <button className="btn btn-secondary" onClick={handleSuppliesExport}>Exportar</button>
                                <button className="btn btn-secondary" onClick={() => setSuppliesImportModal({ status: 'idle' })}>Importar Excel</button>
                                <button className="btn btn-primary" onClick={() => openModal('supply')}>+ Añadir Insumo</button>
                            </div>
                        </div>
                        <div className="table-container">
                            <table className="table mobile-cards-table">
                                <thead>
                                    <tr>
                                        <th>Insumo</th>
                                        <th>Unidad de Medida</th>
                                        <th>Proveedor</th>
                                        <th>Estado</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {supplies.map(s => (
                                        <tr key={s.id}>
                                            <td data-label="Insumo"><strong>{s.nombre}</strong></td>
                                            <td data-label="Unidad de Medida">{s.unidad}</td>
                                            <td data-label="Proveedor">{s.proveedor || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                                            <td data-label="Estado">
                                                <span className={`badge ${s.activo ? 'badge-success' : 'badge-danger'}`}>
                                                    {s.activo ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </td>
                                            <td data-label="Acciones" className="mobile-hide-label" style={{ textAlign: 'right' }}>
                                                <div className="table-action-group">
                                                    <button className="btn btn-secondary" onClick={() => openModal('supply', s)}>✏️</button>
                                                    <button className="btn btn-secondary" style={{ color: 'var(--error)' }} onClick={() => handleDelete('supply', s.id)}>🗑️</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ============ MODAL IMPORTAR INSUMOS ============ */}
                {suppliesImportModal && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h2>Importar Insumos desde Excel</h2>
                            {suppliesImportModal.status === 'idle' && (
                                <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div style={{ padding: '0.9rem 1rem', borderRadius: 'var(--radius-sm)', background: 'var(--color-muted-surface)', fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-muted)' }}>
                                        El archivo debe tener las columnas: <strong style={{ color: 'var(--text-main)' }}>nombre</strong>, <strong style={{ color: 'var(--text-main)' }}>unidad</strong> (obligatorias), y opcionalmente <strong style={{ color: 'var(--text-main)' }}>activo</strong> (true/false). Si no se indica, se importa como activo.
                                    </div>
                                    <a href="/api/supplies/import" download style={{ alignSelf: 'flex-start' }} className="btn btn-secondary">Descargar plantilla</a>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontWeight: 600 }}>
                                        Seleccionar archivo .xlsx o .csv
                                        <input
                                            type="file"
                                            accept=".xlsx,.csv"
                                            style={{ fontWeight: 'normal' }}
                                            onChange={(e) => {
                                                const f = e.target.files?.[0];
                                                if (f) handleSuppliesImport(f);
                                            }}
                                        />
                                    </label>
                                </div>
                            )}
                            {suppliesImportModal.status === 'loading' && (
                                <div style={{ marginTop: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                                    Procesando archivo...
                                </div>
                            )}
                            {suppliesImportModal.status === 'done' && (
                                <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div style={{ padding: '0.9rem 1rem', borderRadius: 'var(--radius-sm)', background: '#DCFCE7', color: '#166534', fontWeight: 600 }}>
                                        {suppliesImportModal.imported} insumo{suppliesImportModal.imported !== 1 ? 's' : ''} importado{suppliesImportModal.imported !== 1 ? 's' : ''} correctamente.
                                    </div>
                                    {suppliesImportModal.failedRows?.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            <p style={{ fontWeight: 600, margin: 0, color: 'var(--error)' }}>{suppliesImportModal.failedRows.length} fila{suppliesImportModal.failedRows.length !== 1 ? 's' : ''} no importada{suppliesImportModal.failedRows.length !== 1 ? 's' : ''}:</p>
                                            <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                {suppliesImportModal.failedRows.map((e, i) => (
                                                    <div key={i} style={{ padding: '0.6rem 0.9rem', borderRadius: 'var(--radius-sm)', background: '#FEE2E2', color: '#991B1B', fontSize: '0.85rem' }}>
                                                        <strong>Fila {e.fila} — {e.nombre}:</strong> {e.motivo}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setSuppliesImportModal({ status: 'idle' })}>Importar otro archivo</button>
                                </div>
                            )}
                            <div className="config-modal-actions" style={{ marginTop: '2rem' }}>
                                <button className="btn btn-secondary" onClick={() => setSuppliesImportModal(null)} disabled={suppliesImportModal.status === 'loading'}>Cerrar</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ============ MODAL IMPORTAR SERVICIOS ============ */}
                {importModal && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h2>Importar Servicios desde Excel</h2>
                            {importModal.status === 'idle' && (
                                <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div style={{ padding: '0.9rem 1rem', borderRadius: 'var(--radius-sm)', background: 'var(--color-muted-surface)', fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-muted)' }}>
                                        El archivo debe tener las columnas: <strong style={{ color: 'var(--text-main)' }}>nombre</strong>, <strong style={{ color: 'var(--text-main)' }}>direccion</strong> (obligatorias), y opcionalmente <strong style={{ color: 'var(--text-main)' }}>lat</strong> y <strong style={{ color: 'var(--text-main)' }}>lng</strong>. Si no se proveen coordenadas, se geocodifican automáticamente dentro de AMBA.
                                    </div>
                                    <a href="/api/services/import" download style={{ alignSelf: 'flex-start' }} className="btn btn-secondary">Descargar plantilla</a>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontWeight: 600 }}>
                                        Seleccionar archivo .xlsx o .csv
                                        <input
                                            type="file"
                                            accept=".xlsx,.csv"
                                            style={{ fontWeight: 'normal' }}
                                            onChange={(e) => {
                                                const f = e.target.files?.[0];
                                                if (f) handleServicesImport(f);
                                            }}
                                        />
                                    </label>
                                </div>
                            )}
                            {importModal.status === 'loading' && (
                                <div style={{ marginTop: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                                    Procesando y geocodificando direcciones...
                                </div>
                            )}
                            {importModal.status === 'done' && (
                                <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div style={{ padding: '0.9rem 1rem', borderRadius: 'var(--radius-sm)', background: '#DCFCE7', color: '#166534', fontWeight: 600 }}>
                                        {importModal.imported} servicio{importModal.imported !== 1 ? 's' : ''} importado{importModal.imported !== 1 ? 's' : ''} correctamente.
                                    </div>
                                    {importModal.failedRows?.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                <p style={{ fontWeight: 600, margin: 0, color: 'var(--error)' }}>{importModal.failedRows.length} fila{importModal.failedRows.length !== 1 ? 's' : ''} no importada{importModal.failedRows.length !== 1 ? 's' : ''}:</p>
                                                <button className="btn btn-secondary" style={{ fontSize: '0.85rem' }} onClick={() => downloadFailedCsv(importModal.failedRows)}>Descargar no importados (.csv)</button>
                                            </div>
                                            <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                {importModal.failedRows.map((e, i) => (
                                                    <div key={i} style={{ padding: '0.6rem 0.9rem', borderRadius: 'var(--radius-sm)', background: '#FEE2E2', color: '#991B1B', fontSize: '0.85rem' }}>
                                                        <strong>Fila {e.fila} — {e.nombre}:</strong> {e.motivo}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setImportModal({ status: 'idle' })}>Importar otro archivo</button>
                                </div>
                            )}
                            <div className="config-modal-actions" style={{ marginTop: '2rem' }}>
                                <button className="btn btn-secondary" onClick={() => setImportModal(null)} disabled={importModal.status === 'loading'}>Cerrar</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ============ MODAL EDITAR/CREAR ============ */}
                {editingEntity && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h2>{editingEntity.data ? 'Editar' : 'Crear'} {editingEntity.type === 'supervisor' ? 'Supervisor' : editingEntity.type === 'service' ? 'Servicio' : 'Insumo'}</h2>
                            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {editingEntity.type === 'supervisor' ? (
                                    <>
                                        <div style={{ padding: '0.9rem 1rem', borderRadius: 'var(--radius-sm)', background: 'var(--color-muted-surface)', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                            Usuario de inicio de sesión: <strong style={{ color: 'var(--text-main)' }}>{formData.dni || 'DNI del supervisor'}</strong>. El administrador define y actualiza la contraseña desde esta pantalla.
                                        </div>
                                        <input
                                            type="text" placeholder="Nombre" className="card" style={{ margin: 0 }}
                                            value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        />
                                        <input
                                            type="text" placeholder="Apellido" className="card" style={{ margin: 0 }}
                                            value={formData.surname || ''} onChange={e => setFormData({ ...formData, surname: e.target.value })}
                                        />
                                        <input
                                            type="text" placeholder="DNI" className="card" style={{ margin: 0 }}
                                            value={formData.dni || ''} onChange={e => setFormData({ ...formData, dni: e.target.value })}
                                        />
                                        <div className="supervisor-toggle-row" style={{ padding: '0.9rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--color-surface)' }}>
                                            <div>
                                                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>Acceso habilitado</div>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Si lo desactivás, el supervisor no podrá iniciar sesión.</div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={formData.login_enabled !== false}
                                                onChange={e => setFormData({ ...formData, login_enabled: e.target.checked })}
                                                style={{ width: 'auto', margin: 0, transform: 'scale(1.2)' }}
                                            />
                                        </div>
                                        <PasswordInput placeholder={editingEntity.data ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'} value={formData.password || ''} onChange={e => setFormData({ ...formData, password: e.target.value })} show={showModalPassword} onToggle={() => setShowModalPassword(v => !v)} />
                                        <PasswordInput placeholder={editingEntity.data ? 'Confirmar nueva contraseña' : 'Confirmar contraseña'} value={formData.confirmPassword || ''} onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })} show={showModalConfirmPassword} onToggle={() => setShowModalConfirmPassword(v => !v)} />
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                            {editingEntity.data
                                                ? 'Dejá la contraseña vacía para mantener la actual.'
                                                : 'La contraseña inicial debe tener al menos 6 caracteres.'}
                                        </div>
                                    </>
                                ) : editingEntity.type === 'service' ? (
                                    <>
                                        <input
                                            type="text" placeholder="Nombre del Servicio" className="card" style={{ margin: 0 }}
                                            value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        />
                                        <input
                                            type="text" placeholder="Dirección" className="card" style={{ margin: 0 }}
                                            value={formData.address || ''} onChange={e => handleServiceAddressChange(e.target.value)}
                                        />
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            Ingresá calle, altura y localidad. Solo se aceptan direcciones exactas dentro de AMBA.
                                        </p>
                                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <button className="btn btn-secondary" onClick={handleLookupServiceAddress} disabled={serviceGeoState.loading}>
                                                {serviceGeoState.loading ? 'Validando...' : '🧭 Validar direccion AMBA'}
                                            </button>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                {formData.lat && formData.lng ? `GPS: ${Number(formData.lat).toFixed(6)}, ${Number(formData.lng).toFixed(6)}` : 'GPS pendiente de validar'}
                                            </div>
                                        </div>
                                        {serviceCandidates.length > 0 && (
                                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                                                {serviceCandidates.map(candidate => (
                                                    <button
                                                        key={candidate.id}
                                                        type="button"
                                                        onClick={() => handleSelectServiceCandidate(candidate)}
                                                        style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', padding: '1rem', textAlign: 'left', cursor: 'pointer' }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                            <strong style={{ color: 'var(--text-main)' }}>{candidate.address}</strong>
                                                            <span className="badge badge-success">{candidate.type}</span>
                                                        </div>
                                                        <div style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                            {candidate.city || 'AMBA'}{candidate.region ? `, ${candidate.region}` : ''} • Confianza {Math.round(candidate.score)}%
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {serviceGeoState.text && (
                                            <div style={{
                                                padding: '0.85rem 1rem',
                                                borderRadius: 'var(--radius-sm)',
                                                background: serviceGeoState.type === 'success' ? '#DCFCE7' : serviceGeoState.type === 'error' ? '#FEE2E2' : '#E0F2FE',
                                                color: serviceGeoState.type === 'success' ? '#166534' : serviceGeoState.type === 'error' ? '#991B1B' : '#075985',
                                                fontSize: '0.9rem',
                                                lineHeight: 1.5
                                            }}>
                                                {serviceGeoState.text}
                                            </div>
                                        )}
                                    </>
                                ) : editingEntity.type === 'supply' ? (
                                    <>
                                        <input
                                            type="text" placeholder="Nombre del Insumo (ej: Lavandina)" className="card" style={{ margin: 0 }}
                                            value={formData.nombre || ''} onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                                        />
                                        <input
                                            type="text" placeholder="Unidad (ej: litros, unidades)" className="card" style={{ margin: 0 }}
                                            value={formData.unidad || ''} onChange={e => setFormData({ ...formData, unidad: e.target.value })}
                                        />
                                        <input
                                            type="text" placeholder="Proveedor *" className="card" style={{ margin: 0 }}
                                            value={formData.proveedor || ''} onChange={e => setFormData({ ...formData, proveedor: e.target.value })}
                                        />
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                                            <input
                                                type="checkbox"
                                                id="supply-active"
                                                checked={formData.activo === undefined ? true : formData.activo}
                                                onChange={e => setFormData({ ...formData, activo: e.target.checked })}
                                                style={{ width: 'auto', margin: 0 }}
                                            />
                                            <label htmlFor="supply-active" style={{ margin: 0 }}>Insumo Activo</label>
                                        </div>
                                    </>
                                ) : null}
                            </div>
                            <div className="config-modal-actions" style={{ marginTop: '2rem' }}>
                                <button className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
                                <button className="btn btn-primary" onClick={handleSave} disabled={serviceGeoState.loading}>
                                    {serviceGeoState.loading && editingEntity.type === 'service' ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </MainLayout>
    );
}
