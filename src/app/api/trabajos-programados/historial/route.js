import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { ROLES_LECTURA } from '@/lib/trabajos-server';

// El historial de un trabajo: cada cambio con quien y cuando. Lo ve todo el que
// ve el trabajo, igual que en faltas: el rastro sirve si esta a la vista.
export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES_LECTURA);
    if (denied) return denied;

    try {
        const id = Number(new URL(request.url).searchParams.get('id'));
        if (!Number.isFinite(id)) return Response.json({ error: 'Falta el id.' }, { status: 400 });

        const { data, error } = await supabase
            .from('trabajos_historial')
            .select('id, campo, valor_anterior, valor_nuevo, usuario, created_at')
            .eq('trabajo_id', id)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false });
        if (error) throw error;

        return Response.json(data || []);
    } catch (error) {
        console.error('Error leyendo historial de trabajo:', error);
        return Response.json({ error: 'No se pudo cargar el historial.' }, { status: 500 });
    }
}
