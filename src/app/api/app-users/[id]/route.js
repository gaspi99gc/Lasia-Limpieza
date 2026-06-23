import { supabase } from '@/lib/db';

export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const { password, name, surname, username, role, login_enabled } = await req.json();
        const normalizedName = name?.trim();
        const normalizedSurname = surname?.trim();
        const normalizedUsername = username?.toString().trim().toLowerCase();
        const normalizedRole = role?.toLowerCase().trim();
        const normalizedPassword = password?.toString() || '';

        if (!normalizedName || !normalizedSurname || !normalizedUsername || !normalizedRole) {
            return Response.json({ error: 'Nombre, apellido, usuario y rol son obligatorios' }, { status: 400 });
        }
        if (normalizedPassword && normalizedPassword.length < 6) {
            return Response.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
        }
        if (!['admin', 'purchases', 'supervisor', 'jefe_operativo', 'rrhh', 'direccion', 'operaciones', 'supervisor_tecnico', 'wework', 'mantenimiento'].includes(normalizedRole)) {
            return Response.json({ error: 'Rol inválido' }, { status: 400 });
        }

        const { data: current, error: fetchError } = await supabase
            .from('app_users')
            .select('id, role')
            .eq('id', id)
            .single();

        if (fetchError || !current) {
            return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
        }

        const authUpdate = { email: `${normalizedUsername}@lasia.com.ar` };
        if (normalizedPassword) authUpdate.password = normalizedPassword;
        const { error: authError } = await supabase.auth.admin.updateUserById(id, authUpdate);
        if (authError) throw authError;

        // Handle supervisor table sync
        if (normalizedRole === 'supervisor' && current.role !== 'supervisor') {
            // Promote to supervisor — create supervisors row
            await supabase.from('supervisors').insert({ app_user_id: id });
        } else if (normalizedRole !== 'supervisor' && current.role === 'supervisor') {
            // Demote — delete supervisors row (cascades to status, routes, logs)
            await supabase.from('supervisors').delete().eq('app_user_id', id);
        }

        const { data, error } = await supabase
            .from('app_users')
            .update({
                name: normalizedName,
                surname: normalizedSurname,
                username: normalizedUsername,
                role: normalizedRole,
                login_enabled: login_enabled !== false,
            })
            .eq('id', id)
            .select('id, username, name, surname, role, login_enabled, supervisors(id)')
            .single();

        if (error) throw error;

        return Response.json({
            id: data.id,
            username: data.username,
            name: data.name,
            surname: data.surname,
            role: data.role,
            login_enabled: data.login_enabled,
            supervisor_id: data.supervisors?.[0]?.id || null,
        });
    } catch (error) {
        console.error('Error updating app user:', error);
        return Response.json({ error: 'Failed to update app user' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        const { id } = await params;

        const { data: user, error: fetchError } = await supabase
            .from('app_users')
            .select('role')
            .eq('id', id)
            .single();

        if (fetchError || !user) {
            return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
        }

        // Deleting auth user cascades to app_users → supervisors
        const { error } = await supabase.auth.admin.deleteUser(id);
        if (error) throw error;

        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting app user:', error);
        return Response.json({ error: 'Failed to delete app user' }, { status: 500 });
    }
}
