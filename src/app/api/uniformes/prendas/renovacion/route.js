import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { ROLES_ESCRITURA } from '@/lib/uniformes';

// Plazo de renovación de cada prenda: cada cuántos meses se le da una nueva al
// operario. Es de la PRENDA, no del talle (la camisa se renueva cada 6 meses
// sea S o XL), así que se guarda igual en todos sus talles.
//
// PUT { plazos: [{ prenda: 'Camisa', meses: 6 }, { prenda: 'Zapatos', meses: null }] }
//   meses null o vacío = esa prenda no se renueva.

export async function PUT(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const body = await request.json();
        const plazos = Array.isArray(body?.plazos) ? body.plazos : [];
        if (!plazos.length) return Response.json({ error: 'No mandaste ningún plazo.' }, { status: 400 });

        for (const p of plazos) {
            const prenda = typeof p?.prenda === 'string' ? p.prenda.trim() : '';
            if (!prenda) return Response.json({ error: 'Falta el nombre de la prenda.' }, { status: 400 });
            const vacio = p.meses === null || p.meses === '' || p.meses === undefined;
            const meses = vacio ? null : Math.trunc(Number(p.meses));
            if (!vacio && (!Number.isFinite(meses) || meses < 1 || meses > 60)) {
                return Response.json({ error: `El plazo de ${prenda} tiene que ser entre 1 y 60 meses.` }, { status: 400 });
            }
            const { error } = await supabase
                .from('uniformes_prendas')
                .update({ meses_renovacion: meses, updated_at: new Date().toISOString() })
                .eq('prenda', prenda);
            if (error) throw error;
        }
        return Response.json({ ok: true, guardados: plazos.length });
    } catch (error) {
        console.error('Error guardando plazos de renovación:', error);
        return Response.json({ error: 'No se pudieron guardar los plazos.' }, { status: 500 });
    }
}
