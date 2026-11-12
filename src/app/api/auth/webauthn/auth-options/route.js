import { supabase } from '@/lib/db';
import { getCredentialsByAppUserId, saveChallenge } from '@/lib/webauthn-db';
import { getWebAuthnConfig } from '@/lib/webauthn-config';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { HUELLA_ACTIVA } from '@/lib/huella';

export async function POST(req) {
    // Huella apagada (src/lib/huella.js): sin opciones no hay ingreso posible.
    if (!HUELLA_ACTIVA) return Response.json({ error: 'No disponible' }, { status: 404 });
    try {
        const { username } = await req.json().catch(() => ({}));
        let allowCredentials = undefined;

        if (username) {
            const { data: userRow } = await supabase
                .from('app_users')
                .select('id')
                .eq('username', username)
                .maybeSingle();

            if (userRow) {
                const credentials = await getCredentialsByAppUserId(userRow.id);
                if (credentials.length > 0) {
                    allowCredentials = credentials.map((cred) => ({
                        id: cred.credential_id,
                        type: 'public-key',
                        transports: JSON.parse(cred.transports || '[]'),
                    }));
                }
            }
        }

        const { rpID } = getWebAuthnConfig(req);
        const challengeKey = username ? `auth:${username}` : 'auth:discoverable';

        const options = await generateAuthenticationOptions({
            rpID,
            allowCredentials,
            userVerification: 'required',
        });

        await saveChallenge(challengeKey, options.challenge);

        return Response.json({ options, discoverable: !username });
    } catch (error) {
        console.error('Error en auth-options:', error);
        return Response.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}
