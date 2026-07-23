import { NextResponse } from 'next/server';

const HOME_BY_ROLE = {
    admin: '/',
    purchases: '/compras',
    supervisor: '/mi-panel',
    jefe_operativo: '/',
    rrhh: '/',
    direccion: '/',
    operaciones: '/informe-fichada',
    supervisor_tecnico: '/mi-panel-tecnico',
    wework: '/wework',
    mantenimiento: '/mantenimiento',
};

const ALLOWED_PREFIXES_BY_ROLE = {
    admin: ['/', '/supervisores', '/informe-fichada', '/presentismo-admin', '/rrhh', '/usuarios', '/config', '/compras', '/alta-personal', '/wework', '/admin', '/mapa-servicios', '/pagos', '/kpis'],
    purchases: ['/compras', '/mapa-servicios', '/kpis'],
    supervisor: ['/mi-panel'],
    jefe_operativo: ['/', '/supervisores', '/informe-fichada', '/presentismo-admin', '/rrhh', '/alta-personal', '/compras/maquinaria', '/operaciones/servicios', '/mapa-servicios'],
    rrhh: ['/', '/rrhh', '/alta-personal'],
    direccion: ['/', '/rrhh', '/config', '/informe-fichada', '/presentismo-admin', '/mapa-servicios', '/pagos', '/kpis'],
    operaciones: ['/informe-fichada', '/mi-panel/informes', '/rrhh'],
    supervisor_tecnico: ['/mi-panel-tecnico'],
    wework: ['/wework'],
    mantenimiento: ['/mantenimiento'],
};

function canAccess(role, pathname) {
    const prefixes = ALLOWED_PREFIXES_BY_ROLE[role] || [];
    return prefixes.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'));
}

export function middleware(request) {
    const { pathname } = request.nextUrl;
    const role = request.cookies.get('lasia_role')?.value;

    // Read-only "direccion" role: reject any write to the API (except auth).
    // Single enforcement point — guarantees no mutations regardless of UI.
    if (
        role === 'direccion' &&
        pathname.startsWith('/api/') &&
        !pathname.startsWith('/api/auth/') &&
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
    ) {
        return NextResponse.json(
            { error: 'Tu rol es de solo lectura. No tenés permiso para modificar datos.' },
            { status: 403 }
        );
    }

    // Pass through public paths
    if (
        pathname === '/login' ||
        pathname.startsWith('/api/') ||
        pathname.startsWith('/_next/') ||
        pathname.startsWith('/favicon') ||
        pathname.startsWith('/branding/') ||
        pathname.startsWith('/icons/') ||
        pathname.startsWith('/images/') ||
        pathname.startsWith('/pdf.worker')
    ) {
        return NextResponse.next();
    }

    // No session → login
    if (!role || !HOME_BY_ROLE[role]) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Wrong role for this route → redirect to role's home
    if (!canAccess(role, pathname)) {
        return NextResponse.redirect(new URL(HOME_BY_ROLE[role], request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
