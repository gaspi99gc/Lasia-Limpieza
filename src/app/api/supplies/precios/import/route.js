import { supabase } from '@/lib/db';

export const runtime = 'nodejs';

function normalizePrecio(v) {
    if (v === '' || v === null || v === undefined) return 0;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100) / 100;
}

// Body:
// { updates: [ { supply_id, precio } ] }
// Solo pisa el campo precio; NO toca nombre, unidad, activo, ni provider.
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
            const id = Number(u?.supply_id);
            if (!id) {
                errors.push({ supply_id: u?.supply_id, error: 'ID inválido' });
                continue;
            }
            const { error } = await supabase
                .from('supplies')
                .update({ precio: normalizePrecio(u.precio) })
                .eq('id', id);
            if (error) {
                errors.push({ supply_id: id, error: error.message });
            } else {
                updated += 1;
            }
        }

        return Response.json({ updated, errors });
    } catch (error) {
        console.error('Error importing supply prices:', error);
        return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
}
