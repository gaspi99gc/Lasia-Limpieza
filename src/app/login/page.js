'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginScreen() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();

    const handleQuickAccess = async (role) => {
        setError('');

        if (role === 'admin') {
            const user = { id: 0, name: 'Admin', surname: 'LASIA', dni: 'admin', role: 'admin' };
            localStorage.setItem('currentUser', JSON.stringify(user));
            router.push('/');
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
                localStorage.setItem('currentUser', JSON.stringify(data.user));
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
                localStorage.setItem('currentUser', JSON.stringify(data.user));

                // Redirigir según rol
                if (data.user.role === 'admin') {
                    router.push('/'); // Dashboard Admin
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

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-logo">
                    LASIA <span>Limpia</span>
                </div>
                <div className="login-subtitle">
                    Portal de Gestión de Supervisores
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
                    </div>
                </div>
            </div>
        </div>
    );
}
