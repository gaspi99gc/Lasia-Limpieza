import { db } from '@/lib/db';
import { hashPassword } from '@/lib/passwords';
import { ensureSupervisorAuthColumns } from '@/lib/supervisor-auth';
import { ensureSupervisorStatusRow, ensureSupervisorStatusTable } from '@/lib/supervisor-status';

function sanitizeSupervisorRow(supervisor) {
    return {
        id: supervisor.id,
        name: supervisor.name,
        surname: supervisor.surname,
        dni: supervisor.dni,
        login_enabled: Boolean(supervisor.login_enabled),
        has_password: Boolean(supervisor.has_password),
        password_updated_at: supervisor.password_updated_at || null,
    };
}

export async function PUT(req, { params }) {
    try {
        await ensureSupervisorAuthColumns();

        const { id } = await params;
        const { name, surname, dni, password, login_enabled } = await req.json();
        const normalizedName = name?.trim();
        const normalizedSurname = surname?.trim();
        const normalizedDni = dni?.toString().trim();
        const normalizedPassword = password?.toString() || '';

        if (!normalizedName || !normalizedSurname || !normalizedDni) {
            return Response.json({ error: 'Nombre, apellido y DNI son obligatorios' }, { status: 400 });
        }

        if (normalizedPassword && normalizedPassword.length < 6) {
            return Response.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
        }

        const existing = await db.execute({
            sql: 'SELECT id FROM supervisors WHERE dni = ? AND id <> ?',
            args: [normalizedDni, id]
        });

        if (existing.rows.length > 0) {
            return Response.json({ error: 'Ya existe un supervisor con este DNI' }, { status: 400 });
        }

        const loginEnabledValue = login_enabled === false ? 0 : 1;

        if (normalizedPassword) {
            await db.execute({
                sql: `UPDATE supervisors
                      SET name = ?, surname = ?, dni = ?, login_enabled = ?, password_hash = ?, password_updated_at = CURRENT_TIMESTAMP
                      WHERE id = ?`,
                args: [normalizedName, normalizedSurname, normalizedDni, loginEnabledValue, hashPassword(normalizedPassword), id]
            });
        } else {
            await db.execute({
                sql: 'UPDATE supervisors SET name = ?, surname = ?, dni = ?, login_enabled = ? WHERE id = ?',
                args: [normalizedName, normalizedSurname, normalizedDni, loginEnabledValue, id]
            });
        }

        const { rows } = await db.execute({
            sql: `SELECT id, name, surname, dni,
                         COALESCE(login_enabled, 1) AS login_enabled,
                         CASE WHEN password_hash IS NOT NULL AND password_hash <> '' THEN 1 ELSE 0 END AS has_password,
                         password_updated_at
                  FROM supervisors
                  WHERE id = ?`,
            args: [id]
        });

        await ensureSupervisorStatusRow(id);

        return Response.json(sanitizeSupervisorRow(rows[0]));
    } catch (error) {
        console.error('Error updating supervisor:', error);
        return Response.json({ error: 'Failed to update supervisor' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        const { id } = await params;
        await ensureSupervisorStatusTable();
        await db.execute({
            sql: 'DELETE FROM supervisor_status WHERE supervisor_id = ?',
            args: [id]
        });
        await db.execute({
            sql: 'DELETE FROM supervisors WHERE id = ?',
            args: [id]
        });
        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting supervisor:', error);
        return Response.json({ error: 'Failed to delete supervisor' }, { status: 500 });
    }
}
