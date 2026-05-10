import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function geocode(address) {
    const query = encodeURIComponent(`${address}, Buenos Aires, Argentina`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=ar`;
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'LasiaLimpieza/1.0 (luciotambo@gmail.com)' }
        });
        const data = await res.json();
        if (data.length > 0) {
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
    } catch (e) {
        console.warn('  Geocoding error:', e.message);
    }
    return { lat: null, lng: null };
}

async function main() {
    const wb = XLSX.readFile('./SERVICIOS.xlsx');
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    console.log(`Total servicios en Excel: ${rows.length}`);

    // Traer nombres existentes para evitar duplicados
    const { data: existing } = await supabase.from('services').select('name');
    const existingNames = new Set((existing || []).map(s => s.name.trim().toLowerCase()));

    let inserted = 0, skipped = 0, failed = 0;

    for (let i = 0; i < rows.length; i++) {
        const name = rows[i]['SERVICIO']?.trim();
        const address = rows[i]['DIRECCIONES']?.trim();

        if (!name) { skipped++; continue; }

        if (existingNames.has(name.toLowerCase())) {
            console.log(`[${i + 1}/${rows.length}] SKIP (ya existe): ${name}`);
            skipped++;
            continue;
        }

        process.stdout.write(`[${i + 1}/${rows.length}] Geocodificando: ${name}... `);
        const { lat, lng } = await geocode(address || name);
        console.log(lat ? `(${lat.toFixed(4)}, ${lng.toFixed(4)})` : 'sin coords');

        const { error } = await supabase.from('services').insert({
            name,
            address: address || null,
            lat: lat || null,
            lng: lng || null,
        });

        if (error) {
            console.error(`  ERROR insertando: ${error.message}`);
            failed++;
        } else {
            inserted++;
        }

        // Respetar rate limit de Nominatim: 1 req/seg
        await sleep(1100);
    }

    console.log(`\n✅ Listo. Insertados: ${inserted} | Saltados: ${skipped} | Errores: ${failed}`);
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1); });
