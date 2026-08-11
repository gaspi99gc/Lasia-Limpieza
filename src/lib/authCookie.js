// Sesión firmada. Reemplaza a la cookie `lasia_role`, que guardaba el rol en
// texto plano: cualquiera podía editarla desde el navegador y ascenderse a admin.
//
// Ahora la cookie lleva el payload + una firma HMAC-SHA256 que solo el servidor
// puede generar. Si alguien toca un byte, la firma no valida y la sesión se cae.
//
// Usa Web Crypto (no `node:crypto`) para poder correr también en el middleware,
// que se ejecuta en el runtime Edge.

const COOKIE_NAME = 'lasia_session';
const MAX_AGE_SECONDS = 60 * 60 * 24; // 1 día, igual que la cookie anterior

function getSecret() {
    const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) {
        throw new Error(
            'Falta SESSION_SECRET (o SUPABASE_SERVICE_ROLE_KEY) para firmar la sesión'
        );
    }
    return secret;
}

function base64urlEncode(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    const binary = atob(normalized + padding);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function sign(data) {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(getSecret()),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    return base64urlEncode(new Uint8Array(signature));
}

// Comparación de tiempo constante: no cortar en el primer carácter distinto
// evita filtrar la firma correcta midiendo cuánto tarda en responder.
function safeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/**
 * Arma el token firmado a partir del usuario ya autenticado.
 * Solo guardamos lo que el servidor necesita para decidir permisos.
 */
export async function createSessionToken(user) {
    const payload = {
        role: user.role,
        appUserId: user.app_user_id ?? null,
        id: user.id ?? null,
        exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
    };
    const body = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
    return `${body}.${await sign(body)}`;
}

/**
 * Devuelve el payload si la firma es válida y no venció; null en cualquier otro caso.
 * Nunca lanza: un token roto es simplemente "sin sesión".
 */
export async function verifySessionToken(token) {
    if (!token || typeof token !== 'string') return null;

    const separator = token.lastIndexOf('.');
    if (separator <= 0) return null;

    const body = token.slice(0, separator);
    const signature = token.slice(separator + 1);

    try {
        if (!safeEqual(signature, await sign(body))) return null;

        const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(body)));
        if (!payload?.role || typeof payload.exp !== 'number') return null;
        if (payload.exp * 1000 < Date.now()) return null;

        return payload;
    } catch (error) {
        // Sin secreto configurado nadie puede autenticarse. Falla cerrado (bien),
        // pero se ve igual que "sesión vencida": dejamos rastro para no perder
        // horas buscando un problema de login que es de configuración.
        if (error instanceof Error && error.message.includes('SESSION_SECRET')) {
            console.error('[auth]', error.message);
        }
        return null;
    }
}

/** Lee y valida la sesión desde un Request de Next (middleware o route handler). */
export async function getSessionFromRequest(request) {
    return verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
}

const baseCookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
};

/** Aplica la cookie de sesión a una NextResponse. */
export async function setSessionCookie(response, user) {
    response.cookies.set(COOKIE_NAME, await createSessionToken(user), {
        ...baseCookieOptions,
        maxAge: MAX_AGE_SECONDS,
    });
    return response;
}

/** Borra la cookie de sesión. */
export function clearSessionCookie(response) {
    response.cookies.set(COOKIE_NAME, '', { ...baseCookieOptions, maxAge: 0 });
    return response;
}

export { COOKIE_NAME as SESSION_COOKIE_NAME };
