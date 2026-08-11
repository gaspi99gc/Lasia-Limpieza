import { supabase } from '@/lib/db';
import { setSessionCookie } from '@/lib/authCookie';
import { NextResponse } from 'next/server';

// Atajo de desarrollo: entrega una sesión con solo pedir un rol, sin credenciales.
// Los botones que lo usan ya estaban ocultos fuera de desarrollo, pero la ruta
// seguía respondiendo en producción: era un bypass completo del login.
// El corte tiene que estar acá, en el servidor.
export async function POST(req) {
    if (process.env.NODE_ENV === 'production') {
        return Response.json({ error: 'No encontrado' }, { status: 404 });
    }

    try {
        const { role } = await req.json();

        const validRoles = ['admin', 'purchases', 'supervisor', 'jefe_operativo', 'operaciones', 'direccion', 'supervisor_tecnico', 'rrhh', 'wework', 'mantenimiento'];
        if (!validRoles.includes(role)) {
            return Response.json({ error: 'Rol inválido' }, { status: 400 });
        }

        const { data: profile, error } = await supabase
            .from('app_users')
            .select('id, username, name, surname, role, login_enabled')
            .eq('role', role)
            .eq('login_enabled', true)
            .order('surname', { ascending: true })
            .limit(1)
            .single();

        if (error || !profile) {
            return Response.json({ error: `No hay ningún usuario con rol "${role}" habilitado` }, { status: 404 });
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

        return setSessionCookie(NextResponse.json({ user }), user);
    } catch (error) {
        console.error('Error in quick-access:', error);
        return Response.json({ error: 'Error interno' }, { status: 500 });
    }
}
