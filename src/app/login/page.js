'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { saveSession } from '@/lib/session';
import { useTheme } from '@/lib/ThemeContext';

export default function LoginScreen() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isBiometricLoading, setIsBiometricLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const passwordRef = useRef(null);
    const { themeMode, toggleTheme } = useTheme();
    const router = useRouter();

    const ROLE_REDIRECT = {
        admin: '/',
        purchases: '/compras',
        supervisor: '/mi-panel',
        jefe_operativo: '/presentismo-admin',
        rrhh: '/rrhh',
        direccion: '/rrhh',
    };

    const handleQuickAccess = async (role) => {
        setError('');
        try {
            const res = await fetch('/api/auth/quick-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role }),
            });
            const data = await res.json();
            if (res.ok && data.user) {
                saveSession(data.user);
                router.push(ROLE_REDIRECT[role] || '/');
            } else {
                setError(data.error || 'No se pudo ingresar.');
            }
        } catch {
            setError('Error de conexión.');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (res.ok && data.user) {
                // En una app real usaríamos Cookies/JWT. Por ahora mantenemos localStorage
                // para afectar lo menos posible la migración inicial.
                saveSession(data.user);

                // Redirigir según rol
                if (data.user.role === 'admin') {
                    router.push('/');
                } else if (data.user.role === 'purchases') {
                    router.push('/compras');
                } else if (data.user.role === 'jefe_operativo') {
                    router.push('/presentismo-admin');
                } else if (data.user.role === 'rrhh') {
                    router.push('/rrhh');
                } else if (data.user.role === 'direccion') {
                    router.push('/rrhh');
                } else {
                    router.push('/mi-panel');
                }
            } else {
                setError(data.error || 'Usuario o contraseña incorrectos.');
            }
        } catch (err) {
            setError('Error de conexión al servidor.');
        }
    };

    const handleBiometricLogin = async () => {
        setIsBiometricLoading(true);
        setError('');
        try {
            const { default: Swal } = await import('sweetalert2');
            let currentUsername = null;
            let optionsRes = await fetch('/api/auth/webauthn/auth-options', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            let { options, discoverable } = await optionsRes.json();
            if (!options) throw new Error('No se pudieron generar las opciones de autenticacion');

            const { startAuthentication } = await import('@simplewebauthn/browser');
            let credential;
            try {
                credential = await startAuthentication({ optionsJSON: options });
            } catch (authErr) {
                if (!discoverable || authErr.name === 'NotAllowedError') {
                    const { value: dniInput } = await Swal.fire({
                        title: 'Ingresa tu DNI',
                        input: 'text',
                        inputLabel: 'Para continuar con la huella digital, ingresa tu DNI de usuario.',
                        inputPlaceholder: 'DNI',
                        showCancelButton: true,
                        confirmButtonText: 'Continuar',
                        cancelButtonText: 'Cancelar',
                        inputValidator: (value) => {
                            if (!value) return 'El DNI es requerido';
                        },
                    });
                    if (!dniInput) {
                        setIsBiometricLoading(false);
                        return;
                    }
                    currentUsername = dniInput.trim();
                    optionsRes = await fetch('/api/auth/webauthn/auth-options', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: currentUsername }),
                    });
                    const fallbackData = await optionsRes.json();
                    if (!fallbackData.options) throw new Error('No se pudieron generar las opciones de autenticacion');
                    credential = await startAuthentication({ optionsJSON: fallbackData.options });
                } else {
                    throw authErr;
                }
            }

            const verifyRes = await fetch('/api/auth/webauthn/auth-verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential, username: currentUsername }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || !verifyData.user) {
                throw new Error(verifyData.error || 'Autenticacion biometrica fallida');
            }

            saveSession(verifyData.user);
            if (verifyData.user.role === 'admin') {
                router.push('/');
            } else if (verifyData.user.role === 'purchases') {
                router.push('/compras');
            } else if (verifyData.user.role === 'rrhh') {
                router.push('/rrhh');
            } else if (verifyData.user.role === 'direccion') {
                router.push('/rrhh');
            } else {
                router.push('/mi-panel');
            }
        } catch (err) {
            setError(err.message || 'Error al iniciar sesion con biometria.');
        } finally {
            setIsBiometricLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-brand" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <Image
                        src="/branding/logo-lasia-limpieza.png"
                        alt="LASIA Limpieza"
                        width={260}
                        height={62}
                        priority
                        style={{ objectFit: 'contain', display: 'inline-block' }}
                    />
                </div>
                <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
                    <div className="form-group">
                        <label>Usuario</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="DNI del supervisor o admin"
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Contraseña</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                ref={passwordRef}
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Ingrese su contraseña"
                                required
                                style={{ width: '100%', paddingRight: '2.5rem' }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(v => !v)}
                                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}
                                tabIndex={-1}
                            >
                                {showPassword ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                )}
                            </button>
                        </div>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '-0.25rem', marginBottom: '0.75rem' }}>
                        Para supervisores, el usuario es su DNI.
                    </p>
                    {error && <p className="error-message" style={{ color: 'var(--error)', marginBottom: '10px', fontSize: '0.9rem', fontWeight: 600, textAlign: 'center' }}>{error}</p>}
                    <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.8rem 1rem', fontSize: '1.1rem', marginTop: '1rem' }}>
                        Ingresar
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: '100%', padding: '0.8rem 1rem', fontSize: '1.1rem', marginTop: '0.75rem' }}
                        onClick={handleBiometricLogin}
                        disabled={isBiometricLoading}
                    >
                        {isBiometricLoading ? 'Procesando...' : 'Ingresar con huella digital / Face ID'}
                    </button>
                </form>

                {process.env.NODE_ENV === 'development' && (
                    <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.85rem' }}>
                            Accesos rápidos
                        </p>
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ width: '100%', padding: '0.8rem 1rem' }}
                                onClick={() => handleQuickAccess('supervisor')}
                            >
                                Entrar como Supervisor
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ width: '100%', padding: '0.8rem 1rem' }}
                                onClick={() => handleQuickAccess('jefe_operativo')}
                            >
                                Entrar como Jefe Operativo
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ width: '100%', padding: '0.8rem 1rem' }}
                                onClick={() => handleQuickAccess('admin')}
                            >
                                Entrar como Admin
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ width: '100%', padding: '0.8rem 1rem' }}
                                onClick={() => handleQuickAccess('purchases')}
                            >
                                Entrar como Compras
                            </button>
                        </div>
                    </div>
                )}

                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                    <label className="theme-switch" aria-label="Cambiar entre modo oscuro y claro" title={themeMode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
                        <input
                            type="checkbox"
                            checked={themeMode === 'dark'}
                            onChange={toggleTheme}
                        />
                        <span className="theme-switch-track">
                            <span className="theme-switch-thumb" />
                        </span>
                    </label>
                </div>
            </div>
        </div>
    );
}
