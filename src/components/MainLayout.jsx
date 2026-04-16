'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getSessionUser, clearSession } from '@/lib/session';

export default function MainLayout({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [themeMode, setThemeMode] = useState('light');
    const [themeLoaded, setThemeLoaded] = useState(false);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const saved = getSessionUser();
        if (!saved) {
            clearSession();
            router.push('/login');
        } else {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCurrentUser(saved);
        }
    }, [router]);

    useEffect(() => {
        const savedTheme = localStorage.getItem('themeMode');
        const initialTheme = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'light';

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setThemeMode(initialTheme);
        document.documentElement.dataset.theme = initialTheme;
        document.documentElement.style.colorScheme = initialTheme;
        setThemeLoaded(true);
    }, []);

    useEffect(() => {
        if (!themeLoaded) {
            return;
        }

        document.documentElement.dataset.theme = themeMode;
        document.documentElement.style.colorScheme = themeMode;
        localStorage.setItem('themeMode', themeMode);
    }, [themeMode, themeLoaded]);

    const handleLogout = () => {
        clearSession();
        setCurrentUser(null);
        router.push('/login');
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsMobileMenuOpen(false);
    }, [pathname]);

    const getCurrentSectionLabel = () => {
        if (pathname === '/') return 'Dashboard';
        if (pathname === '/compras') return 'Compras';
        if (pathname === '/compras/servicios') return 'Servicios';
        if (pathname === '/compras/realizados') return 'Pedidos Completos';
        if (pathname === '/rrhh' || pathname === '/periodo-prueba') return 'RRHH';
        if (pathname === '/supervisores') return 'Supervisores';
        if (pathname === '/presentismo-admin') return 'Presentismo';
        if (pathname === '/config') return 'Configuracion';
        if (pathname === '/mi-panel' || pathname === '/mi-panel/presentismo') return 'Presentismo';
        if (pathname === '/mi-panel/historico-pedidos') return 'Historico de Pedidos';
        return 'LASIA';
    };

    if (!currentUser) return null; // Wait for auth

    return (
        <div className="app-wrapper">
            <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
                <div className="sidebar-logo">
                    <Image
                        src="/branding/logo-lasia-limpieza.png"
                        alt="LASIA Limpieza"
                        className="sidebar-logo-image"
                        width={240}
                        height={56}
                        priority
                    />
                    <button
                        type="button"
                        className="mobile-menu-close"
                        onClick={() => setIsMobileMenuOpen(false)}
                        aria-label="Cerrar menu"
                    >
                        ✕
                    </button>
                </div>
                <nav className="sidebar-menu">
                    {currentUser.role === 'admin' ? (
                        <>
                            <Link href="/">
                                <div className={`menu-item ${pathname === '/' ? 'active' : ''}`}>
                                    🏠 Dashboard
                                </div>
                            </Link>
                            <Link href="/rrhh">
                                <div className={`menu-item ${pathname === '/rrhh' || pathname === '/periodo-prueba' ? 'active' : ''}`}>
                                    👥 RRHH
                                </div>
                            </Link>
                            <Link href="/supervisores">
                                <div className={`menu-item ${pathname === '/supervisores' ? 'active' : ''}`}>
                                    📋 Supervisores
                                </div>
                            </Link>
                            <Link href="/presentismo-admin">
                                <div className={`menu-item ${pathname === '/presentismo-admin' ? 'active' : ''}`}>
                                    🟢 Presentismo
                                </div>
                            </Link>
                            <Link href="/config">
                                <div className={`menu-item ${pathname === '/config' ? 'active' : ''}`}>
                                    ⚙ Configuración
                                </div>
                            </Link>
                        </>
                    ) : currentUser.role === 'purchases' ? (
                        <>
                            <Link href="/compras">
                                <div className={`menu-item ${pathname === '/compras' ? 'active' : ''}`}>
                                    🛒 Compras
                                </div>
                            </Link>
                            <Link href="/compras/servicios">
                                <div className={`menu-item ${pathname === '/compras/servicios' ? 'active' : ''}`}>
                                    📍 Servicios
                                </div>
                            </Link>
                            <Link href="/compras/realizados">
                                <div className={`menu-item ${pathname === '/compras/realizados' ? 'active' : ''}`}>
                                    ✅ Pedidos Completos
                                </div>
                            </Link>
                        </>
                    ) : (
                        <>
                            <Link href="/mi-panel">
                                <div className={`menu-item ${pathname === '/mi-panel' || pathname === '/mi-panel/presentismo' ? 'active' : ''}`}>
                                    📍 Presentismo
                                </div>
                            </Link>
                            <Link href="/mi-panel/historico-pedidos">
                                <div className={`menu-item ${pathname === '/mi-panel/historico-pedidos' ? 'active' : ''}`}>
                                    🧾 Historico de Pedidos
                                </div>
                            </Link>
                        </>
                    )}
                </nav>
                <div className="sidebar-actions" style={{ padding: '1rem 2rem' }}>
                    <button className="btn btn-secondary" style={{ width: '100%', background: 'rgba(255,255,255,0.1)', color: '#fff' }} onClick={handleLogout}>
                        🚪 Cerrar Sesión
                    </button>
                </div>
                <div className="sidebar-footer" style={{ padding: '2rem', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>
                    <div className="sidebar-footer-row">
                        <div>
                            Digitalización Integral<br />
                            {currentUser.name} {currentUser.surname}
                        </div>
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
                </div>
            </aside>

            {isMobileMenuOpen && (
                <button
                    type="button"
                    className="sidebar-backdrop"
                    onClick={() => setIsMobileMenuOpen(false)}
                    aria-label="Cerrar menu lateral"
                />
            )}

            <main className="main-container">
                <div className="mobile-topbar">
                    <button
                        type="button"
                        className="mobile-menu-button"
                        onClick={() => setIsMobileMenuOpen(true)}
                        aria-label="Abrir menu"
                    >
                        ☰
                    </button>
                    <div className="mobile-topbar-meta">
                        <strong>{getCurrentSectionLabel()}</strong>
                        <span>{currentUser.name} {currentUser.surname}</span>
                    </div>
                </div>
                <div className="content-area">
                    {children}
                </div>
            </main>
        </div>
    );
}
