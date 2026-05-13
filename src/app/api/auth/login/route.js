import { supabase, supabaseAuth } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const { username, dni, password } = await req.json();
        const loginUsername = (username || dni || '').toString().trim().toLowerCase();
        const loginPassword = (password || '').toString();

        if (!loginUsername || !loginPassword) {
            return Response.json({ error: 'Usuario y contraseña son requeridos' }, { status: 400 });
        }

        const email = `${loginUsername}@lasia.com.ar`;

        const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
            email,
            password: loginPassword,
        });

        if (authError) {
            return Response.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 });
        }

        const { data: profile, error: profileError } = await supabase
            .from('app_users')
            .select('id, username, name, surname, role, login_enabled')
            .eq('id', authData.user.id)
            .single();

        if (profileError || !profile) {
            return Response.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 });
        }

        if (!profile.login_enabled) {
            return Response.json({ error: 'Tu acceso está deshabilitado. Contactá al administrador.' }, { status: 403 });
        }

        let supervisorIntId = null;
        if (profile.role === 'supervisor') {
            const { data: sup } = await supabase
                .from('supervisors')
                .select('id')
                .eq('app_user_id', profile.id)
                .single();
            supervisorIntId = sup?.id || null;
        }

        const user = {
            id: profile.role === 'supervisor' ? supervisorIntId : profile.id,
            app_user_id: profile.id,
            name: profile.name,
            surname: profile.surname,
            dni: profile.username,
            role: profile.role,
        };

        const response = NextResponse.json({ user });
        response.cookies.set('lasia_role', user.role, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24, // 1 day
        });
        return response;
    } catch (error) {
        console.error('Error in login API:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
