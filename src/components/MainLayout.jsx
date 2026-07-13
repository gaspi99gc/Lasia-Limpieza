'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getSessionUser, clearSession } from '@/lib/session';
import { useTheme } from '@/lib/ThemeContext';

function TabParamReader({ onTab }) {
    const params = useSearchParams();
    useEffect(() => {
        onTab(params.get('tab'));
    }, [params, onTab]);
    return null;
}

function Icon({ children, size = 18, stroke = 1.8 }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {children}
        </svg>
    );
}

function NavIcon({ name }) {
    const icons = {
        dashboard: <><path d="M3 13h8V3H3z" /><path d="M13 21h8v-6h-8z" /><path d="M13 10h8V3h-8z" /><path d="M3 21h8v-4H3z" /></>,
        rrhh: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 8v6" /><path d="M23 11h-6" /></>,
        personal: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></>,
        periodos: <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" /><path d="m9 14 2 2 4-4" /></>,
        licencias: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M6 9h4" /><path d="M6 13h2" /><circle cx="16" cy="11" r="2" /><path d="M13 17c0-1.7 1.3-3 3-3s3 1.3 3 3" /></>,
        calendario: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></>,
        supervisors: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-5-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
        presentismo: <><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></>,
        users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
        supply: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></>,
        config: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.09V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9.2 20a1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.09-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4 9.2a1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.09V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 14 4a1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.27.3.47.65.6 1 .08.28.38.6 1.09.6H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.4Z" /></>,
        compras: <><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /><path d="M3 4h2l2.2 10.5a1 1 0 0 0 1 .8h9.8a1 1 0 0 0 1-.76L21 7H7" /></>,
        maquinaria: <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></>,
        servicios: <><path d="M12 21s-6-4.35-6-10a6 6 0 1 1 12 0c0 5.65-6 10-6 10Z" /><circle cx="12" cy="11" r="2.5" /></>,
        pagos: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M6 15h4" /></>,
        legales: <><path d="M12 3v18" /><path d="M6 7h12" /><path d="M5 7l-2 6a3 3 0 0 0 6 0z" /><path d="M19 7l-2 6a3 3 0 0 0 6 0z" /><path d="M8 21h8" /></>,
        realizados: <><path d="M20 6 9 17l-5-5" /></>,
        remito: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6" /><path d="M9 17h6" /><path d="M9 9h1" /></>,
        recibo: <><path d="M4 2v20l3-2 3 2 2-2 2 2 3-2 3 2V2l-3 2-3-2-2 2-2-2-3 2-3-2z" /><path d="M8 9h8" /><path d="M8 13h6" /></>,
        historico: <><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></>,
        informe: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></>,
        ticket: <><path d="M2 9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" /><path d="M9 7v12" /><path d="M9 11h0" /><path d="M9 15h0" /></>,
        add: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
        logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
        menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
        close: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
        search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
        bell: <><path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
        sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></>,
    };

    return <Icon>{icons[name] || icons.dashboard}</Icon>;
}

export default function MainLayout({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { themeMode, toggleTheme } = useTheme();
    const router = useRouter();
    const pathname = usePathname();
    const [tabParam, setTabParam] = useState(null);

    const getInitials = () => {
        const name = currentUser?.name?.trim()?.[0] || 'L';
        const surname = currentUser?.surname?.trim()?.[0] || 'A';
        return `${name}${surname}`.toUpperCase();
    };

    const getNavigationGroups = () => {
        if (currentUser?.role === 'admin') {
            return [
                {
                    title: 'General',
                    items: [
                        { href: '/', label: 'Dashboard', icon: 'dashboard', active: pathname === '/' },
                    ],
                },
                {
                    title: 'RRHH',
                    items: [
                        { href: '/alta-personal', label: 'Alta de Personal', icon: 'rrhh', active: pathname === '/alta-personal' },
                        { href: '/rrhh?tab=calendario', label: 'Calendario', icon: 'calendario', active: pathname === '/rrhh' && (!tabParam || tabParam === 'calendario') },
                        { href: '/rrhh?tab=personal', label: 'Personal', icon: 'personal', active: pathname === '/rrhh' && tabParam === 'personal' },
                        { href: '/rrhh?tab=periodos', label: 'Periodos de prueba', icon: 'periodos', active: pathname === '/rrhh' && tabParam === 'periodos' },
                        { href: '/rrhh?tab=licencias', label: 'Licencias', icon: 'licencias', active: pathname === '/rrhh' && tabParam === 'licencias' },
                        { href: '/rrhh?tab=informes', label: 'Informes', icon: 'informe', active: pathname === '/rrhh' && tabParam === 'informes' },
                        { href: '/rrhh?tab=recibos', label: 'Recibos', icon: 'recibo', active: pathname === '/rrhh' && tabParam === 'recibos' },
                    ],
                },
                {
                    title: 'Supervisión',
                    items: [
                        { href: '/config?tab=supervisors', label: 'Supervisores', icon: 'supervisors', active: pathname === '/config' && (!tabParam || tabParam === 'supervisors') },
                        { href: '/config?tab=services', label: 'Servicios', icon: 'servicios', active: pathname === '/config' && tabParam === 'services' },
                        { href: '/mapa-servicios', label: 'Mapa de Servicios', icon: 'servicios', active: pathname === '/mapa-servicios' },
                        { href: '/config?tab=supplies', label: 'Insumos', icon: 'supply', active: pathname === '/config' && tabParam === 'supplies' },
                        { href: '/informe-fichada', label: 'Informe de Fichada', icon: 'informe', active: pathname === '/informe-fichada' },
                    ],
                },
                {
                    title: 'WeWork',
                    items: [
                        { href: '/admin/wework?tab=tickets', label: 'Tickets', icon: 'ticket', active: pathname === '/admin/wework' && (!tabParam || tabParam === 'tickets') },
                    ],
                },
                {
                    title: 'Finanzas',
                    items: [
                        { href: '/pagos', label: 'Pagos', icon: 'pagos', active: pathname === '/pagos' },
                    ],
                },
                {
                    title: 'Sistema',
                    items: [
                        { href: '/usuarios', label: 'Usuarios', icon: 'users', active: pathname === '/usuarios' },
                    ],
                },
            ];
        }

        if (currentUser?.role === 'purchases') {
            return [
                {
                    title: 'Gestión de Pedidos',
                    items: [
                        { href: '/compras/pedido-insumos', label: 'Crear Pedido', icon: 'supply', active: pathname === '/compras/pedido-insumos' },
                        { href: '/compras', label: 'Pedidos de Insumos', icon: 'compras', active: pathname === '/compras' },
                        { href: '/compras/realizados', label: 'Pedidos Completos', icon: 'realizados', active: pathname === '/compras/realizados' },
                        { href: '/compras/remitos', label: 'Remitos', icon: 'remito', active: pathname === '/compras/remitos' },
                    ],
                },
                {
                    title: 'Catálogo',
                    items: [
                        { href: '/compras/insumos', label: 'Insumos', icon: 'supply', active: pathname === '/compras/insumos' },
                        { href: '/compras/maquinaria', label: 'Maquinaria', icon: 'maquinaria', active: pathname === '/compras/maquinaria' },
                    ],
                },
                {
                    title: 'Operaciones',
                    items: [
                        { href: '/compras/servicios', label: 'Servicios', icon: 'servicios', active: pathname === '/compras/servicios' },
                        { href: '/mapa-servicios', label: 'Mapa de Servicios', icon: 'servicios', active: pathname === '/mapa-servicios' },
                    ],
                },
            ];
        }

        if (currentUser?.role === 'jefe_operativo') {
            return [
                {
                    title: 'General',
                    items: [
                        { href: '/', label: 'Dashboard', icon: 'dashboard', active: pathname === '/' },
                    ],
                },
                {
                    title: 'Supervisión',
                    items: [
                        { href: '/presentismo-admin', label: 'Asistencia en vivo', icon: 'presentismo', active: pathname === '/presentismo-admin' },
                        { href: '/supervisores', label: 'Supervisores', icon: 'supervisors', active: pathname === '/supervisores' },
                        { href: '/informe-fichada', label: 'Informe de Fichada', icon: 'informe', active: pathname === '/informe-fichada' },
                        { href: '/operaciones/servicios', label: 'Servicios', icon: 'servicios', active: pathname === '/operaciones/servicios' },
                        { href: '/mapa-servicios', label: 'Mapa de Servicios', icon: 'servicios', active: pathname === '/mapa-servicios' },
                        { href: '/compras/maquinaria', label: 'Maquinaria', icon: 'maquinaria', active: pathname === '/compras/maquinaria' },
                    ],
                },
                {
                    title: 'RRHH',
                    items: [
                        { href: '/alta-personal', label: 'Alta de Personal', icon: 'rrhh', active: pathname === '/alta-personal' },
                        { href: '/rrhh?tab=calendario', label: 'Calendario', icon: 'calendario', active: pathname === '/rrhh' && (!tabParam || tabParam === 'calendario') },
                        { href: '/rrhh?tab=personal', label: 'Personal', icon: 'personal', active: pathname === '/rrhh' && tabParam === 'personal' },
                        { href: '/rrhh?tab=periodos', label: 'Periodos de prueba', icon: 'periodos', active: pathname === '/rrhh' && tabParam === 'periodos' },
                        { href: '/rrhh?tab=licencias', label: 'Licencias', icon: 'licencias', active: pathname === '/rrhh' && tabParam === 'licencias' },
                        { href: '/rrhh?tab=informes', label: 'Informes', icon: 'informe', active: pathname === '/rrhh' && tabParam === 'informes' },
                    ],
                },
            ];
        }

        if (currentUser?.role === 'rrhh') {
            return [
                {
                    title: 'General',
                    items: [
                        { href: '/', label: 'Dashboard', icon: 'dashboard', active: pathname === '/' },
                    ],
                },
                {
                    title: 'RRHH',
                    items: [
                        { href: '/alta-personal', label: 'Alta de Personal', icon: 'rrhh', active: pathname === '/alta-personal' },
                        { href: '/rrhh?tab=calendario', label: 'Calendario', icon: 'calendario', active: pathname === '/rrhh' && (!tabParam || tabParam === 'calendario') },
                        { href: '/rrhh?tab=personal', label: 'Personal', icon: 'personal', active: pathname === '/rrhh' && tabParam === 'personal' },
                        { href: '/rrhh?tab=periodos', label: 'Periodos de prueba', icon: 'periodos', active: pathname === '/rrhh' && tabParam === 'periodos' },
                        { href: '/rrhh?tab=licencias', label: 'Licencias', icon: 'licencias', active: pathname === '/rrhh' && tabParam === 'licencias' },
                        { href: '/rrhh?tab=informes', label: 'Informes', icon: 'informe', active: pathname === '/rrhh' && tabParam === 'informes' },
                        { href: '/rrhh?tab=legales', label: 'Legales', icon: 'legales', active: pathname === '/rrhh' && tabParam === 'legales' },
                    ],
                },
            ];
        }

        if (currentUser?.role === 'operaciones') {
            return [
                {
                    title: 'Operaciones',
                    items: [
                        { href: '/informe-fichada', label: 'Informe de Fichada', icon: 'informe', active: pathname === '/informe-fichada' },
                        { href: '/mi-panel/informes', label: 'Informes', icon: 'informe', active: pathname === '/mi-panel/informes' },
                        { href: '/rrhh?tab=calendario', label: 'Calendario', icon: 'calendario', active: pathname === '/rrhh' && (!tabParam || tabParam === 'calendario') },
                    ],
                },
            ];
        }

        if (currentUser?.role === 'supervisor_tecnico') {
            return [
                {
                    title: 'Supervisión Técnica',
                    items: [
                        { href: '/mi-panel-tecnico?tab=pedidos', label: 'Pedidos', icon: 'supply', active: pathname === '/mi-panel-tecnico' && tabParam !== 'incidencias' },
                        { href: '/mi-panel-tecnico?tab=incidencias', label: 'Incidencias', icon: 'maquinaria', active: pathname === '/mi-panel-tecnico' && tabParam === 'incidencias' },
                    ],
                },
            ];
        }

        if (currentUser?.role === 'wework') {
            return [
                {
                    title: 'Mantenimiento',
                    items: [
                        { href: '/wework/nuevo', label: 'Crear ticket', icon: 'add', active: pathname === '/wework/nuevo' },
                        { href: '/wework', label: 'Histórico de tickets', icon: 'ticket', active: pathname === '/wework' },
                    ],
                },
                {
                    title: 'Activos',
                    items: [
                        { href: '/wework/maquinaria', label: 'Maquinaria', icon: 'maquinaria', active: pathname === '/wework/maquinaria' },
                        { href: '/wework/stock', label: 'Stock de insumos', icon: 'supply', active: pathname === '/wework/stock', badge: 'En proceso', badgeWip: true },
                    ],
                },
                {
                    title: 'Operación',
                    items: [
                        { href: '/wework/tareas', label: 'Tareas Mantenimiento', icon: 'periodos', active: pathname === '/wework/tareas' },
                        { href: '/wework/capacitaciones', label: 'Capacitaciones', icon: 'personal', active: pathname === '/wework/capacitaciones', badge: 'En proceso', badgeWip: true },
                        { href: '/wework/rutinas', label: 'Rutinas', icon: 'periodos', active: pathname === '/wework/rutinas', badge: 'En proceso', badgeWip: true },
                    ],
                },
            ];
        }

        if (currentUser?.role === 'mantenimiento') {
            return [
                {
                    title: 'Mantenimiento',
                    items: [
                        { href: '/mantenimiento', label: 'Tickets', icon: 'ticket', active: pathname === '/mantenimiento' },
                        { href: '/mantenimiento/tareas', label: 'Tareas Mantenimiento', icon: 'periodos', active: pathname === '/mantenimiento/tareas' },
                    ],
                },
            ];
        }

        if (currentUser?.role === 'direccion') {
            return [
                {
                    title: 'General',
                    items: [
                        { href: '/', label: 'Dashboard', icon: 'dashboard', active: pathname === '/' },
                    ],
                },
                {
                    title: 'RRHH',
                    items: [
                        { href: '/rrhh?tab=calendario', label: 'Calendario', icon: 'calendario', active: pathname === '/rrhh' && (!tabParam || tabParam === 'calendario') },
                        { href: '/rrhh?tab=personal', label: 'Personal', icon: 'personal', active: pathname === '/rrhh' && tabParam === 'personal' },
                        { href: '/rrhh?tab=periodos', label: 'Periodos de prueba', icon: 'periodos', active: pathname === '/rrhh' && tabParam === 'periodos' },
                        { href: '/rrhh?tab=licencias', label: 'Licencias', icon: 'licencias', active: pathname === '/rrhh' && tabParam === 'licencias' },
                        { href: '/rrhh?tab=informes', label: 'Informes', icon: 'informe', active: pathname === '/rrhh' && tabParam === 'informes' },
                        { href: '/rrhh?tab=legales', label: 'Legales', icon: 'legales', active: pathname === '/rrhh' && tabParam === 'legales' },
                    ],
                },
                {
                    title: 'Catálogo',
                    items: [
                        { href: '/config?tab=services', label: 'Servicios', icon: 'servicios', active: pathname === '/config' && tabParam === 'services' },
                        { href: '/mapa-servicios', label: 'Mapa de Servicios', icon: 'servicios', active: pathname === '/mapa-servicios' },
                        { href: '/config?tab=supplies', label: 'Insumos', icon: 'supply', active: pathname === '/config' && tabParam === 'supplies' },
                    ],
                },
                {
                    title: 'Finanzas',
                    items: [
                        { href: '/pagos', label: 'Pagos', icon: 'pagos', active: pathname === '/pagos' },
                    ],
                },
            ];
        }

        return [
            {
                title: 'Presentismo',
                items: [
                    { href: '/mi-panel', label: 'Presentismo', icon: 'presentismo', active: pathname === '/mi-panel' || pathname === '/mi-panel/presentismo' },
                    { href: '/mi-panel/mis-fichadas', label: 'Mis fichadas', icon: 'informe', active: pathname === '/mi-panel/mis-fichadas' },
                ],
            },
            {
                title: 'Pedidos',
                items: [
                    { href: '/mi-panel/pedido-insumos', label: 'Pedido de Insumos', icon: 'supply', active: pathname === '/mi-panel/pedido-insumos' },
                    { href: '/mi-panel/historico-pedidos', label: 'Histórico de Pedidos', icon: 'historico', active: pathname === '/mi-panel/historico-pedidos' },
                ],
            },
            {
                title: 'Máquinas',
                items: [
                    { href: '/mi-panel/maquinas', label: 'Máquinas', icon: 'maquinaria', active: pathname.startsWith('/mi-panel/maquinas') },
                ],
            },
            {
                title: 'Sistema',
                items: [
                    { href: '/mi-panel/configuracion', label: 'Configuración', icon: 'config', active: pathname === '/mi-panel/configuracion' },
                ],
            },
        ];
    };

    const [sessionExpired, setSessionExpired] = useState(false);

    useEffect(() => {
        const saved = getSessionUser();
        if (!saved) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSessionExpired(true);
        } else {
            setCurrentUser(saved);
        }
    }, []);

    const handleLogout = async () => {
        clearSession();
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
        setCurrentUser(null);
        router.push('/login');
    };

    const handleSessionExpiredReload = async () => {
        clearSession();
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
        router.push('/login');
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsMobileMenuOpen(false);
    }, [pathname]);

    const getCurrentSectionLabel = () => {
        if (pathname === '/') return 'Dashboard';
        if (pathname === '/mapa-servicios') return 'Mapa de Servicios';
        if (pathname === '/pagos') return 'Pagos';
        if (pathname === '/compras') return 'Compras';
        if (pathname === '/compras/servicios') return 'Servicios';
        if (pathname === '/compras/realizados') return 'Pedidos Completos';
        if (pathname === '/rrhh') return tabParam === 'personal' ? 'Personal' : tabParam === 'periodos' ? 'Periodos de prueba' : tabParam === 'licencias' ? 'Licencias' : tabParam === 'informes' ? 'Informes' : tabParam === 'recibos' ? 'Recibos' : tabParam === 'legales' ? 'Legales' : 'Calendario';
        if (pathname === '/periodo-prueba') return 'Periodos de prueba';
        if (pathname === '/supervisores') return 'Supervisores';
        if (pathname === '/informe-fichada') return 'Informe de Fichada';
        if (pathname === '/presentismo-admin') return 'Asistencia en vivo';
        if (pathname === '/usuarios') return 'Usuarios';
        if (pathname === '/alta-personal') return 'Alta de Personal';
        if (pathname === '/compras/insumos') return 'Insumos';
        if (pathname === '/compras/maquinaria') return 'Maquinaria';
        if (pathname === '/operaciones/servicios') return 'Servicios';
        if (pathname === '/config') {
            if (tabParam === 'services') return 'Servicios';
            if (tabParam === 'supplies') return 'Insumos';
            return 'Supervisores';
        }
        if (pathname === '/mi-panel' || pathname === '/mi-panel/presentismo') return 'Presentismo';
        if (pathname === '/mi-panel/mis-fichadas') return 'Mis fichadas';
        if (pathname === '/mi-panel/pedido-insumos') return 'Pedido de Insumos';
        if (pathname === '/compras/pedido-insumos') return 'Crear Pedido';
        if (pathname === '/mi-panel/historico-pedidos') return 'Historico de Pedidos';
        if (pathname === '/mi-panel-tecnico') return 'Panel del Supervisor Técnico';
        if (pathname === '/wework') return 'Histórico de tickets';
        if (pathname === '/wework/nuevo') return 'Crear ticket';
        if (pathname === '/wework/maquinaria') return 'Maquinaria';
        if (pathname === '/wework/stock') return 'Stock de insumos';
        if (pathname === '/wework/tareas') return 'Tareas de mantenimiento';
        if (pathname === '/wework/capacitaciones') return 'Capacitaciones';
        if (pathname === '/wework/rutinas') return 'Rutinas';
        if (pathname === '/admin/wework') return 'WeWork';
        if (pathname === '/mantenimiento') return 'Tickets de mantenimiento';
        if (pathname === '/mantenimiento/tareas') return 'Tareas de mantenimiento';
        return 'LASIA';
    };

    const navGroups = getNavigationGroups();

    if (sessionExpired) {
        return (
            <div className="session-expired-screen">
                <div className="session-expired-card">
                    <Image
                        src="/branding/logo-lasia-limpieza.png"
                        alt="LASIA"
                        width={140}
                        height={140}
                        className="session-expired-logo"
                        priority
                    />
                    <h1>Tu sesión expiró</h1>
                    <p>
                        Por seguridad cerramos tu sesión. Iniciá sesión nuevamente para continuar.
                    </p>
                    <button className="btn btn-primary session-expired-btn" onClick={handleSessionExpiredReload}>
                        Iniciar sesión
                    </button>
                </div>
            </div>
        );
    }

    if (!currentUser) return null; // Wait for auth

    return (
        <div className="app-wrapper">
            <Suspense fallback={null}>
                <TabParamReader onTab={setTabParam} />
            </Suspense>
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
                        <NavIcon name="close" />
                    </button>
                </div>
                <nav className="sidebar-menu">
                    {navGroups.map((group) => (
                        <div key={group.title} className="sidebar-group">
                            <div className="sidebar-group-title">{group.title}</div>
                            {group.items.map((item) => (
                                <Link key={item.href} href={item.href} className={`menu-item ${item.active ? 'active' : ''}`}>
                                    <span className="menu-item-icon"><NavIcon name={item.icon} /></span>
                                    <span>{item.label}</span>
                                    {item.badge && <span className={`menu-item-badge ${item.badgeWip ? 'is-wip' : ''}`}>{item.badge}</span>}
                                </Link>
                            ))}
                        </div>
                    ))}
                </nav>
                <div className="sidebar-actions">
                    <button className="btn btn-secondary sidebar-logout" onClick={handleLogout}>
                        <NavIcon name="logout" />
                        <span>Cerrar sesion</span>
                    </button>
                </div>
                <div className="sidebar-footer">
                    <div className="sidebar-footer-row">
                        <div className="sidebar-user-card">
                            <div className="sidebar-user-avatar">{getInitials()}</div>
                            <div className="sidebar-user-meta">
                                <strong>{currentUser.name} {currentUser.surname}</strong>
                                <span>Digitalizacion integral</span>
                            </div>
                        </div>
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
                        <NavIcon name="menu" />
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
