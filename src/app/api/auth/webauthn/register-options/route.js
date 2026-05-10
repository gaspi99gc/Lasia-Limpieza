import { supabase } from '@/lib/db';
import { saveChallenge } from '@/lib/webauthn-db';
import { getWebAuthnConfig } from '@/lib/webauthn-config';
import { generateRegistrationOptions } from '@simplewebauthn/server';

export async function POST(req) {
    try {
        const { appUserId } = await req.json();
        if (!appUserId) {
            return Response.json({ error: 'Usuario no valido' }, { status: 400 });
        }

        const { data: appUser, error } = await supabase
            .from('app_users')
            .select('id, username, name, surname, role')
            .eq('id', appUserId)
            .maybeSingle();

        if (error || !appUser) {
            return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
        }

        const { rpID, rpName } = getWebAuthnConfig(req);

        const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userID: new TextEncoder().encode(String(appUser.id)),
            userName: appUser.username,
            userDisplayName: `${appUser.name} ${appUser.surname}`,
            attestationType: 'none',
            authenticatorSelection: {
                residentKey: 'required',
                userVerification: 'required',
            },
            supportedAlgorithmIDs: [-7, -257],
        });

        await saveChallenge(appUser.id, options.challenge);

        return Response.json({ options });
    } catch (error) {
        console.error('Error en register-options:', error);
        return Response.json({ error: error?.message || String(error) }, { status: 500 });
    }
}
