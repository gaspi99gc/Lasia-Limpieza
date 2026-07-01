import { supabase } from '@/lib/db';

export const runtime = 'nodejs';

function toNonNegInt(v) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
}

// Body:
// { updates: [ { service_id, operarios_jornada_completa, operarios_media_jornada } ] }
// Solo pisa esos dos campos; NO toca operarios_turnos.
export async function POST(req) {
    try {
        const body = await req.json();
        const updates = Array.isArray(body?.updates) ? body.updates : [];
        if (updates.length === 0) {
            return Response.json({ error: 'No hay actualizaciones que aplicar' }, { status: 400 });
        }

        let updated = 0;
        const errors = [];

        for (const u of updates) {
            const id = Number(u?.service_id);
            if (!id) {
                errors.push({ service_id: u?.service_id, error: 'ID inválido' });
                continue;
            }
            const patch = {
                operarios_jornada_completa: toNonNegInt(u.operarios_jornada_completa),
                operarios_media_jornada: toNonNegInt(u.operarios_media_jornada),
            };
            const { error } = await supabase
                .from('services')
                .update(patch)
                .eq('id', id);
            if (error) {
                errors.push({ service_id: id, error: error.message });
            } else {
                updated += 1;
            }
        }

        return Response.json({ updated, errors });
    } catch (error) {
        console.error('Error importing plantel:', error);
        return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
}
