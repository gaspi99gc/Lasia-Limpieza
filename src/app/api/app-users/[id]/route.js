import { db } from '@/lib/db';
import { hashPassword } from '@/lib/passwords';
import { ensureAppUsersTable } from '@/lib/app-users-auth';
import { ensureSupervisorStatusRow, ensureSupervisorStatusTable } from '@/lib/supervisor-status';

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

export async function PUT(req, { params }) {
    try {
        await ensureAppUsersTable();
        const { id } = await params;

        const { username, password, name, surname, role, login_enabled } = await req.json();
        const normalizedUsername = username?.toString().trim();
        const normalizedPassword = password?.toString() || '';
        const normalizedName = name?.trim();
        const normalizedSurname = surname?.trim();
        const normalizedRole = role?.toLowerCase().trim();

        if (!normalizedUsername || !normalizedName || !normalizedSurname || !normalizedRole) {
            return Response.json({ error: 'Usuario, nombre, apellido y rol son obligatorios' }, { status: 400 });
        }

        if (normalizedPassword && normalizedPassword.length < 6) {
            return Response.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
        }

        if (!['admin', 'purchases', 'supervisor'].includes(normalizedRole)) {
            return Response.json({ error: 'Rol inválido. Debe ser admin, purchases o supervisor' }, { status: 400 });
        }

        const existingUser = await db.execute({
            sql: 'SELECT id, role, supervisor_id FROM app_users WHERE id = ?',
            args: [id]
        });

        if (existingUser.rows.length === 0) {
            return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
        }

        const currentUser = existingUser.rows[0];

        const duplicateCheck = await db.execute({
            sql: 'SELECT id FROM app_users WHERE username = ? AND id <> ?',
            args: [normalizedUsername, id]
        });

        if (duplicateCheck.rows.length > 0) {
            return Response.json({ error: 'Ya existe otro usuario con este DNI/username' }, { status: 400 });
        }

        let supervisorId = currentUser.supervisor_id;

        if (normalizedRole === 'supervisor' && currentUser.role !== 'supervisor') {
            const existingSupervisor = await db.execute({
                sql: 'SELECT id FROM supervisors WHERE dni = ?',
                args: [normalizedUsername]
            });

            if (existingSupervisor.rows.length > 0) {
                return Response.json({ error: 'Ya existe un supervisor con este DNI' }, { status: 400 });
            }

            const insertSupervisor = await db.execute({
                sql: 'INSERT INTO supervisors (name, surname, dni) VALUES (?, ?, ?)',
                args: [normalizedName, normalizedSurname, normalizedUsername]
            });

            supervisorId = Number(insertSupervisor.lastInsertRowid);
            await ensureSupervisorStatusRow(supervisorId);
        } else if (normalizedRole === 'supervisor' && currentUser.role === 'supervisor' && supervisorId) {
            await db.execute({
                sql: 'UPDATE supervisors SET name = ?, surname = ?, dni = ? WHERE id = ?',
                args: [normalizedName, normalizedSurname, normalizedUsername, supervisorId]
            });
        } else if (normalizedRole !== 'supervisor' && currentUser.role === 'supervisor' && supervisorId) {
            await db.execute({
                sql: 'DELETE FROM supervisor_status WHERE supervisor_id = ?',
                args: [supervisorId]
            });
            await db.execute({
                sql: 'DELETE FROM supervisors WHERE id = ?',
                args: [supervisorId]
            });
            supervisorId = null;
        }

        const loginEnabledValue = login_enabled === false ? 0 : 1;

        if (normalizedPassword) {
            await db.execute({
                sql: `UPDATE app_users
                      SET username = ?, password_hash = ?, name = ?, surname = ?, role = ?, login_enabled = ?, supervisor_id = ?
                      WHERE id = ?`,
                args: [normalizedUsername, hashPassword(normalizedPassword), normalizedName, normalizedSurname, normalizedRole, loginEnabledValue, supervisorId, id]
            });
        } else {
            await db.execute({
                sql: `UPDATE app_users
                      SET username = ?, name = ?, surname = ?, role = ?, login_enabled = ?, supervisor_id = ?
                      WHERE id = ?`,
                args: [normalizedUsername, normalizedName, normalizedSurname, normalizedRole, loginEnabledValue, supervisorId, id]
            });
        }

        const { rows } = await db.execute({
            sql: 'SELECT id, username, name, surname, role, login_enabled, supervisor_id FROM app_users WHERE id = ?',
            args: [id]
        });

        return Response.json(sanitizeAppUser(rows[0]));
    } catch (error) {
        console.error('Error updating app user:', error);
        return Response.json({ error: 'Failed to update app user' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        await ensureAppUsersTable();
        const { id } = await params;

        const { rows } = await db.execute({
            sql: 'SELECT role, supervisor_id FROM app_users WHERE id = ?',
            args: [id]
        });

        if (rows.length === 0) {
            return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
        }

        const user = rows[0];

        if (user.role === 'supervisor' && user.supervisor_id) {
            await ensureSupervisorStatusTable();
            await db.execute({
                sql: 'DELETE FROM supervisor_routes WHERE supervisor_id = ?',
                args: [user.supervisor_id]
            });
            await db.execute({
                sql: 'DELETE FROM supervisor_presentismo_logs WHERE supervisor_id = ?',
                args: [user.supervisor_id]
            });
            await db.execute({
                sql: 'DELETE FROM supervisor_status WHERE supervisor_id = ?',
                args: [user.supervisor_id]
            });
            await db.execute({
                sql: 'DELETE FROM supervisors WHERE id = ?',
                args: [user.supervisor_id]
            });
        }

        await db.execute({
            sql: 'DELETE FROM app_users WHERE id = ?',
            args: [id]
        });

        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting app user:', error);
        return Response.json({ error: 'Failed to delete app user' }, { status: 500 });
    }
}
