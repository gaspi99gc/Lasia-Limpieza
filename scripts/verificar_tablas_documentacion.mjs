// Chequeo de solo lectura: ¿están las tablas de Documentación mensual?
// USO: node scripts/verificar_tablas_documentacion.mjs
// Sale con código 1 si falta alguna (la migración es
// supabase/migrations/20261125_documentacion_nomina.sql).
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

let falta = false;
for (const tabla of ['rrhh_vencimientos_nomina', 'rrhh_vencimientos_envios']) {
    const { error } = await sb.from(tabla).select('id').limit(1);
    if (error) { falta = true; console.log(`FALTA ${tabla}: ${error.message}`); }
}
if (falta) process.exit(1);
console.log('OK las dos tablas');
