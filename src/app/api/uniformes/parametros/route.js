import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { getSessionFromRequest } from '@/lib/authCookie';
import { ROLES_LECTURA, ROLES_PRECIO } from '@/lib/uniformes';

// Los supuestos de la proyeccion de gasto.
//
// Los edita el jefe junto con los precios: son sus numeros, y tiene que poder
// discutirlos. Por eso viven en la base y no en el codigo — "esta en el codigo"
// es la respuesta que hace que deje de creerle a la pantalla.

const CLAVES = ['ingresos_mes_esperados', 'pct_recupero_uniforme', 'pct_perdida_uso'];
// Los dos porcentajes no pueden pasar de 100; los ingresos por mes no tienen
// tope real, pero un numero absurdo solo ensucia la proyeccion.
const TOPES = { ingresos_mes_esperados: 1000, pct_recupero_uniforme: 100, pct_perdida_uso: 100 };

async function quienEs(session) {
    let quien = session?.role || null;
    if (session?.appUserId) {
        const { data: u } = await supabase
            .from('app_users')
            .select('name, surname, username')
            .eq('id', session.appUserId)
            .maybeSingle();
        if (u) quien = [u.name, u.surname].filter(Boolean).join(' ').trim() || u.username || quien;
    }
    return quien;
}

export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES_LECTURA);
    if (denied) return denied;

    try {
        const { data, error } = await supabase.from('uniformes_parametros').select('*').order('clave');
        if (error) throw error;
        return Response.json(data || []);
    } catch (error) {
        console.error('Error leyendo parámetros de uniformes:', error);
        return Response.json({ error: 'No se pudieron cargar los supuestos.' }, { status: 500 });
    }
}

export async function PATCH(request) {
    const denied = await denyUnlessRole(request, ROLES_PRECIO);
    if (denied) return denied;

    try {
        const body = await request.json();
        const quien = await quienEs(await getSessionFromRequest(request));

        const aGuardar = [];
        for (const clave of CLAVES) {
            if (!(clave in body)) continue;
            const n = Number(body[clave]);
            if (!Number.isFinite(n) || n < 0) {
                return Response.json({ error: `El valor de "${clave}" tiene que ser un número positivo.` }, { status: 400 });
            }
            aGuardar.push({ clave, valor: Math.min(n, TOPES[clave]) });
        }

        if (!aGuardar.length) {
            return Response.json({ error: 'No mandaste ningún supuesto para cambiar.' }, { status: 400 });
        }

        for (const p of aGuardar) {
            const { error } = await supabase
                .from('uniformes_parametros')
                .update({ valor: p.valor, updated_at: new Date().toISOString(), updated_by: quien })
                .eq('clave', p.clave);
            if (error) throw error;
        }

        const { data, error } = await supabase.from('uniformes_parametros').select('*').order('clave');
        if (error) throw error;
        return Response.json(data || []);
    } catch (error) {
        console.error('Error guardando parámetros de uniformes:', error);
        return Response.json({ error: 'No se pudieron guardar los supuestos.' }, { status: 500 });
    }
}
