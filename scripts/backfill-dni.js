import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { dniFromCuil } from '../src/lib/cuil.js';

// Load .env.local
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

async function backfill() {
    const { data: employees, error } = await supabase
        .from('employees')
        .select('id, nombre, apellido, dni, cuil');

    if (error) {
        console.error('Error leyendo empleados:', error.message);
        process.exit(1);
    }

    let updated = 0;
    let skippedHasDni = 0;
    const noDerivable = [];

    for (const emp of employees) {
        if (emp.dni && emp.dni.toString().trim()) {
            skippedHasDni++;
            continue;
        }
        const derived = dniFromCuil(emp.cuil);
        if (!derived) {
            noDerivable.push(emp);
            continue;
        }
        const { error: upErr } = await supabase
            .from('employees')
            .update({ dni: derived })
            .eq('id', emp.id);
        if (upErr) {
            console.error(`  ✗ ${emp.apellido}, ${emp.nombre} (id ${emp.id}): ${upErr.message}`);
        } else {
            updated++;
        }
    }

    console.log('\n=== Backfill DNI desde CUIL ===');
    console.log(`Total empleados:        ${employees.length}`);
    console.log(`Actualizados:           ${updated}`);
    console.log(`Ya tenían DNI:          ${skippedHasDni}`);
    console.log(`Sin CUIL válido:        ${noDerivable.length}`);
    if (noDerivable.length) {
        console.log('\nRevisar manualmente (CUIL ausente o inválido):');
        noDerivable.forEach(e => console.log(`  - ${e.apellido}, ${e.nombre} (id ${e.id}) cuil="${e.cuil ?? ''}"`));
    }
}

backfill();
