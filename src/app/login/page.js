'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Swal from 'sweetalert2';
import { saveSession } from '@/lib/session';

export default function LoginScreen() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isBiometricLoading, setIsBiometricLoading] = useState(false);
    const [themeMode, setThemeMode] = useState('light');
    const router = useRouter();

    useEffect(() => {
        const savedTheme = localStorage.getItem('themeMode');
        const initialTheme = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'light';
        setThemeMode(initialTheme);
        document.documentElement.dataset.theme = initialTheme;
        document.documentElement.style.colorScheme = initialTheme;
    }, []);

    useEffect(() => {
        document.documentElement.dataset.theme = themeMode;
        document.documentElement.style.colorScheme = themeMode;
        localStorage.setItem('themeMode', themeMode);
    }, [themeMode]);

    const handleQuickAccess = async (role) => {
        setError('');

        if (role === 'admin') {
            const user = { id: 0, name: 'Admin', surname: 'LASIA', dni: 'admin', role: 'admin' };
            saveSession(user);
            router.push('/');
            return;
        }

        if (role === 'purchases') {
            const user = { id: -10, name: 'Compras', surname: 'LASIA', dni: 'compras', role: 'purchases' };
            saveSession(user);
            router.push('/compras');
            return;
        }

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'supervisor', password: 'supervisor' })
            });

            const data = await res.json();

            if (res.ok && data.user) {
                saveSession(data.user);
                router.push('/mi-panel');
                return;
            }

            setError(data.error || 'No se pudo ingresar con el perfil supervisor.');
        } catch (err) {
            setError('Error de conexión al servidor.');
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
                    router.push('/'); // Dashboard Admin
                } else if (data.user.role === 'purchases') {
                    router.push('/compras');
                } else {
                    router.push('/mi-panel'); // Panel Supervisor
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
                <div className="login-brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <Image
                        src="/branding/logo-lasia-limpieza.png"
                        alt="LASIA Limpieza"
                        width={200}
                        height={48}
                        priority
                        style={{ objectFit: 'contain' }}
                    />
                    <label className="theme-switch" aria-label="Cambiar entre modo oscuro y claro" title={themeMode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
                        <input
                            type="checkbox"
                            checked={themeMode === 'dark'}
                            onChange={() => setThemeMode((current) => current === 'dark' ? 'light' : 'dark')}
                        />
                        <span className="theme-switch-track">
                            <span className="theme-switch-thumb" />
                        </span>
                    </label>
                </div>
                <div className="login-subtitle">
                    Portal de Gestion de Supervisores
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
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Ingrese su contraseña"
                            required
                        />
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '-0.25rem', marginBottom: '0.75rem' }}>
                        Para supervisores, el usuario es su DNI. Temporalmente también podés entrar con `supervisor / supervisor` para revisar la vista inicial.
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
            </div>
        </div>
    );
}
