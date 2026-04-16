import { db } from '@/lib/db';
import { hashPassword } from '@/lib/passwords';
import { ensureAppUsersTable } from '@/lib/app-users-auth';
import { ensureSupervisorStatusRow } from '@/lib/supervisor-status';

function sanitizeAppUser(row) {
    return {
        id: row.id,
        username: row.username,
        name: row.name,
        surname: row.surname,
        role: row.role,
        login_enabled: Boolean(row.login_enabled),
        supervisor_id: row.supervisor_id || null,
    };
}

export async function GET() {
    try {
        await ensureAppUsersTable();

        const { rows } = await db.execute(`
            SELECT id, username, name, surname, role, login_enabled, supervisor_id
            FROM app_users
            ORDER BY surname ASC, name ASC
        `);

        return Response.json(rows.map(sanitizeAppUser));
    } catch (error) {
        console.error('Error fetching app users:', error);
        return Response.json({ error: 'Failed to fetch app users' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        await ensureAppUsersTable();

        const { username, password, name, surname, role, login_enabled } = await req.json();
        const normalizedUsername = username?.toString().trim();
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

        if (!['admin', 'purchases', 'supervisor'].includes(normalizedRole)) {
            return Response.json({ error: 'Rol inválido. Debe ser admin, purchases o supervisor' }, { status: 400 });
        }

        const existingUser = await db.execute({
            sql: 'SELECT id FROM app_users WHERE username = ?',
            args: [normalizedUsername]
        });

        if (existingUser.rows.length > 0) {
            return Response.json({ error: 'Ya existe un usuario con este DNI/username' }, { status: 400 });
        }

        let supervisorId = null;

        if (normalizedRole === 'supervisor') {
            const existingSupervisor = await db.execute({
                sql: 'SELECT id FROM supervisors WHERE dni = ?',
                args: [normalizedUsername]
            });

            if (existingSupervisor.rows.length > 0) {
                return Response.json({ error: 'Ya existe un supervisor con este DNI' }, { status: 400 });
            }

            const insertSupervisor = await db.execute({
                sql: `INSERT INTO supervisors (name, surname, dni)
                      VALUES (?, ?, ?)`,
                args: [normalizedName, normalizedSurname, normalizedUsername]
            });

            supervisorId = Number(insertSupervisor.lastInsertRowid);
            await ensureSupervisorStatusRow(supervisorId);
        }

        const loginEnabledValue = login_enabled === false ? 0 : 1;
        const passwordHash = hashPassword(normalizedPassword);

        const result = await db.execute({
            sql: `INSERT INTO app_users (username, password_hash, name, surname, role, login_enabled, supervisor_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                  RETURNING id`,
            args: [normalizedUsername, passwordHash, normalizedName, normalizedSurname, normalizedRole, loginEnabledValue, supervisorId]
        });

        return Response.json(sanitizeAppUser({
            id: result.rows[0].id,
            username: normalizedUsername,
            name: normalizedName,
            surname: normalizedSurname,
            role: normalizedRole,
            login_enabled: loginEnabledValue,
            supervisor_id: supervisorId,
        }), { status: 201 });
    } catch (error) {
        console.error('Error creating app user:', error);
        return Response.json({ error: 'Failed to create app user' }, { status: 500 });
    }
}
