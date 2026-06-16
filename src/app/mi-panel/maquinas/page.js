'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import SearchableSelect from '@/components/SearchableSelect';
import { AttachmentThumbs } from '@/components/AttachmentViewer';
import IncidentNotesThread from '@/components/IncidentNotesThread';
import { getSessionUser } from '@/lib/session';
import { notify } from '@/lib/toast';

function FileInput({ files, setFiles, required, label }) {
    const [error, setError] = useState('');
    const inputRef = useRef(null);

    const onPick = (e) => {
        setError('');
        const picked = Array.from(e.target.files || []);
        const invalid = picked.find(f => !/^(image|video)\//.test(f.type));
        if (invalid) { setError(`Solo fotos o videos (${invalid.name})`); return; }
        const big = picked.find(f => f.size > 50 * 1024 * 1024);
        if (big) { setError(`Archivo demasiado grande: ${big.name} (máx 50 MB)`); return; }
        setFiles(prev => [...prev, ...picked]);
        e.target.value = '';
    };

    const pickerBtnStyle = { width: '100%', padding: '0.7rem', border: '1px solid #00AEEF', borderRadius: '8px', background: 'transparent', color: '#00AEEF', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' };

    return (
        <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {label}{required ? ' *' : ' (opcional)'}
            </label>
            <input ref={inputRef} type="file" accept="image/*,video/*" multiple onChange={onPick} style={{ display: 'none' }} />
            <button type="button" onClick={() => inputRef.current?.click()} style={pickerBtnStyle}>
                📎 Agregar fotos o videos
            </button>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Tu celu te va a preguntar si querés tomar la foto en el momento o elegirla de la galería.
            </p>
            {error && <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: '#B91C1C' }}>{error}</p>}
            {files.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                    {files.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.55rem', background: 'var(--color-muted-surface)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.78rem' }}>
                            <span style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {f.type.startsWith('video/') ? '🎬 ' : '🖼️ '}{f.name}
                            </span>
                            <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1, padding: 0 }}>×</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Sube cada archivo DIRECTO a Supabase Storage usando una signed upload URL,
// salteando el limite de body de Vercel (~4.5 MB). Devuelve los attachments
// listos para mandar al POST de /api/machine-incidents.
async function uploadFilesDirect(files) {
    const signRes = await fetch('/api/machine-incidents/sign-uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            files: files.map(f => ({ name: f.name, type: f.type, size: f.size })),
        }),
    });
    const signData = await signRes.json().catch(() => ({}));
    if (!signRes.ok) throw new Error(signData.error || 'No se pudo preparar la subida.');

    const attachments = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const u = signData.uploads[i];
        const putRes = await fetch(u.signed_url, {
            method: 'PUT',
            headers: { 'Content-Type': file.type, 'x-upsert': 'false' },
            body: file,
        });
        if (!putRes.ok) throw new Error(`No se pudo subir ${file.name}.`);
        attachments.push({
            path: u.path,
            file_name: u.file_name,
            mime_type: u.mime_type,
            size_bytes: u.size_bytes,
        });
    }
    return attachments;
}

function ReportarDrawer({ service, machine, currentUserId, onClose, onDone }) {
    const [descripcion, setDescripcion] = useState('');
    const [files, setFiles] = useState([]);
    const [saving, setSaving] = useState(false);
    const canSave = files.length > 0;

    const submit = async () => {
        setSaving(true);
        try {
            const user = getSessionUser();
            const attachments = await uploadFilesDirect(files);
            const res = await fetch('/api/machine-incidents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service_id: service.id,
                    machine_id: machine.id,
                    descripcion: descripcion.trim() || undefined,
                    attachments,
                    reportado_por_nombre: user ? `${user.name || ''} ${user.surname || ''}`.trim() : null,
                    reportado_por_id: user?.id ?? null,
                    reportado_por_dni: user?.dni ?? null,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                notify.error(err.error || 'Error al reportar');
                return;
            }
            onDone();
        } catch (e) {
            notify.error(e.message || 'Error al reportar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <DrawerShell title={`Reportar problema · ${machine.nombre}`} subtitle={service.name} onClose={onClose}>
            <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Descripción (opcional)</label>
                <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3} placeholder="¿Qué le pasa a la máquina?" style={textareaStyle} />
            </div>
            <FileInput files={files} setFiles={setFiles} required label="Foto o video de la falla" />
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Es obligatorio adjuntar al menos una foto o video. Si grabás video, que sea corto (máx ~15-20 seg, hasta 50 MB).
            </p>
            <DrawerActions onCancel={onClose} onSave={submit} saving={saving} disabled={!canSave} saveLabel="Reportar" />
        </DrawerShell>
    );
}

function TraspasoDrawer({ service, machine, services, currentUserId, onClose, onDone }) {
    const [serviceDestinoId, setServiceDestinoId] = useState('');
    const [files, setFiles] = useState([]);
    const [saving, setSaving] = useState(false);
    const canSave = serviceDestinoId && Number(serviceDestinoId) !== Number(service.id);

    const submit = async () => {
        setSaving(true);
        try {
            // En traspaso los archivos son opcionales; solo subimos si hay.
            const user = getSessionUser();
            const attachments = files.length > 0 ? await uploadFilesDirect(files) : [];
            const res = await fetch('/api/machine-incidents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service_id: service.id,
                    machine_id: machine.id,
                    tipo_falla: 'Traspaso',
                    service_destino_id: Number(serviceDestinoId),
                    attachments,
                    reportado_por_nombre: user ? `${user.name || ''} ${user.surname || ''}`.trim() : null,
                    reportado_por_id: user?.id ?? null,
                    reportado_por_dni: user?.dni ?? null,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                notify.error(err.error || 'Error al registrar traspaso');
                return;
            }
            onDone();
        } catch (e) {
            notify.error(e.message || 'Error al registrar traspaso');
        } finally {
            setSaving(false);
        }
    };

    const destOptions = useMemo(() => (
        services.filter(s => Number(s.id) !== Number(service.id)).map(s => ({ value: s.id, label: s.name }))
    ), [services, service.id]);

    return (
        <DrawerShell title={`Traspaso · ${machine.nombre}`} subtitle={service.name} onClose={onClose}>
            <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Servicio destino *</label>
                <SearchableSelect
                    options={destOptions}
                    value={serviceDestinoId}
                    onChange={(v) => setServiceDestinoId(v)}
                    placeholder="Seleccionar servicio destino..."
                    searchPlaceholder="Buscar servicio..."
                />
            </div>
            <FileInput files={files} setFiles={setFiles} required={false} label="Foto o video" />
            <DrawerActions onCancel={onClose} onSave={submit} saving={saving} disabled={!canSave} saveLabel="Registrar traspaso" />
        </DrawerShell>
    );
}

const selectStyle = { width: '100%', padding: '0.55rem 0.7rem', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.9rem', background: 'var(--color-surface)' };
const textareaStyle = { width: '100%', padding: '0.55rem 0.7rem', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit' };

function DrawerShell({ title, subtitle, onClose, children }) {
    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 50 }} />
            <div style={{
                position: 'fixed', top: 0, right: 0, bottom: 0,
                width: 'min(480px, 100vw)',
                background: 'var(--color-surface)',
                boxShadow: '0 0 40px rgba(0,0,0,0.18)',
                zIndex: 51, display: 'flex', flexDirection: 'column',
                animation: 'slideInDrawer 0.22s cubic-bezier(.2,.8,.2,1)',
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    <div>
                        {subtitle && <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{subtitle}</p>}
                        <h2 style={{ margin: '0.15rem 0 0', fontSize: '1.05rem', fontWeight: 700 }}>{title}</h2>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.4rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0.25rem' }}>×</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {children}
                </div>
            </div>
            <style>{`@keyframes slideInDrawer { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
        </>
    );
}

function DrawerActions({ onCancel, onSave, saving, disabled, saveLabel }) {
    return (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button onClick={onCancel} disabled={saving} style={{ flex: 1, padding: '0.65rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--color-surface)', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>Cancelar</button>
            <button onClick={onSave} disabled={saving || disabled} style={{ flex: 1, padding: '0.65rem', border: 'none', borderRadius: '6px', background: '#00AEEF', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', opacity: (saving || disabled) ? 0.5 : 1 }}>
                {saving ? 'Guardando...' : saveLabel}
            </button>
        </div>
    );
}

export default function MisMaquinasPage() {
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState(null);
    const [services, setServices] = useState([]);
    const [allServices, setAllServices] = useState([]);
    const [machines, setMachines] = useState([]);
    const [relations, setRelations] = useState([]); // service_machines rows
    const [incidents, setIncidents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedServiceId, setSelectedServiceId] = useState('');
    const [reportTarget, setReportTarget] = useState(null); // { service, machine }
    const [traspasoTarget, setTraspasoTarget] = useState(null);

    useEffect(() => {
        const user = getSessionUser();
        if (!user) { router.push('/login'); return; }
        setCurrentUser(user);
    }, [router]);

    const load = async () => {
        setLoading(true);
        try {
            const [svcWithMachines, allSvcs, allMachines, allRels, allIncidents] = await Promise.all([
                fetch('/api/services-with-machines').then(r => r.json()),
                fetch('/api/services').then(r => r.json()),
                fetch('/api/machines').then(r => r.json()),
                fetch('/api/service-machines').then(r => r.json()),
                fetch('/api/machine-incidents').then(r => r.json()),
            ]);
            setServices(Array.isArray(svcWithMachines) ? svcWithMachines : []);
            setAllServices(Array.isArray(allSvcs) ? allSvcs : []);
            setMachines(Array.isArray(allMachines) ? allMachines : []);
            setRelations(Array.isArray(allRels) ? allRels : []);
            setIncidents(Array.isArray(allIncidents) ? allIncidents : []);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (currentUser) load(); }, [currentUser]);

    const selectedService = useMemo(
        () => services.find(s => String(s.id) === String(selectedServiceId)) || null,
        [services, selectedServiceId]
    );

    const serviceMachines = useMemo(() => {
        if (!selectedService) return [];
        const machinesById = new Map(machines.map(m => [m.id, m]));
        return relations
            .filter(r => Number(r.service_id) === Number(selectedService.id) && r.quantity > 0)
            .map(r => ({ machine: machinesById.get(r.machine_id), quantity: r.quantity }))
            .filter(x => x.machine);
    }, [relations, machines, selectedService]);

    const serviceIncidents = useMemo(() => {
        if (!selectedService) return [];
        return incidents.filter(inc => Number(inc.service_id) === Number(selectedService.id));
    }, [incidents, selectedService]);

    return (
        <MainLayout>
            <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem 1rem' }}>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 1rem' }}>Máquinas e incidencias</h1>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: '0 0 1.5rem' }}>
                    Elegí un servicio para ver sus máquinas y reportar una incidencia o un traspaso.
                </p>

                <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Servicio</label>
                    <SearchableSelect
                        options={services.map(s => ({ value: s.id, label: `${s.name} (${s.machine_count} máq.)` }))}
                        value={selectedServiceId}
                        onChange={(v) => setSelectedServiceId(v)}
                        placeholder={loading ? 'Cargando servicios...' : 'Seleccionar servicio...'}
                        searchPlaceholder="Buscar servicio..."
                    />
                </div>

                {selectedService && (
                    <>
                        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '1rem 0 0.65rem' }}>Máquinas en {selectedService.name}</h2>
                        {serviceMachines.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay máquinas en este servicio.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border-color)', borderRadius: '10px', background: 'var(--color-surface)', overflow: 'hidden' }}>
                                {serviceMachines.map(({ machine, quantity }, idx) => (
                                    <div
                                        key={machine.id}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.8rem',
                                            padding: '0.85rem 1rem',
                                            borderTop: idx === 0 ? 'none' : '1px solid var(--border-color)',
                                            flexWrap: 'wrap',
                                        }}
                                    >
                                        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                                            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>{machine.nombre}</p>
                                            <p style={{ margin: '0.1rem 0 0', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Unidades: {quantity}</p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                                            <button
                                                onClick={() => setReportTarget({ service: selectedService, machine })}
                                                style={{ padding: '0.5rem 0.9rem', border: 'none', borderRadius: '7px', background: '#DC2626', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                                            >
                                                Reportar problema
                                            </button>
                                            <button
                                                onClick={() => setTraspasoTarget({ service: selectedService, machine })}
                                                style={{ padding: '0.5rem 0.9rem', border: '1px solid #00AEEF', borderRadius: '7px', background: 'transparent', color: '#00AEEF', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                                            >
                                                Traspaso
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {serviceIncidents.length > 0 && (
                            <>
                                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '1.75rem 0 0.65rem' }}>Incidencias reportadas</h2>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                                    {serviceIncidents.map(inc => (
                                        <div key={inc.id} style={{ padding: '0.75rem 0.85rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--color-surface)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'flex-start' }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>{inc.machine_nombre} · {inc.descripcion}</p>
                                                    {inc.tipo_falla && (
                                                        <span style={{ display: 'inline-block', marginTop: '0.25rem', padding: '0.12rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                                                            {inc.tipo_falla}
                                                            {inc.tipo_falla === 'Traspaso' && inc.service_destino_name && ` → ${inc.service_destino_name}`}
                                                        </span>
                                                    )}
                                                </div>
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                    {new Date(inc.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                                </span>
                                            </div>
                                            {inc.attachments && inc.attachments.length > 0 && (
                                                <div style={{ marginTop: '0.5rem' }}>
                                                    <AttachmentThumbs attachments={inc.attachments} size={56} />
                                                </div>
                                            )}
                                            <IncidentNotesThread incidentId={inc.id} />
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>

            {reportTarget && (
                <ReportarDrawer
                    service={reportTarget.service}
                    machine={reportTarget.machine}
                    currentUserId={currentUser?.id}
                    onClose={() => setReportTarget(null)}
                    onDone={() => { setReportTarget(null); load(); }}
                />
            )}
            {traspasoTarget && (
                <TraspasoDrawer
                    service={traspasoTarget.service}
                    machine={traspasoTarget.machine}
                    services={allServices}
                    currentUserId={currentUser?.id}
                    onClose={() => setTraspasoTarget(null)}
                    onDone={() => { setTraspasoTarget(null); load(); }}
                />
            )}
        </MainLayout>
    );
}
