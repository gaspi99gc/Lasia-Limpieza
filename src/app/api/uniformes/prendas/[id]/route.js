import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { getSessionFromRequest } from '@/lib/authCookie';
import { ROLES_ESCRITURA, ROLES_PRECIO } from '@/lib/uniformes';

// Editar una prenda del catalogo.
//
// El PATCH tiene dos permisos distintos segun QUE se cambia:
//   - solo el precio  -> lo puede hacer direccion (el jefe pone sus numeros)
//   - cualquier otra cosa -> solo RRHH/admin
//
// El middleware ya deja pasar a direccion en este prefijo, pero eso solo abre la
// puerta: sin este corte, direccion podria cambiar tambien el nombre, el stock
// minimo o desactivar prendas. El permiso tiene que ser del tamaño del pedido.

const limpiar = (v) => (typeof v === 'string' ? v.trim() : '') || null;

function normalizarPrecio(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100) / 100;
}

function enteroNoNegativo(v, porDefecto = 0) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : porDefecto;
}

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

export async function PATCH(request, { params }) {
    try {
        const { id } = await params;
        const prendaId = Number(id);
        if (!prendaId) return Response.json({ error: 'Id inválido.' }, { status: 400 });

        const body = await request.json();
        const campos = Object.keys(body || {});
        if (!campos.length) {
            return Response.json({ error: 'No mandaste nada para cambiar.' }, { status: 400 });
        }

        // El permiso depende de que se este tocando.
        const soloPrecio = campos.length === 1 && campos[0] === 'precio';
        const denied = await denyUnlessRole(request, soloPrecio ? ROLES_PRECIO : ROLES_ESCRITURA);
        if (denied) return denied;

        const { data: actual, error: eGet } = await supabase
            .from('uniformes_prendas')
            .select('*')
            .eq('id', prendaId)
            .maybeSingle();
        if (eGet) throw eGet;
        if (!actual) return Response.json({ error: 'La prenda no existe.' }, { status: 404 });

        const cambios = { updated_at: new Date().toISOString() };
        if ('prenda' in body) {
            const nombre = limpiar(body.prenda);
            if (!nombre) return Response.json({ error: 'El nombre no puede quedar vacío.' }, { status: 400 });
            cambios.prenda = nombre;
        }
        if ('talle' in body) cambios.talle = limpiar(body.talle) || actual.talle;
        if ('precio' in body) cambios.precio = normalizarPrecio(body.precio);
        if ('unidades_por_operario' in body) {
            cambios.unidades_por_operario = Math.max(1, enteroNoNegativo(body.unidades_por_operario, 1));
        }
        if ('stock_minimo' in body) cambios.stock_minimo = enteroNoNegativo(body.stock_minimo, 0);
        if ('activo' in body) cambios.activo = body.activo !== false;

        const { data, error } = await supabase
            .from('uniformes_prendas')
            .update(cambios)
            .eq('id', prendaId)
            .select()
            .single();
        if (error) {
            if (error.code === '23505') {
                return Response.json({ error: 'Ya existe otra prenda con ese nombre y talle.' }, { status: 409 });
            }
            throw error;
        }

        // Cada cambio de precio queda asentado: sin esto, un precio corregido a
        // mano y un aumento real del proveedor se ven identicos en el grafico y
        // no hay forma de explicar un salto del gasto.
        if ('precio' in cambios && Number(cambios.precio) !== Number(actual.precio)) {
            const quien = await quienEs(await getSessionFromRequest(request));
            const { error: eHist } = await supabase.from('uniformes_precios_historial').insert({
                prenda_id: prendaId,
                precio_anterior: actual.precio,
                precio_nuevo: cambios.precio,
                usuario: quien,
            });
            // El precio ya se guardo: si falla el asiento se avisa por consola,
            // pero no se le tira un error al usuario por algo que si funciono.
            if (eHist) console.error('No se pudo asentar el cambio de precio:', eHist.message);
        }

        return Response.json(data);
    } catch (error) {
        console.error('Error editando prenda:', error);
        return Response.json({ error: 'No se pudo guardar el cambio.' }, { status: 500 });
    }
}

// Nunca borra: desactiva. Una prenda con movimientos no se puede borrar sin
// romper el gasto de los meses pasados.
export async function DELETE(request, { params }) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const { id } = await params;
        const prendaId = Number(id);
        if (!prendaId) return Response.json({ error: 'Id inválido.' }, { status: 400 });

        const { count, error: eCount } = await supabase
            .from('uniformes_movimientos')
            .select('id', { count: 'exact', head: true })
            .eq('prenda_id', prendaId);
        if (eCount) throw eCount;

        if (count && count > 0) {
            const { data, error } = await supabase
                .from('uniformes_prendas')
                .update({ activo: false, updated_at: new Date().toISOString() })
                .eq('id', prendaId)
                .select()
                .single();
            if (error) throw error;
            return Response.json({
                desactivada: true,
                prenda: data,
                mensaje: `Tiene ${count} movimiento${count === 1 ? '' : 's'} cargado${count === 1 ? '' : 's'}, `
                    + 'así que se desactivó en vez de borrarla: borrarla cambiaría el gasto de los meses pasados.',
            });
        }

        const { error } = await supabase.from('uniformes_prendas').delete().eq('id', prendaId);
        if (error) throw error;
        return Response.json({ borrada: true });
    } catch (error) {
        console.error('Error borrando prenda:', error);
        return Response.json({ error: 'No se pudo borrar la prenda.' }, { status: 500 });
    }
}
