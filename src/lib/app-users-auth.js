import { db } from '@/lib/db';

let appUsersTableReady = false;

export async function ensureAppUsersTable() {
    if (appUsersTableReady) {
        return;
    }

    await db.execute(`
        CREATE TABLE IF NOT EXISTS app_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            surname TEXT NOT NULL,
            role TEXT NOT NULL,
            login_enabled INTEGER NOT NULL DEFAULT 1,
            supervisor_id INTEGER REFERENCES supervisors(id)
        )
    `);

    appUsersTableReady = true;
}
