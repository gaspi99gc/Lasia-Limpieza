// Sube (o reemplaza) una plantilla de Word al bucket privado "plantillas" de
// Supabase Storage. Si el bucket no existe, lo crea privado.
//
// USO: node scripts/subir_plantilla_word.mjs <archivo.docx> <nombre-en-el-bucket>
//      node scripts/subir_plantilla_word.mjs zara-uni-plantilla.docx zara-uni.docx
//
// Las plantillas NO van al repo: tienen datos personales (firma, DNI,
// teléfonos) y el repo es público. La app las lee con service_role desde
// /api/vencimientos/word. Cómo armar una: abrir el Word del cliente, cambiar
// las fechas por {{FECHA}}, {{INICIO}} y {{FIN}}, dejar en la tabla una sola
// fila con {{DNI}}, {{APELLIDO}} y {{NOMBRE}}, y guardarlo como .docx.
// Después, sumarla en src/lib/plantillas-documentacion.js.
//
// OJO: .env.local apunta a PRODUCCIÓN.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const [archivo, nombre] = process.argv.slice(2);
if (!archivo || !nombre || !fs.existsSync(archivo) || !nombre.endsWith('.docx')) {
    console.log('USO: node scripts/subir_plantilla_word.mjs <archivo.docx> <nombre-en-el-bucket.docx>');
    process.exit(1);
}
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const BUCKET = 'plantillas';
const { data: bucket } = await sb.storage.getBucket(BUCKET);
if (!bucket) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: false });
    if (error) { console.log(`No se pudo crear el bucket: ${error.message}`); process.exit(1); }
    console.log(`Bucket "${BUCKET}" creado (privado).`);
} else if (bucket.public) {
    console.log(`OJO: el bucket "${BUCKET}" es PÚBLICO. No se sube nada: pasalo a privado primero.`);
    process.exit(1);
}

const { error } = await sb.storage.from(BUCKET).upload(nombre, fs.readFileSync(archivo), {
    upsert: true,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});
if (error) { console.log(`No se pudo subir: ${error.message}`); process.exit(1); }
console.log(`✓ ${archivo} subido como ${BUCKET}/${nombre}`);
