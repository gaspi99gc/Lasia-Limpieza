'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import ServiceDetailModal from '@/components/ServiceDetailModal';
import { useCatalog } from '@/lib/CatalogContext';
import { useServices, servicesKey } from '@/hooks/queries/useServices';
import { useMachines } from '@/hooks/queries/useMachines';
import { useDeleteService } from '@/hooks/mutations/useServiceMutations';
import { apiFetch } from '@/lib/api';
import { notify } from '@/lib/toast';
import { isWithinAmba } from '@/lib/geo';
import { matchesSearch } from '@/lib/search';
import ServicesMap from '@/components/ServicesMap';

export default function ComprasServiciosPage() {
    const { refetch: refetchCatalog } = useCatalog();
    const queryClient = useQueryClient();
    const { data: services = [] } = useServices();
    const { data: machines = [] } = useMachines({ onlyActive: true });
    const deleteService = useDeleteService();
    const [selectedMachines, setSelectedMachines] = useState(new Map()); // machine_id -> quantity
    const [serviceSearchTerm, setServiceSearchTerm] = useState('');
    const [serviceViewMode, setServiceViewMode] = useState('list');
    const [editingService, setEditingService] = useState(null);
    const [importModal, setImportModal] = useState(null);
    const [detailServiceId, setDetailServiceId] = useState(null);
    const [formData, setFormData] = useState({ name: '', address: '', lat: '', lng: '', geocodeCandidateId: '', encargado_nombre: '', encargado_telefono: '', operarios_jornada_completa: 0, operarios_media_jornada: 0, operarios_turnos: [], administrador_nombre: '', administrador_mails: [], administrador_telefonos: [], sin_insumos: false });
    const [serviceCandidates, setServiceCandidates] = useState([]);
    const [serviceGeoState, setServiceGeoState] = useState({
        loading: false,
        text: '',
        type: 'idle',
        isValidated: false,
        validatedAddress: '',
        candidateId: '',
    });
    const [initialSnapshot, setInitialSnapshot] = useState(null);

    const filteredServices = useMemo(() => {
        return services.filter((service) => matchesSearch(serviceSearchTerm, [service.name, service.address]));
    }, [serviceSearchTerm, services]);

    const geocodeServiceAddress = async (address) => {
        const response = await fetch('/api/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || 'No se pudo ubicar la direccion ingresada.');
        }

        return data.candidates || [];
    };

    const resetServiceModal = () => {
        setEditingService(null);
        setServiceCandidates([]);
        setSelectedMachines(new Map());
        setInitialSnapshot(null);
        setServiceGeoState({
            loading: false,
            text: '',
            type: 'idle',
            isValidated: false,
            validatedAddress: '',
            candidateId: '',
        });
    };

    const hasUnsavedChanges = () => {
        if (!initialSnapshot) return false;
        if (JSON.stringify(initialSnapshot.formData) !== JSON.stringify(formData)) return true;
        const a = initialSnapshot.machines || new Map();
        const b = selectedMachines || new Map();
        if (a.size !== b.size) return true;
        for (const [k, v] of a) {
            if (b.get(k) !== v) return true;
        }
        return false;
    };

    const handleAttemptClose = async () => {
        if (!hasUnsavedChanges()) {
            resetServiceModal();
            return;
        }
        const { default: Swal } = await import('sweetalert2');
        const result = await Swal.fire({
            title: '¿Cerrar sin guardar?',
            text: 'Hay cambios sin guardar. Si cerrás ahora se van a perder.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Cerrar sin guardar',
            cancelButtonText: 'Seguir editando',
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#6b7280',
            reverseButtons: true,
        });
        if (result.isConfirmed) resetServiceModal();
    };

    const openServiceModal = async (service = null) => {
        setEditingService(service || {});
        setServiceCandidates([]);
        let initialMachines = new Map();
        if (service?.id) {
            try {
                const res = await fetch('/api/service-machines');
                if (res.ok) {
                    const all = await res.json();
                    for (const r of all.filter(r => r.service_id === service.id)) {
                        initialMachines.set(r.machine_id, r.quantity ?? 1);
                    }
                }
            } catch { /* keep empty map */ }
        }
        setSelectedMachines(initialMachines);

        const hasSavedLocation = Boolean(service?.address && service?.lat && service?.lng);
        const initial = service ? {
            ...service,
            lat: service.lat ?? '',
            lng: service.lng ?? '',
            geocodeCandidateId: '',
            encargado_nombre: service.encargado_nombre ?? '',
            encargado_telefono: service.encargado_telefono ?? '',
            operarios_jornada_completa: service.operarios_jornada_completa ?? 0,
            operarios_media_jornada: service.operarios_media_jornada ?? 0,
            operarios_turnos: Array.isArray(service.operarios_turnos) ? service.operarios_turnos : [],
            administrador_nombre: service.administrador_nombre ?? '',
            administrador_mails: Array.isArray(service.administrador_mails) ? service.administrador_mails : [],
            administrador_telefonos: Array.isArray(service.administrador_telefonos) ? service.administrador_telefonos : [],
            sin_insumos: service.sin_insumos === true,
        } : { name: '', address: '', lat: '', lng: '', geocodeCandidateId: '', encargado_nombre: '', encargado_telefono: '', operarios_jornada_completa: 0, operarios_media_jornada: 0, operarios_turnos: [], administrador_nombre: '', administrador_mails: [], administrador_telefonos: [], sin_insumos: false };
        setFormData(initial);
        setInitialSnapshot({ formData: initial, machines: initialMachines });

        setServiceGeoState({
            loading: false,
            text: hasSavedLocation
                ? 'Direccion actual cargada. Si la cambias, validala de nuevo dentro de AMBA.'
                : 'Validá la direccion exacta dentro de AMBA antes de guardar.',
            type: 'info',
            isValidated: hasSavedLocation,
            validatedAddress: service?.address || '',
            candidateId: '',
        });
    };

    const handleServiceAddressChange = (value) => {
        const normalizedValue = value.trim();
        const keepValidatedAddress = normalizedValue && normalizedValue === serviceGeoState.validatedAddress;

        setFormData((current) => ({
            ...current,
            address: value,
            lat: keepValidatedAddress ? current.lat : '',
            lng: keepValidatedAddress ? current.lng : '',
            geocodeCandidateId: keepValidatedAddress ? serviceGeoState.candidateId : '',
        }));

        if (keepValidatedAddress) {
            return;
        }

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
            setFormData((current) => ({ ...current, lat: '', lng: '', geocodeCandidateId: '' }));
            setServiceGeoState({ loading: false, text: error.message || 'No se pudo ubicar la direccion.', type: 'error', isValidated: false, validatedAddress: '', candidateId: '' });
        }
    };

    const parseManualCoords = (input) => {
        if (!input) return null;
        const text = String(input).trim();
        // 1) "@lat,lng" estilo URL de Google Maps (ej. https://maps.google.com/...@-34.5,-58.4,17z)
        const atMatch = text.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
        if (atMatch) return { lat: Number(atMatch[1]), lng: Number(atMatch[2]) };
        // 2) "lat,lng" plano (pegado desde el panel derecho de Maps)
        const plain = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
        if (plain) return { lat: Number(plain[1]), lng: Number(plain[2]) };
        // 3) "lat: -34.5 lng: -58.4" o variantes con espacios
        const wide = text.match(/(-?\d+\.\d+)\D+(-?\d+\.\d+)/);
        if (wide) return { lat: Number(wide[1]), lng: Number(wide[2]) };
        return null;
    };

    const handleManualGpsLoad = async () => {
        const { default: Swal } = await import('sweetalert2');
        const { value: raw } = await Swal.fire({
            title: 'Cargar GPS manualmente',
            html: `
                <p style="margin:0 0 0.5rem;font-size:0.88rem;text-align:left">
                    Abrí Google Maps, hacé click derecho sobre la ubicación exacta y copiá las coordenadas
                    (ej. <strong>-34.413, -58.823</strong>). Pegalas acá abajo.
                </p>
            `,
            input: 'text',
            inputPlaceholder: '-34.413, -58.823',
            showCancelButton: true,
            confirmButtonText: 'Cargar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#00AEEF',
        });
        if (!raw) return;
        const coords = parseManualCoords(raw);
        if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
            notify.error('No pude leer las coordenadas. Pegalas como -34.413, -58.823.');
            return;
        }
        if (!isWithinAmba(coords.lat, coords.lng)) {
            notify.error('Esas coordenadas están fuera de AMBA. Verificá la ubicación.');
            return;
        }
        setServiceCandidates([]);
        setFormData((current) => ({
            ...current,
            lat: coords.lat,
            lng: coords.lng,
            geocodeCandidateId: '',
        }));
        setServiceGeoState({
            loading: false,
            text: `GPS cargado manualmente: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,
            type: 'success',
            isValidated: true,
            validatedAddress: formData.address?.trim() || '',
            candidateId: '',
        });
    };

    const handleSelectServiceCandidate = (candidate) => {
        setServiceCandidates([]);
        setFormData((current) => ({
            ...current,
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

    const handleSaveService = async () => {
        const isEdit = Boolean(editingService?.id);

        if (!formData.name?.trim()) {
            notify.error('Ingresá el nombre del servicio.');
            return;
        }

        if (!formData.address?.trim()) {
            notify.error('Ingresá la direccion exacta del servicio.');
            return;
        }

        if (!serviceGeoState.isValidated || serviceGeoState.validatedAddress !== formData.address.trim()) {
            notify.error('Validá la direccion y elegí una coincidencia exacta dentro de AMBA antes de guardar.');
            return;
        }

        const candidateId = serviceGeoState.candidateId || formData.geocodeCandidateId || '';
        const payload = {
            ...formData,
            name: formData.name.trim(),
            address: formData.address.trim(),
            geocodeCandidateId: candidateId,
            // Sin candidato de ArcGIS = GPS manual o coordenadas ya guardadas:
            // el backend respeta lat/lng tal cual si caen dentro de AMBA.
            manualCoords: !candidateId,
            encargado_nombre: formData.encargado_nombre?.trim() || '',
            encargado_telefono: formData.encargado_telefono?.trim() || '',
            sin_insumos: formData.sin_insumos === true,
        };

        try {
            setServiceGeoState((current) => ({ ...current, loading: true, text: 'Guardando servicio con direccion validada...', type: 'info' }));

            const response = await fetch(isEdit ? `/api/services/${editingService.id}` : '/api/services', {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setServiceGeoState((current) => ({ ...current, loading: false, text: data.error || current.text, type: 'error' }));
                notify.error(data.error || 'Error al guardar');
                return;
            }

            const savedService = data.id ? data : { ...payload, id: editingService?.id };
            const serviceId = savedService.id;

            await fetch('/api/service-machines', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ service_id: serviceId }),
            });
            for (const [machineId, quantity] of selectedMachines) {
                if (quantity <= 0) continue;
                await fetch('/api/service-machines', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ service_id: serviceId, machine_id: machineId, quantity }),
                });
            }

            await fetch(`/api/services/${serviceId}/plantel`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    operarios_jornada_completa: Number(formData.operarios_jornada_completa) || 0,
                    operarios_media_jornada: Number(formData.operarios_media_jornada) || 0,
                    operarios_turnos: (formData.operarios_turnos || []).map(t => ({
                        hora_inicio: t.hora_inicio || '',
                        hora_fin: t.hora_fin || '',
                        cantidad: Number(t.cantidad) || 0,
                    })),
                }),
            });

            await fetch(`/api/services/${serviceId}/contacto`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    administrador_nombre: formData.administrador_nombre || '',
                    administrador_mails: formData.administrador_mails || [],
                    administrador_telefonos: formData.administrador_telefonos || [],
                }),
            });

            queryClient.invalidateQueries({ queryKey: servicesKey });
            refetchCatalog();
            notify.success(isEdit ? 'Servicio actualizado' : 'Servicio creado');

            resetServiceModal();
        } catch (error) {
            console.error(error);
            setServiceGeoState((current) => ({ ...current, loading: false, text: error.message || 'No se pudo validar la direccion.', type: 'error' }));
            notify.error(error.message || 'Error de red');
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
            if (data.imported > 0) {
                queryClient.invalidateQueries({ queryKey: servicesKey });
                refetchCatalog();
            }
        } catch (err) {
            setImportModal({ status: 'done', imported: 0, failedRows: [{ fila: '-', nombre: '-', direccion: '-', lat: '', lng: '', motivo: err.message || 'Error de red' }] });
        }
    };

    const handleExportServices = async () => {
        const res = await fetch('/api/services/export');
        if (!res.ok) { notify.error('No se pudo exportar el listado.'); return; }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'servicios.xlsx';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleDownloadPlantelTemplate = async () => {
        const XLSX = await import('xlsx');
        const rows = [...services]
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .map(s => ({
                'ID': s.id,
                'Servicio': s.name || '',
                'Jornada Completa': Number(s.operarios_jornada_completa) || 0,
                'Media Jornada': Number(s.operarios_media_jornada) || 0,
            }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 6 }, { wch: 40 }, { wch: 18 }, { wch: 16 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Dotacion');
        XLSX.writeFile(wb, 'Dotacion_Servicios.xlsx');
    };

    const handleImportPlantel = async (file) => {
        const { default: Swal } = await import('sweetalert2');
        const XLSX = await import('xlsx');

        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

            // Index de servicios por nombre exacto (case-sensitive, trim) para match rápido.
            const byName = new Map();
            for (const s of services) {
                if (s.name) byName.set(String(s.name).trim(), s);
            }

            const updates = [];
            const notFound = [];
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const rowNum = i + 2; // fila real en Excel (1 = header)
                const idRaw = row['ID'] ?? row['id'];
                const nameRaw = String(row['Servicio'] ?? row['servicio'] ?? '').trim();
                const jc = row['Jornada Completa'] ?? row['jornada completa'] ?? row['Jornada completa'];
                const mj = row['Media Jornada'] ?? row['media jornada'] ?? row['Media jornada'];

                let service = null;
                if (idRaw && Number(idRaw)) {
                    service = services.find(s => Number(s.id) === Number(idRaw)) || null;
                }
                if (!service && nameRaw) {
                    service = byName.get(nameRaw) || null;
                }

                if (!service) {
                    notFound.push(`Fila ${rowNum}: "${nameRaw || idRaw || '—'}" no coincide con ningún servicio`);
                    continue;
                }
                updates.push({
                    service_id: service.id,
                    operarios_jornada_completa: Number(jc) || 0,
                    operarios_media_jornada: Number(mj) || 0,
                });
            }

            if (updates.length === 0) {
                const errList = notFound.length ? `<ul style="text-align:left;font-size:0.82rem;max-height:200px;overflow:auto;margin:0.75rem 0 0;padding-left:1.2rem">${notFound.map(e => `<li>${e}</li>`).join('')}</ul>` : '';
                await Swal.fire({ title: 'Nada para actualizar', html: `No se encontró ningún servicio para aplicar.${errList}`, icon: 'warning', confirmButtonColor: '#f59e0b' });
                return;
            }

            const res = await fetch('/api/services/plantel/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                await Swal.fire({ title: 'Error', text: data.error || 'No se pudo importar la dotación.', icon: 'error', confirmButtonColor: '#ef4444' });
                return;
            }

            const totalErrors = (data.errors?.length || 0) + notFound.length;
            const errList = [
                ...notFound.map(e => `<li>${e}</li>`),
                ...(data.errors || []).map(e => `<li>Servicio #${e.service_id}: ${e.error}</li>`),
            ].join('');
            const errHtml = totalErrors > 0
                ? `<details open style="text-align:left;margin-top:1rem;background:#fff7ed;border:1px solid #fed7aa;padding:0.75rem;border-radius:6px;font-size:0.82rem;max-height:200px;overflow:auto"><summary style="cursor:pointer;font-weight:600;color:#b45309">${totalErrors} con error</summary><ul style="margin:0.5rem 0 0 1.2rem;padding:0">${errList}</ul></details>`
                : '';

            await Swal.fire({
                title: 'Dotación actualizada',
                html: `
                    <div style="text-align:left;padding:0.5rem 0">
                        <div style="display:flex;justify-content:space-between;padding:0.4rem 0"><span>✅ Actualizados:</span><strong>${data.updated}</strong></div>
                        ${totalErrors > 0 ? `<div style="display:flex;justify-content:space-between;padding:0.4rem 0;color:#b45309"><span>❌ Con error:</span><strong>${totalErrors}</strong></div>` : ''}
                    </div>
                    ${errHtml}
                `,
                icon: data.updated > 0 ? 'success' : 'warning',
                confirmButtonColor: '#1f3a4a',
                width: 560,
            });

            if (data.updated > 0) {
                queryClient.invalidateQueries({ queryKey: servicesKey });
                refetchCatalog();
            }
        } catch (err) {
            await Swal.fire({ title: 'Error al leer el Excel', text: err.message || 'Error desconocido', icon: 'error', confirmButtonColor: '#ef4444' });
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

    const handleDeleteService = async (serviceId) => {
        if (!confirm('¿Estás seguro de eliminar este servicio?')) return;
        try {
            await deleteService.mutateAsync(serviceId);
            refetchCatalog();
        } catch {
            // notified by global onError
        }
    };

    return (
        <MainLayout>
            <div className="config-view">
                <header className="page-header" style={{ marginBottom: '2rem' }}>
                    <div>
                        <h1>Servicios</h1>
                    </div>
                </header>

                <div className="card" style={{ padding: 0 }}>
                    <div className="page-header" style={{ padding: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <h3 style={{ margin: 0 }}>Lista de Servicios</h3>
                            <div className="segmented-control" style={{ display: 'flex', background: 'var(--color-muted-surface, #f1f5f9)', padding: '3px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color, #e2e8f0)' }}>
                                <button
                                    type="button"
                                    style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', border: 'none', borderRadius: '6px', minWidth: '70px', boxShadow: serviceViewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', background: serviceViewMode === 'list' ? '#00AEEF' : 'transparent', color: serviceViewMode === 'list' ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}
                                    onClick={() => setServiceViewMode('list')}
                                >
                                    Lista
                                </button>
                                <button
                                    type="button"
                                    style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', border: 'none', borderRadius: '6px', minWidth: '70px', boxShadow: serviceViewMode === 'map' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', background: serviceViewMode === 'map' ? '#00AEEF' : 'transparent', color: serviceViewMode === 'map' ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}
                                    onClick={() => setServiceViewMode('map')}
                                >
                                    Mapa
                                </button>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <button className="btn btn-secondary" onClick={handleDownloadPlantelTemplate} title="Descargar Excel con la dotación actual para editar">📥 Plantilla dotación</button>
                            <label className="btn btn-secondary" style={{ cursor: 'pointer', margin: 0 }} title="Subir Excel completado para actualizar la dotación de todos los servicios">
                                📤 Importar dotación
                                <input
                                    type="file"
                                    accept=".xlsx,.xls,.csv"
                                    style={{ display: 'none' }}
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        await handleImportPlantel(file);
                                        e.target.value = '';
                                    }}
                                />
                            </label>
                            <button className="btn btn-secondary" onClick={handleExportServices}>Exportar</button>
                            <button className="btn btn-secondary" onClick={() => setImportModal({ status: 'idle' })}>Importar Excel</button>
                            <button className="btn btn-primary" onClick={() => openServiceModal()}>+ Añadir Servicio</button>
                        </div>
                    </div>

                    {serviceViewMode === 'list' ? (
                        <>
                            <div style={{ padding: '0 1.5rem 1rem' }}>
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre o direccion..."
                                    value={serviceSearchTerm}
                                    onChange={(event) => setServiceSearchTerm(event.target.value)}
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
                                        {filteredServices.map((service) => (
                                            <tr key={service.id}>
                                                <td data-label="Servicio">
                                                    <button
                                                        type="button"
                                                        className="service-detail-name-btn"
                                                        onClick={() => setDetailServiceId(service.id)}
                                                    >
                                                        {service.name}
                                                    </button>
                                                </td>
                                                <td data-label="Ubicación">{service.address}</td>
                                                <td data-label="Acciones" className="mobile-hide-label" style={{ textAlign: 'right' }}>
                                                    <div className="table-action-group">
                                                        <button className="btn btn-secondary" onClick={() => openServiceModal(service)}>✏️</button>
                                                        <button className="btn btn-secondary" style={{ color: 'var(--error)' }} onClick={() => handleDeleteService(service.id)}>🗑️</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredServices.length === 0 && (
                                            <tr>
                                                <td colSpan="3" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                                                    {serviceSearchTerm ? 'No se encontraron servicios con esa busqueda.' : 'No hay servicios cargados todavia.'}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <div style={{ padding: '0 1.5rem 1.5rem' }}>
                            <ServicesMap
                                services={services}
                                height="500px"
                                onSelectService={(id) => setDetailServiceId(id)}
                            />
                        </div>
                    )}
                </div>

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

                {editingService && (
                    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) handleAttemptClose(); }}>
                        <div className="modal-content service-modal-compact" onMouseDown={(e) => e.stopPropagation()}>
                            <h2 style={{ margin: 0 }}>{editingService.id ? 'Editar Servicio' : 'Crear Servicio'}</h2>
                            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <input
                                    type="text"
                                    placeholder="Nombre del Servicio"
                                    className="card"
                                    style={{ margin: 0 }}
                                    value={formData.name || ''}
                                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                                />
                                <input
                                    type="text"
                                    placeholder="Dirección"
                                    className="card"
                                    style={{ margin: 0 }}
                                    value={formData.address || ''}
                                    onChange={(event) => handleServiceAddressChange(event.target.value)}
                                />
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    Ingresá calle, altura y localidad. Solo se aceptan direcciones exactas dentro de AMBA.
                                </p>
                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <button className="btn btn-secondary" onClick={handleLookupServiceAddress} disabled={serviceGeoState.loading}>
                                        {serviceGeoState.loading ? 'Validando...' : '🧭 Validar direccion AMBA'}
                                    </button>
                                    <button type="button" className="btn btn-secondary" onClick={handleManualGpsLoad} disabled={serviceGeoState.loading}>
                                        📍 Cargar GPS manualmente
                                    </button>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        {formData.lat && formData.lng ? `GPS: ${Number(formData.lat).toFixed(6)}, ${Number(formData.lng).toFixed(6)}` : 'GPS pendiente de validar'}
                                    </div>
                                </div>
                                {serviceCandidates.length > 0 ? (
                                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                                        {serviceCandidates.map((candidate) => (
                                            <button
                                                key={candidate.id}
                                                type="button"
                                                onClick={() => handleSelectServiceCandidate(candidate)}
                                                style={{
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: 'var(--radius-md)',
                                                    background: 'var(--color-surface)',
                                                    padding: '1rem',
                                                    textAlign: 'left',
                                                    cursor: 'pointer',
                                                }}
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
                                ) : null}
                                {serviceGeoState.text ? (
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
                                ) : null}
                                <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                                    <h3 className="service-modal-section-title">Encargado del servicio</h3>
                                    <p style={{ margin: '0 0 0.7rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        Contacto del encargado en la sucursal. El repartidor lo va a ver al abrir el pedido y va a poder escribirle por WhatsApp.
                                    </p>
                                    <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: '1fr 1fr', alignItems: 'end' }}>
                                        <label style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                            Nombre
                                            <input
                                                type="text"
                                                placeholder="Ej. María Pérez"
                                                className="card"
                                                style={{ margin: 0, fontWeight: 'normal' }}
                                                value={formData.encargado_nombre || ''}
                                                onChange={(event) => setFormData({ ...formData, encargado_nombre: event.target.value })}
                                            />
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                            Teléfono (WhatsApp)
                                            <input
                                                type="tel"
                                                placeholder="11 5555 6666"
                                                className="card"
                                                style={{ margin: 0, fontWeight: 'normal' }}
                                                value={formData.encargado_telefono || ''}
                                                onChange={(event) => setFormData({ ...formData, encargado_telefono: event.target.value })}
                                            />
                                        </label>
                                    </div>
                                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        Cargá solo el número argentino, ej. <strong>11 5555 6666</strong>. El código de país (+54 9) se agrega automáticamente para WhatsApp.
                                    </p>
                                </div>
                                <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                                    <h3 className="service-modal-section-title">Insumos</h3>
                                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer', marginTop: '0.3rem' }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.sin_insumos === true}
                                            onChange={(e) => setFormData({ ...formData, sin_insumos: e.target.checked })}
                                            style={{ marginTop: '0.15rem', width: '1.05rem', height: '1.05rem', flexShrink: 0, cursor: 'pointer' }}
                                        />
                                        <span>
                                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Este servicio no lleva insumos</span>
                                            <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                                Si lo marcás, los supervisores no van a ver este servicio al hacer un pedido de insumos.
                                            </span>
                                        </span>
                                    </label>
                                </div>
                                <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                                    <h3 className="service-modal-section-title">Administrador</h3>
                                    <p style={{ margin: '0 0 0.6rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        Nombre y contactos del administrador del consorcio o del servicio.
                                    </p>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        Nombre del administrador
                                        <input
                                            type="text"
                                            className="card"
                                            style={{ margin: 0, fontWeight: 'normal' }}
                                            placeholder="Ej. Administración del Sur S.A."
                                            value={formData.administrador_nombre || ''}
                                            onChange={(e) => setFormData({ ...formData, administrador_nombre: e.target.value })}
                                        />
                                    </label>

                                    <div style={{ marginTop: '0.7rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>Mails</span>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                                                onClick={() => setFormData({
                                                    ...formData,
                                                    administrador_mails: [...(formData.administrador_mails || []), ''],
                                                })}
                                            >+ Agregar mail</button>
                                        </div>
                                        {(formData.administrador_mails || []).length === 0 ? (
                                            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin mails cargados.</p>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                {(formData.administrador_mails || []).map((m, i) => (
                                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.4rem', alignItems: 'center' }}>
                                                        <input
                                                            type="email"
                                                            className="card"
                                                            style={{ margin: 0, fontWeight: 'normal' }}
                                                            placeholder="contacto@dominio.com"
                                                            value={m}
                                                            onChange={(e) => setFormData({
                                                                ...formData,
                                                                administrador_mails: formData.administrador_mails.map((x, idx) => idx === i ? e.target.value : x),
                                                            })}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormData({
                                                                ...formData,
                                                                administrador_mails: formData.administrador_mails.filter((_, idx) => idx !== i),
                                                            })}
                                                            style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '1.1rem', padding: '0 0.2rem' }}
                                                            title="Eliminar mail"
                                                        >✕</button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ marginTop: '0.7rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>Teléfonos</span>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                                                onClick={() => setFormData({
                                                    ...formData,
                                                    administrador_telefonos: [...(formData.administrador_telefonos || []), ''],
                                                })}
                                            >+ Agregar teléfono</button>
                                        </div>
                                        {(formData.administrador_telefonos || []).length === 0 ? (
                                            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin teléfonos cargados.</p>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                {(formData.administrador_telefonos || []).map((t, i) => (
                                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.4rem', alignItems: 'center' }}>
                                                        <input
                                                            type="tel"
                                                            className="card"
                                                            style={{ margin: 0, fontWeight: 'normal' }}
                                                            placeholder="11 5555 6666"
                                                            value={t}
                                                            onChange={(e) => setFormData({
                                                                ...formData,
                                                                administrador_telefonos: formData.administrador_telefonos.map((x, idx) => idx === i ? e.target.value : x),
                                                            })}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormData({
                                                                ...formData,
                                                                administrador_telefonos: formData.administrador_telefonos.filter((_, idx) => idx !== i),
                                                            })}
                                                            style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '1.1rem', padding: '0 0.2rem' }}
                                                            title="Eliminar teléfono"
                                                        >✕</button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                                    <h3 className="service-modal-section-title">Plantel del servicio</h3>
                                    <p style={{ margin: '0 0 0.7rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        Cantidad de operarios por tipo de jornada y por turnos diagramados.
                                    </p>
                                    <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                            Jornada completa (8hs)
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                className="card"
                                                style={{ margin: 0, fontWeight: 'normal' }}
                                                value={formData.operarios_jornada_completa ?? 0}
                                                onChange={(event) => setFormData({ ...formData, operarios_jornada_completa: event.target.value })}
                                            />
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                            Media jornada (4hs)
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                className="card"
                                                style={{ margin: 0, fontWeight: 'normal' }}
                                                value={formData.operarios_media_jornada ?? 0}
                                                onChange={(event) => setFormData({ ...formData, operarios_media_jornada: event.target.value })}
                                            />
                                        </label>
                                    </div>

                                    <div style={{ marginTop: '0.8rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>Turnos diagramados</span>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                                                onClick={() => setFormData({
                                                    ...formData,
                                                    operarios_turnos: [...(formData.operarios_turnos || []), { hora_inicio: '', hora_fin: '', cantidad: 0 }],
                                                })}
                                            >+ Agregar turno</button>
                                        </div>
                                        <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                            Solo planificación horaria. El total de operarios se cuenta arriba (jornada completa + media jornada).
                                        </p>
                                        {(formData.operarios_turnos || []).length === 0 ? (
                                            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin turnos diagramados.</p>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                {(formData.operarios_turnos || []).map((t, i) => (
                                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.4rem', alignItems: 'center' }}>
                                                        <input
                                                            type="time"
                                                            className="card"
                                                            style={{ margin: 0, fontWeight: 'normal' }}
                                                            value={t.hora_inicio || ''}
                                                            onChange={(e) => setFormData({
                                                                ...formData,
                                                                operarios_turnos: formData.operarios_turnos.map((x, idx) => idx === i ? { ...x, hora_inicio: e.target.value } : x),
                                                            })}
                                                        />
                                                        <input
                                                            type="time"
                                                            className="card"
                                                            style={{ margin: 0, fontWeight: 'normal' }}
                                                            value={t.hora_fin || ''}
                                                            onChange={(e) => setFormData({
                                                                ...formData,
                                                                operarios_turnos: formData.operarios_turnos.map((x, idx) => idx === i ? { ...x, hora_fin: e.target.value } : x),
                                                            })}
                                                        />
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="1"
                                                            placeholder="Cant."
                                                            className="card"
                                                            style={{ margin: 0, fontWeight: 'normal' }}
                                                            value={t.cantidad ?? 0}
                                                            onChange={(e) => setFormData({
                                                                ...formData,
                                                                operarios_turnos: formData.operarios_turnos.map((x, idx) => idx === i ? { ...x, cantidad: e.target.value } : x),
                                                            })}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormData({
                                                                ...formData,
                                                                operarios_turnos: formData.operarios_turnos.filter((_, idx) => idx !== i),
                                                            })}
                                                            style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '1.1rem', padding: '0 0.2rem' }}
                                                            title="Eliminar turno"
                                                        >✕</button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {(() => {
                                        const jc = Number(formData.operarios_jornada_completa) || 0;
                                        const mj = Number(formData.operarios_media_jornada) || 0;
                                        const total = jc + mj;
                                        return (
                                            <p style={{ margin: '0.6rem 0 0', fontSize: '0.82rem', color: 'var(--text-main)' }}>
                                                Total: <strong>{total}</strong> operario{total !== 1 ? 's' : ''}
                                            </p>
                                        );
                                    })()}
                                </div>
                                {machines.length > 0 && (
                                    <details className="service-modal-machines">
                                        <summary>
                                            <span>Maquinaria en este servicio</span>
                                            <span className="service-modal-machines-count">
                                                {selectedMachines.size} activa{selectedMachines.size !== 1 ? 's' : ''}
                                            </span>
                                        </summary>
                                        <p style={{ margin: '0.5rem 0 0.7rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            Click en una máquina para activarla. Usá <strong>−</strong> y <strong>+</strong> para ajustar la cantidad de unidades.
                                        </p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                                            {machines.map(m => {
                                                const qty = selectedMachines.get(m.id) || 0;
                                                const checked = qty > 0;
                                                const updateQty = (newQty) => setSelectedMachines(prev => {
                                                    const next = new Map(prev);
                                                    if (newQty <= 0) next.delete(m.id);
                                                    else next.set(m.id, newQty);
                                                    return next;
                                                });
                                                return (
                                                    <div
                                                        key={m.id}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                                            padding: checked ? '0.3rem 0.4rem 0.3rem 0.9rem' : '0.45rem 0.95rem',
                                                            borderRadius: '999px',
                                                            border: '1.5px solid ' + (checked ? '#00AEEF' : 'var(--border-color)'),
                                                            background: checked ? 'rgba(0,174,239,0.1)' : 'var(--color-surface)',
                                                            color: checked ? '#00AEEF' : 'var(--text-muted)',
                                                            fontWeight: checked ? 700 : 500,
                                                            fontSize: '0.88rem',
                                                            transition: 'all 0.12s',
                                                        }}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => updateQty(checked ? 0 : 1)}
                                                            style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}
                                                        >
                                                            {m.nombre}
                                                        </button>
                                                        {checked && (
                                                            <>
                                                                <span style={{
                                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                                    width: '90px', height: '24px', padding: '0 0.4rem',
                                                                    borderRadius: '999px', background: '#00AEEF', color: '#fff',
                                                                    fontWeight: 800, fontSize: '0.78rem', marginLeft: '0.25rem',
                                                                    whiteSpace: 'nowrap',
                                                                }}>
                                                                    {qty} {qty === 1 ? 'unidad' : 'unidades'}
                                                                </span>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.25rem' }}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => updateQty(qty - 1)}
                                                                        style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid rgba(0,174,239,0.4)', background: '#fff', color: '#00AEEF', cursor: 'pointer', fontWeight: 800, fontSize: '1rem', lineHeight: 1, padding: 0 }}
                                                                        title="Quitar una unidad"
                                                                    >−</button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => updateQty(qty + 1)}
                                                                        style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid rgba(0,174,239,0.4)', background: '#fff', color: '#00AEEF', cursor: 'pointer', fontWeight: 800, fontSize: '1rem', lineHeight: 1, padding: 0 }}
                                                                        title="Agregar una unidad"
                                                                    >+</button>
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <p style={{ margin: '0.85rem 0 0', padding: '0.6rem 0.85rem', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '8px', fontSize: '0.82rem', color: '#92400E' }}>
                                            ⚠ Recordá hacer click en <strong>Guardar Cambios</strong> para aplicar las modificaciones.
                                        </p>
                                    </details>
                                )}
                            </div>
                            <div className="config-modal-actions" style={{ marginTop: '1.25rem' }}>
                                <button className="btn btn-secondary" onClick={handleAttemptClose}>Cancelar</button>
                                <button className="btn btn-primary" onClick={handleSaveService} disabled={serviceGeoState.loading}>
                                    {serviceGeoState.loading ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {detailServiceId && (
                    <ServiceDetailModal
                        serviceId={detailServiceId}
                        onClose={() => setDetailServiceId(null)}
                    />
                )}
            </div>
        </MainLayout>
    );
}
