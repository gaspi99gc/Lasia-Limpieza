import { NextResponse } from 'next/server';

const HOME_BY_ROLE = {
    admin: '/',
    purchases: '/compras',
    supervisor: '/mi-panel',
    jefe_operativo: '/presentismo-admin',
};

const ALLOWED_PREFIXES_BY_ROLE = {
    admin: ['/', '/supervisores', '/presentismo-admin', '/rrhh', '/usuarios', '/config', '/compras', '/alta-personal'],
    purchases: ['/compras'],
    supervisor: ['/mi-panel'],
    jefe_operativo: ['/supervisores', '/presentismo-admin', '/rrhh', '/alta-personal'],
};

function canAccess(role, pathname) {
    const prefixes = ALLOWED_PREFIXES_BY_ROLE[role] || [];
    return prefixes.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'));
}

export function middleware(request) {
    const { pathname } = request.nextUrl;

    // Pass through public paths
    if (
        pathname === '/login' ||
        pathname.startsWith('/api/') ||
        pathname.startsWith('/_next/') ||
        pathname.startsWith('/favicon') ||
        pathname.startsWith('/branding/') ||
        pathname.startsWith('/icons/') ||
        pathname.startsWith('/images/')
    ) {
        return NextResponse.next();
    }

    const role = request.cookies.get('lasia_role')?.value;

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
