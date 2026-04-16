import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/passwords';
import { ensureAppUsersTable } from '@/lib/app-users-auth';
import { ensureSupervisorStatusRow } from '@/lib/supervisor-status';

export async function POST(req) {
    try {
        const { username, dni, password } = await req.json();
        const loginUsername = (username || dni || '').toString().trim();
        const loginPassword = (password || '').toString();

        if (!loginUsername || !loginPassword) {
            return Response.json({ error: 'Usuario y contraseña son requeridos' }, { status: 400 });
        }

        await ensureAppUsersTable();

        const { rows } = await db.execute({
            sql: 'SELECT id, username, name, surname, role, password_hash, login_enabled, supervisor_id FROM app_users WHERE username = ?',
            args: [loginUsername]
        });

        if (rows.length === 0) {
            return Response.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 });
        }

        const appUser = rows[0];

        if (!appUser.login_enabled) {
            return Response.json({ error: 'Tu acceso esta deshabilitado. Contactá al administrador.' }, { status: 403 });
        }

        if (!verifyPassword(loginPassword, appUser.password_hash)) {
            return Response.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 });
        }

        const user = {
            id: appUser.role === 'supervisor' ? appUser.supervisor_id : appUser.id,
            name: appUser.name,
            surname: appUser.surname,
            dni: appUser.username,
            role: appUser.role
        };

        if (appUser.role === 'supervisor' && appUser.supervisor_id) {
            await ensureSupervisorStatusRow(appUser.supervisor_id);
        }

        return Response.json({ user });
    } catch (error) {
        console.error('Error in login API:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
