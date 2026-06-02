import { supabase } from '@/lib/db';

export const runtime = 'nodejs';

function toNonNegInt(v) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
}

export async function PATCH(req, { params }) {
    try {
        const { id } = await params;
        const body = await req.json();
        const update = {
            operarios_jornada_completa: toNonNegInt(body.operarios_jornada_completa),
            operarios_media_jornada: toNonNegInt(body.operarios_media_jornada),
            operarios_diagramada: toNonNegInt(body.operarios_diagramada),
        };
        const { data, error } = await supabase
            .from('services')
            .update(update)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return Response.json(data);
    } catch (error) {
        console.error('Error updating service plantel:', error);
        return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
}
