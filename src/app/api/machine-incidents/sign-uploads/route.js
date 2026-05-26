import { supabase } from '@/lib/db';
import { randomUUID } from 'crypto';

const BUCKET = 'machine-incidents';
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

// Genera URLs firmadas para que el cliente suba los archivos DIRECTO a Storage,
// salteando el limite de body de Vercel (~4.5 MB en serverless).
// Recibe el listado de archivos (nombre, tipo, tamaño) y devuelve, por cada uno,
// un path y una signed upload URL. La incidencia todavía no se crea — el POST
// a /api/machine-incidents (en modo "paths") la crea con los paths ya subidos.
export async function POST(req) {
    try {
        const { files } = await req.json();

        if (!Array.isArray(files) || files.length === 0) {
            return Response.json({ error: 'Hay que enviar al menos un archivo.' }, { status: 400 });
        }
        for (const f of files) {
            if (!f?.name || !f?.type) {
                return Response.json({ error: 'Cada archivo requiere name y type.' }, { status: 400 });
            }
            if (!/^(image|video)\//.test(f.type)) {
                return Response.json({ error: `Archivo no permitido: ${f.name}. Solo fotos o videos.` }, { status: 400 });
            }
            const size = Number(f.size) || 0;
            if (size > MAX_BYTES) {
                return Response.json({ error: `Archivo demasiado grande: ${f.name} (máx 50 MB).` }, { status: 400 });
            }
        }

        // Pre-generamos un draftId para agrupar los uploads de esta incidencia.
        // No es la id real de la fila (esa se crea cuando llamen al POST principal);
        // sirve solo como prefijo unico en Storage.
        const draftId = randomUUID();

        const uploads = [];
        for (const f of files) {
            const safeName = f.name.replace(/[^\w.\-]+/g, '_');
            const path = `_drafts/${draftId}/${randomUUID()}-${safeName}`;
            const { data, error } = await supabase.storage
                .from(BUCKET)
                .createSignedUploadUrl(path);
            if (error) throw error;
            uploads.push({
                file_name: f.name,
                mime_type: f.type,
                size_bytes: Number(f.size) || 0,
                path,
                token: data.token,
                signed_url: data.signedUrl,
            });
        }

        return Response.json({ draft_id: draftId, uploads });
    } catch (error) {
        console.error('Error generando signed upload URLs:', error);
        return Response.json({ error: error?.message || 'No se pudieron generar URLs de subida.' }, { status: 500 });
    }
}
