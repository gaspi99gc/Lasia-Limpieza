import { supabase } from '@/lib/db';

export const runtime = 'nodejs';

const TIME_RE = /^\d{2}:\d{2}$/;

function toNonNegInt(v) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
}

function normalizeTurnos(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
        .map(t => ({
            hora_inicio: typeof t?.hora_inicio === 'string' && TIME_RE.test(t.hora_inicio) ? t.hora_inicio : null,
            hora_fin: typeof t?.hora_fin === 'string' && TIME_RE.test(t.hora_fin) ? t.hora_fin : null,
            cantidad: toNonNegInt(t?.cantidad),
        }))
        .filter(t => t.hora_inicio && t.hora_fin && t.cantidad > 0);
}

export async function PATCH(req, { params }) {
    try {
        const { id } = await params;
        const body = await req.json();
        const update = {
            operarios_jornada_completa: toNonNegInt(body.operarios_jornada_completa),
            operarios_media_jornada: toNonNegInt(body.operarios_media_jornada),
            operarios_turnos: normalizeTurnos(body.operarios_turnos),
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
