import { supabase } from '@/lib/db';
import { ensureSupervisorStatusRow } from '@/lib/supervisor-status';

function sanitizeAppUser(row) {
    return {
        id: row.id,
        username: row.username,
        name: row.name,
        surname: row.surname,
        role: row.role,
        login_enabled: Boolean(row.login_enabled),
        supervisor_id: row.supervisors?.[0]?.id || null,
    };
}

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('app_users')
            .select('id, username, name, surname, role, login_enabled, supervisors(id)')
            .order('surname', { ascending: true })
            .order('name', { ascending: true });

        if (error) throw error;
        return Response.json((data || []).map(sanitizeAppUser));
    } catch (error) {
        console.error('Error fetching app users:', error);
        return Response.json({ error: 'Failed to fetch app users' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { username, password, name, surname, role, login_enabled } = await req.json();
        const normalizedUsername = username?.toString().trim().toLowerCase();
        const normalizedPassword = password?.toString() || '';
        const normalizedName = name?.trim();
        const normalizedSurname = surname?.trim();
        const normalizedRole = role?.toLowerCase().trim();

        if (!normalizedUsername || !normalizedName || !normalizedSurname || !normalizedRole) {
            return Response.json({ error: 'Usuario, nombre, apellido y rol son obligatorios' }, { status: 400 });
        }
        if (normalizedPassword.length < 6) {
            return Response.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
        }
        if (!['admin', 'purchases', 'supervisor', 'jefe_operativo', 'rrhh', 'direccion', 'operaciones', 'supervisor_tecnico', 'wework', 'mantenimiento'].includes(normalizedRole)) {
            return Response.json({ error: 'Rol inválido' }, { status: 400 });
        }

        const email = `${normalizedUsername}@lasia.com.ar`;

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password: normalizedPassword,
            email_confirm: true,
        });

        if (authError) {
            const msg = authError.message?.toLowerCase() || '';
            if (msg.includes('already') || authError.code === 'email_exists') {
                return Response.json({ error: 'Ya existe un usuario con ese nombre' }, { status: 400 });
            }
            throw authError;
        }

        const authId = authData.user.id;

        const { data: profile, error: profileError } = await supabase
            .from('app_users')
            .insert({
                id: authId,
                username: normalizedUsername,
                name: normalizedName,
                surname: normalizedSurname,
                role: normalizedRole,
                login_enabled: login_enabled !== false,
            })
            .select()
            .single();

        if (profileError) {
            await supabase.auth.admin.deleteUser(authId);
            throw profileError;
        }

        let supervisorId = null;
        if (normalizedRole === 'supervisor') {
            const { data: sup, error: supError } = await supabase
                .from('supervisors')
                .insert({ app_user_id: authId })
                .select('id')
                .single();
            if (supError) throw supError;
            supervisorId = sup.id;
            await ensureSupervisorStatusRow(supervisorId);
        }

        return Response.json({
            id: profile.id,
            username: profile.username,
            name: profile.name,
            surname: profile.surname,
            role: profile.role,
            login_enabled: profile.login_enabled,
            supervisor_id: supervisorId,
        }, { status: 201 });
    } catch (error) {
        console.error('Error creating app user:', error);
        return Response.json({ error: 'Failed to create app user' }, { status: 500 });
    }
}
