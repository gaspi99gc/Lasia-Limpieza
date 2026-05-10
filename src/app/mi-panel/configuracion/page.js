'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { getSessionUser } from '@/lib/session';

export default function SupervisorConfigPage() {
    const [currentUser, setCurrentUser] = useState(null);
    const [biometricCount, setBiometricCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState(null);

    useEffect(() => {
        const user = getSessionUser();
        if (!user) return;
        setCurrentUser(user);

        const loadCount = async () => {
            try {
                const res = await fetch('/api/auth/webauthn/credentials-count', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ appUserId: user.app_user_id }),
                });
                const data = await res.json().catch(() => ({ count: 0 }));
                setBiometricCount(data.count || 0);
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };

        if (user.app_user_id) {
            loadCount();
        } else {
            setIsLoading(false);
        }
    }, []);

    const handleRegister = async () => {
        if (!currentUser?.app_user_id || isSaving) return;
        setIsSaving(true);
        setMessage(null);
        try {
            const resOpts = await fetch('/api/auth/webauthn/register-options', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appUserId: currentUser.app_user_id }),
            });
            const { options, error: optsError } = await resOpts.json();
            if (optsError || !options) throw new Error(optsError || 'No se pudieron generar las opciones de registro');

            const { startRegistration } = await import('@simplewebauthn/browser');
            const credential = await startRegistration({ optionsJSON: options });

            const resVerify = await fetch('/api/auth/webauthn/register-verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appUserId: currentUser.app_user_id, credential }),
            });
            const verifyData = await resVerify.json();
            if (!resVerify.ok || !verifyData.verified) {
                throw new Error(verifyData.error || 'No se pudo registrar el dispositivo biometrico');
            }

            setBiometricCount(1);
            setMessage({ type: 'success', text: 'Dispositivo biometrico registrado con exito.' });
        } catch (err) {
            setMessage({ type: 'error', text: err.message || 'No se pudo completar el registro biometrico.' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemove = async () => {
        if (!currentUser?.app_user_id || isSaving) return;
        if (!confirm('¿Eliminar el registro biometrico? Ya no podrás ingresar con huella digital o Face ID.')) return;
        setIsSaving(true);
        setMessage(null);
        try {
            const res = await fetch('/api/auth/webauthn/remove-credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appUserId: currentUser.app_user_id }),
            });
            if (!res.ok) throw new Error('Error al eliminar');
            setBiometricCount(0);
            setMessage({ type: 'success', text: 'Registro biometrico eliminado.' });
        } catch (err) {
            setMessage({ type: 'error', text: err.message || 'No se pudo eliminar el registro biometrico.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <MainLayout>
            <div style={{ maxWidth: '480px', margin: '0 auto', padding: '2rem 1rem' }}>
                <header style={{ marginBottom: '2rem' }}>
                    <h1>Configuracion</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Ajustes de tu cuenta</p>
                </header>

                <div className="card">
                    <h3 style={{ marginBottom: '0.5rem' }}>Dispositivo biometrico</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                        Registrá tu huella digital o Face ID para ingresar sin contraseña. Solo puede haber un dispositivo registrado a la vez.
                    </p>

                    {isLoading ? (
                        <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>
                    ) : !currentUser?.app_user_id ? (
                        <p style={{ color: 'var(--text-muted)' }}>No disponible para este usuario.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '0.75rem',
                                padding: '0.9rem 1rem', borderRadius: 'var(--radius-sm)',
                                background: biometricCount > 0 ? '#DCFCE7' : 'var(--color-muted-surface)',
                                color: biometricCount > 0 ? '#166534' : 'var(--text-muted)',
                                fontWeight: 600, fontSize: '0.95rem',
                            }}>
                                {biometricCount > 0 ? '✓ Dispositivo registrado' : 'Sin dispositivo registrado'}
                            </div>

                            {biometricCount > 0 ? (
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ color: 'var(--error)' }}
                                    onClick={handleRemove}
                                    disabled={isSaving}
                                >
                                    {isSaving ? 'Eliminando...' : 'Eliminar registro biometrico'}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={handleRegister}
                                    disabled={isSaving}
                                >
                                    {isSaving ? 'Registrando...' : 'Registrar huella digital / Face ID'}
                                </button>
                            )}

                            {message && (
                                <div style={{
                                    padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm)',
                                    background: message.type === 'success' ? '#DCFCE7' : '#FEE2E2',
                                    color: message.type === 'success' ? '#166534' : '#991B1B',
                                    fontSize: '0.9rem',
                                }}>
                                    {message.text}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}
