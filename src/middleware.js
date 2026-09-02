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

// Las restricciones por rol existían solo para las pantallas: la API no las
// aplicaba, así que un supervisor logueado podía pedir /api/app-users y sacar
// el listado de cuentas. Estas reglas replican, para la API, el permiso de la
// pantalla que hoy consume cada ruta:
//   /api/app-users          <- solo /usuarios (admin)
//   /api/licenses           <- HRSection, dentro de /rrhh
//   /api/employee-documents <- HRSection, dentro de /rrhh
const RRHH_ROLES = ['admin', 'jefe_operativo', 'rrhh', 'direccion', 'operaciones'];
// Los casos legales son datos sensibles de personas: los ve solo quien los
// gestiona. Operaciones queda afuera (no tiene la pestaña ni le corresponde).
const LEGALES_ROLES = ['admin', 'jefe_operativo', 'rrhh', 'direccion'];
const API_ROLE_RULES = [
    { prefix: '/api/app-users', roles: ['admin'] },
    { prefix: '/api/licenses', roles: RRHH_ROLES },
    { prefix: '/api/employee-documents', roles: RRHH_ROLES },
    { prefix: '/api/legal-cases', roles: LEGALES_ROLES },
];

// Rutas donde el rol "direccion", que por lo demás es de solo lectura, sí puede
// escribir. Los casos legales los gestiona el jefe en persona, así que necesita
// crearlos y editarlos como RRHH.
const DIRECCION_WRITABLE_PREFIXES = ['/api/legal-cases'];

function isDireccionWritable(pathname) {
    return DIRECCION_WRITABLE_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(p + '/')
    );
}

function apiRoleDenied(pathname, role) {
    const rule = API_ROLE_RULES.find(
        (r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/')
    );
    return rule ? !rule.roles.includes(role) : false;
}

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
    admin: ['/', '/supervisores', '/informe-fichada', '/visitas-supervisor', '/presentismo-admin', '/rrhh', '/usuarios', '/config', '/compras', '/alta-personal', '/wework', '/admin', '/mapa-servicios', '/pagos', '/kpis'],
    purchases: ['/compras', '/visitas-supervisor', '/mapa-servicios', '/kpis'],
    supervisor: ['/mi-panel', '/visitas-supervisor'],
    jefe_operativo: ['/', '/supervisores', '/informe-fichada', '/visitas-supervisor', '/presentismo-admin', '/rrhh', '/alta-personal', '/compras/maquinaria', '/operaciones/servicios', '/mapa-servicios', '/jefe-operativo', '/kpis'],
    rrhh: ['/', '/rrhh', '/visitas-supervisor', '/alta-personal'],
    direccion: ['/', '/rrhh', '/visitas-supervisor', '/config', '/informe-fichada', '/presentismo-admin', '/mapa-servicios', '/pagos', '/kpis'],
    operaciones: ['/informe-fichada', '/visitas-supervisor', '/mi-panel/informes', '/rrhh'],
    supervisor_tecnico: ['/mi-panel-tecnico', '/visitas-supervisor'],
    wework: ['/wework', '/visitas-supervisor'],
    mantenimiento: ['/mantenimiento', '/visitas-supervisor'],
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

        if (apiRoleDenied(pathname, role)) {
            return NextResponse.json(
                { error: 'No tenés permiso para acceder a estos datos.' },
                { status: 403 }
            );
        }

        // Read-only "direccion" role: reject any write to the API (except auth).
        // Single enforcement point — guarantees no mutations regardless of UI.
        // Excepción: los casos legales los lleva la propia dirección, así que
        // sobre esa ruta sí puede escribir.
        if (
            role === 'direccion' &&
            !pathname.startsWith('/api/auth/') &&
            !isDireccionWritable(pathname) &&
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
