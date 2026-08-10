import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/authCookie';

// Únicas rutas de API que pueden responder sin sesión: las que sirven para
// obtenerla. Todo lo demás exige una cookie firmada válida.
const PUBLIC_API_ROUTES = new Set([
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/webauthn/auth-options',
    '/api/auth/webauthn/auth-verify',
]);

// El atajo de desarrollo entrega sesión sin credenciales; en producción la ruta
// devuelve 404 por su cuenta, así que acá solo se abre fuera de producción.
function isPublicApi(pathname) {
    if (PUBLIC_API_ROUTES.has(pathname)) return true;
    return pathname === '/api/auth/quick-access' && process.env.NODE_ENV !== 'production';
}

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

export async function middleware(request) {
    const { pathname } = request.nextUrl;

    // El rol sale de la cookie firmada: si viene manipulada, `session` es null.
    const session = await getSessionFromRequest(request);
    const role = session?.role;

    if (pathname.startsWith('/api/')) {
        // Antes todo /api/ pasaba sin control: cualquiera que conociera la URL
        // podía leer y escribir datos sin iniciar sesión.
        if (!isPublicApi(pathname) && (!role || !HOME_BY_ROLE[role])) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        // Read-only "direccion" role: reject any write to the API (except auth).
        // Single enforcement point — guarantees no mutations regardless of UI.
        if (
            role === 'direccion' &&
            !pathname.startsWith('/api/auth/') &&
            ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
        ) {
            return NextResponse.json(
                { error: 'Tu rol es de solo lectura. No tenés permiso para modificar datos.' },
                { status: 403 }
            );
        }

        return NextResponse.next();
    }

    // Pass through public paths
    if (
        pathname === '/login' ||
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
