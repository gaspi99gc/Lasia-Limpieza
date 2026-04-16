import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

const isLocal = !url || !authToken;
const dbUrl = isLocal ? 'file:local.db' : url;

if (isLocal) {
    console.log('ℹ️ Modo local activado: usando SQLite local (local.db)');
}

export const db = createClient({
    url: dbUrl,
    authToken: isLocal ? undefined : authToken,
    fetch: (...args) => {
        return fetch(...args).then(res => {
            // Next.js fetch patch breaks LibSQL stream body.cancel
            if (res.body && typeof res.body.cancel !== 'function') {
                res.body.cancel = () => { };
            }
            return res;
        });
    }
});
