import { db } from '@/lib/db';
import { hashPassword } from '@/lib/passwords';
import { ensureSupervisorAuthColumns } from '@/lib/supervisor-auth';
import { ensureSupervisorStatusRow } from '@/lib/supervisor-status';

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

export async function GET() {
    try {
        await ensureSupervisorAuthColumns();

        const { rows } = await db.execute(`
            SELECT id, name, surname, dni,
                   COALESCE(login_enabled, 1) AS login_enabled,
                   CASE WHEN password_hash IS NOT NULL AND password_hash <> '' THEN 1 ELSE 0 END AS has_password,
                   password_updated_at
            FROM supervisors
            ORDER BY surname ASC, name ASC
        `);

        return Response.json(rows.map(sanitizeSupervisorRow));
    } catch (error) {
        console.error('Error fetching supervisors:', error);
        return Response.json({ error: 'Failed to fetch supervisors' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        await ensureSupervisorAuthColumns();

        const { name, surname, dni, password, login_enabled } = await req.json();
        const normalizedName = name?.trim();
        const normalizedSurname = surname?.trim();
        const normalizedDni = dni?.toString().trim();
        const normalizedPassword = password?.toString() || '';

        if (!normalizedName || !normalizedSurname || !normalizedDni) {
            return Response.json({ error: 'Nombre, apellido y DNI son obligatorios' }, { status: 400 });
        }

        if (normalizedPassword.length < 6) {
            return Response.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
        }

        // Check if DNI already exists
        const existing = await db.execute({
            sql: 'SELECT id FROM supervisors WHERE dni = ?',
            args: [normalizedDni]
        });

        if (existing.rows.length > 0) {
            return Response.json({ error: 'Ya existe un supervisor con este DNI' }, { status: 400 });
        }

        const passwordHash = hashPassword(normalizedPassword);
        const loginEnabledValue = login_enabled === false ? 0 : 1;

        const result = await db.execute({
            sql: `INSERT INTO supervisors (name, surname, dni, password_hash, login_enabled, password_updated_at)
                  VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                  RETURNING id`,
            args: [normalizedName, normalizedSurname, normalizedDni, passwordHash, loginEnabledValue]
        });

        const newId = result.rows[0].id;
        await ensureSupervisorStatusRow(newId);

        return Response.json(sanitizeSupervisorRow({
            id: newId,
            name: normalizedName,
            surname: normalizedSurname,
            dni: normalizedDni,
            login_enabled: loginEnabledValue,
            has_password: 1,
            password_updated_at: new Date().toISOString(),
        }), { status: 201 });
    } catch (error) {
        console.error('Error creating supervisor:', error);
        return Response.json({ error: 'Failed to create supervisor' }, { status: 500 });
    }
}
