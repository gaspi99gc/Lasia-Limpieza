import { createClient } from '@supabase/supabase-js';
import { randomBytes, scryptSync } from 'crypto';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

function hashPassword(password) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password.toString(), salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

async function seed() {
    console.log('Iniciando seed en Supabase...');

    // Admin
    const { data: existingAdmin } = await supabase
        .from('app_users')
        .select('id')
        .eq('username', 'admin')
        .single();

    if (!existingAdmin) {
        const { error } = await supabase.from('app_users').insert({
            username: 'admin',
            password_hash: hashPassword('admin1234'),
            name: 'Admin',
            surname: 'LASIA',
            role: 'admin',
            login_enabled: true,
        });
        if (error) console.error('Error insertando admin:', error.message);
        else console.log('✅ Usuario admin creado');
    } else {
        console.log('ℹ️ Usuario admin ya existe');
    }

    // Compras
    const { data: existingCompras } = await supabase
        .from('app_users')
        .select('id')
        .eq('username', 'compras')
        .single();

    if (!existingCompras) {
        const { error } = await supabase.from('app_users').insert({
            username: 'compras',
            password_hash: hashPassword('compras1234'),
            name: 'Compras',
            surname: 'LASIA',
            role: 'purchases',
            login_enabled: true,
        });
        if (error) console.error('Error insertando compras:', error.message);
        else console.log('✅ Usuario compras creado (rol: purchases)');
    } else {
        console.log('ℹ️ Usuario compras ya existe');
    }

    // Supervisor demo
    let supervisorId = null;
    const { data: existingSup } = await supabase
        .from('supervisors')
        .select('id')
        .eq('dni', 'supervisor')
        .single();

    if (!existingSup) {
        const { data, error } = await supabase.from('supervisors').insert({
            name: 'Supervisor',
            surname: 'Demo',
            dni: 'supervisor',
            login_enabled: true,
        }).select('id').single();
        if (error) console.error('Error insertando supervisor demo:', error.message);
        else { supervisorId = data.id; console.log('✅ Supervisor demo creado'); }
    } else {
        supervisorId = existingSup.id;
        console.log('ℹ️ Supervisor demo ya existe');
    }

    if (supervisorId) {
        const { data: existingSupUser } = await supabase
            .from('app_users')
            .select('id')
            .eq('username', 'supervisor')
            .single();

        if (!existingSupUser) {
            const { error } = await supabase.from('app_users').insert({
                username: 'supervisor',
                password_hash: hashPassword('supervisor'),
                name: 'Supervisor',
                surname: 'Demo',
                role: 'supervisor',
                login_enabled: true,
                supervisor_id: supervisorId,
            });
            if (error) console.error('Error insertando app_user supervisor:', error.message);
            else console.log('✅ Usuario supervisor creado');
        } else {
            console.log('ℹ️ Usuario supervisor ya existe');
        }
    }

    console.log('\n✅ Seed completado.');
}

seed().catch(err => { console.error('Error fatal:', err); process.exit(1); });
