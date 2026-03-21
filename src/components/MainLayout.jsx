'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export default function MainLayout({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // For easy dev migration, using localStorage for auth
        const saved = localStorage.getItem('currentUser');
        if (!saved) {
            router.push('/login');
        } else {
            setCurrentUser(JSON.parse(saved));
        }
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('currentUser');
        setCurrentUser(null);
        router.push('/login');
    };

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [pathname]);

    const getCurrentSectionLabel = () => {
        if (pathname === '/') return 'Dashboard';
        if (pathname === '/rrhh' || pathname === '/periodo-prueba') return 'RRHH';
        if (pathname === '/supervisores') return 'Supervisores';
        if (pathname === '/presentismo-admin') return 'Presentismo';
        if (pathname === '/config') return 'Configuracion';
        if (pathname === '/mi-panel' || pathname === '/mi-panel/presentismo') return 'Presentismo';
        if (pathname === '/mi-panel/relevamiento') return 'Pedidos Insumos';
        return 'LASIA';
    };

    if (!currentUser) return null; // Wait for auth

    return (
        <div className="app-wrapper">
            <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
                <div className="sidebar-logo">
                    LASIA <span>LIMPIEZA</span>
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
                    ) : (
                        <>
                            <Link href="/mi-panel">
                                <div className={`menu-item ${pathname === '/mi-panel' || pathname === '/mi-panel/presentismo' ? 'active' : ''}`}>
                                    📍 Presentismo
                                </div>
                            </Link>
                            <Link href="/mi-panel/relevamiento">
                                <div className={`menu-item ${pathname === '/mi-panel/relevamiento' ? 'active' : ''}`}>
                                    📦 Pedidos Insumos
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
                    Digitalización Integral<br />
                    {currentUser.name} {currentUser.surname}
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
