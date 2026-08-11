import { supabase } from '@/lib/db';
import { setSessionCookie } from '@/lib/authCookie';
import { NextResponse } from 'next/server';
import { ensureSupervisorStatusRow } from '@/lib/supervisor-status';
import { getAndDeleteChallenge, getCredentialById } from '@/lib/webauthn-db';
import { getWebAuthnConfig } from '@/lib/webauthn-config';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';

export async function POST(req) {
    try {
        const { credential, username } = await req.json();
        if (!credential) {
            return Response.json({ error: 'Credencial requerida' }, { status: 400 });
        }

        const challengeKey = username ? `auth:${username}` : 'auth:discoverable';
        const expectedChallenge = await getAndDeleteChallenge(challengeKey);
        if (!expectedChallenge) {
            return Response.json({ error: 'Challenge expirado o no encontrado' }, { status: 400 });
        }

        const { rpID, origin } = getWebAuthnConfig(req);

        const dbCredential = await getCredentialById(credential.id);
        if (!dbCredential) {
            return Response.json({ error: 'Credencial no registrada' }, { status: 401 });
        }

        const verification = await verifyAuthenticationResponse({
            response: credential,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            credential: {
                id: dbCredential.credential_id,
                publicKey: new Uint8Array(dbCredential.public_key),
                counter: Number(dbCredential.counter),
                transports: JSON.parse(dbCredential.transports || '[]'),
            },
            requireUserVerification: true,
        });

        if (!verification.verified) {
            return Response.json({ error: 'Autenticacion fallida' }, { status: 401 });
        }

        // Update counter
        await supabase
            .from('webauthn_credentials')
            .update({ counter: verification.authenticationInfo.newCounter })
            .eq('id', dbCredential.id);

        // Get user with supervisor join
        const { data: appUser, error: userError } = await supabase
            .from('app_users')
            .select('id, username, name, surname, role, login_enabled, supervisors(id)')
            .eq('id', dbCredential.app_user_id)
            .maybeSingle();

        if (userError || !appUser) {
            return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
        }
        if (!appUser.login_enabled) {
            return Response.json({ error: 'Tu acceso esta deshabilitado. Contacta al administrador.' }, { status: 403 });
        }

        const supervisorId = appUser.supervisors?.[0]?.id || null;

        const user = {
            id: appUser.role === 'supervisor' ? supervisorId : appUser.id,
            app_user_id: appUser.id,
            name: appUser.name,
            surname: appUser.surname,
            dni: appUser.username,
            role: appUser.role,
        };

        if (appUser.role === 'supervisor' && supervisorId) {
            await ensureSupervisorStatusRow(supervisorId);
        }

        // Este camino no emitía cookie: quien entraba con huella quedaba sin
        // sesión de servidor y el middleware lo devolvía al login.
        return setSessionCookie(NextResponse.json({ user }), user);
    } catch (error) {
        console.error('Error en auth-verify:', error);
        return Response.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}
