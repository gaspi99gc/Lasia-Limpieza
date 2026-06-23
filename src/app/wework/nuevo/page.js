'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import SearchableSelect from '@/components/SearchableSelect';
import { getSessionUser } from '@/lib/session';
import { isWeworkService } from '@/lib/wework';
import { notify } from '@/lib/toast';
import { FileInput, uploadFilesDirect } from '@/components/wework/shared';

export default function WeWorkNuevoTicketPage() {
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState(null);
    const [services, setServices] = useState([]);
    const [loadingSvc, setLoadingSvc] = useState(true);

    const [step, setStep] = useState(1);
    const [serviceId, setServiceId] = useState('');

    const [titulo, setTitulo] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [files, setFiles] = useState([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const user = getSessionUser();
        if (!user) { router.push('/login'); return; }
        setCurrentUser(user);
    }, [router]);

    useEffect(() => {
        if (!currentUser) return;
        (async () => {
            setLoadingSvc(true);
            try {
                const res = await fetch('/api/services');
                const data = await res.json();
                const all = Array.isArray(data) ? data : [];
                setServices(all.filter(s => isWeworkService(s.name)));
            } finally {
                setLoadingSvc(false);
            }
        })();
    }, [currentUser]);

    const selectedService = useMemo(
        () => services.find(s => String(s.id) === String(serviceId)) || null,
        [services, serviceId]
    );

    const canSave = selectedService && titulo.trim() && descripcion.trim() && files.length > 0;

    const submit = async () => {
        if (!canSave) return;
        setSaving(true);
        try {
            const user = getSessionUser();
            const attachments = await uploadFilesDirect(files);
            const res = await fetch('/api/maintenance-tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service_id: Number(selectedService.id),
                    titulo: titulo.trim(),
                    descripcion: descripcion.trim(),
                    attachments,
                    reportado_por_id: user?.app_user_id || user?.id || null,
                    reportado_por_nombre: user ? `${user.name || ''} ${user.surname || ''}`.trim() || 'WeWork' : 'WeWork',
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                notify.error(err.error || 'Error al crear ticket');
                return;
            }
            notify.success('Ticket creado correctamente');
            // Reset y volver al inicio del flujo
            setTitulo('');
            setDescripcion('');
            setFiles([]);
            router.push('/wework');
        } catch (e) {
            notify.error(e.message || 'Error al crear ticket');
        } finally {
            setSaving(false);
        }
    };

    return (
        <MainLayout>
            <div className="wework-page">
                {step === 1 && (
                    <div className="wework-step-card">
                        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.4rem' }}>Crear ticket</h1>
                        <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: '0 0 1.5rem' }}>
                            Elegí el servicio sobre el que querés reportar el incidente.
                        </p>

                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Servicio</label>
                        <SearchableSelect
                            options={services.map(s => ({ value: s.id, label: s.name }))}
                            value={serviceId}
                            onChange={(v) => setServiceId(v)}
                            placeholder={loadingSvc ? 'Cargando servicios...' : 'Seleccionar servicio...'}
                            searchPlaceholder="Buscar servicio..."
                        />

                        <button
                            type="button"
                            onClick={() => setStep(2)}
                            disabled={!serviceId}
                            style={{
                                marginTop: '1.5rem', width: '100%',
                                padding: '0.95rem', borderRadius: '10px',
                                border: 'none', background: '#00AEEF', color: '#fff',
                                fontWeight: 700, fontSize: '1rem',
                                cursor: serviceId ? 'pointer' : 'not-allowed',
                                opacity: serviceId ? 1 : 0.45,
                            }}
                        >
                            Continuar
                        </button>

                        <Link href="/wework" style={{ display: 'block', textAlign: 'center', marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.88rem', fontWeight: 600, textDecoration: 'none' }}>
                            Ver histórico de tickets
                        </Link>
                    </div>
                )}

                {step === 2 && selectedService && (
                    <div className="wework-step-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                aria-label="Volver"
                                style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '999px', width: '36px', height: '36px', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                            >
                                ←
                            </button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Servicio</p>
                                <strong style={{ fontSize: '1.05rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedService.name}</strong>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setStep(1)}
                            style={{ background: 'none', border: 'none', color: '#00AEEF', fontSize: '0.82rem', cursor: 'pointer', padding: 0, fontWeight: 600, marginBottom: '1.25rem' }}
                        >
                            Cambiar servicio
                        </button>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Título *</label>
                                <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={120} placeholder="Asunto corto del incidente" style={{ width: '100%', padding: '0.75rem 0.85rem', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '1rem', background: 'var(--color-surface)' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Descripción *</label>
                                <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={4} placeholder="Contanos qué está pasando" style={{ width: '100%', padding: '0.75rem 0.85rem', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '1rem', resize: 'vertical', fontFamily: 'inherit', minHeight: '110px' }} />
                            </div>
                            <FileInput files={files} setFiles={setFiles} required label="Foto o video del incidente" />
                            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                Es obligatorio adjuntar al menos una foto o video. Si grabás video, que sea corto (máx ~15-20 seg, hasta 50 MB).
                            </p>
                            <button
                                type="button"
                                onClick={submit}
                                disabled={saving || !canSave}
                                style={{
                                    width: '100%', padding: '0.95rem', borderRadius: '10px',
                                    border: 'none', background: '#00AEEF', color: '#fff',
                                    fontWeight: 700, fontSize: '1rem',
                                    cursor: (saving || !canSave) ? 'not-allowed' : 'pointer',
                                    opacity: (saving || !canSave) ? 0.5 : 1,
                                }}
                            >
                                {saving ? 'Enviando...' : 'Crear ticket'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <style jsx>{`
                .wework-page {
                    max-width: 760px;
                    margin: 0 auto;
                    padding: 1.25rem 1rem calc(2rem + env(safe-area-inset-bottom));
                }
                .wework-step-card {
                    background: var(--color-surface);
                    border: 1px solid var(--border-color);
                    border-radius: 14px;
                    padding: 1.25rem 1.1rem;
                }
                @media (min-width: 700px) {
                    .wework-step-card {
                        padding: 1.75rem 1.5rem;
                    }
                    .wework-page {
                        padding: 1.75rem 1.25rem 3rem;
                    }
                }
            `}</style>
        </MainLayout>
    );
}
