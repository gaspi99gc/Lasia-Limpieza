import { supabase } from '@/lib/db';
import { parseAppDate } from '@/lib/datetime';

// El último pedido de insumos de un servicio (pedidos del usuario, 2026-11-17).
//
// Pedido repetido: al armar un pedido nuevo, si el servicio ya tiene uno de los
// últimos 15 días, se avisa y se ofrece agregarle lo que falta a ese. Pasó con
// Luxcar Morón el 23/10: el pedido de Parque Leloir se cargó en Morón y en el
// remito de Limpos se sumaron los dos. Se puede crear otro igual (un urgente,
// uno que ya se entregó), pero tiene que ser a propósito.
//
// La carga NO arranca con los insumos del pedido anterior: se probó y se sacó el
// mismo día (lo pidió dirección). Cada pedido se carga a mano para que el gasto
// por servicio y por supervisor muestre lo que de verdad piden.
export const DIAS_PEDIDO_REPETIDO = 15;

/**
 * El pedido más nuevo del servicio, con lo que quedó en él (sin los ítems
 * borrados, con las correcciones de compras y los agregados), o null.
 * reciente = es de los últimos DIAS_PEDIDO_REPETIDO días.
 */
export async function ultimoPedidoDelServicio(serviceId) {
    const { data, error } = await supabase
        .from('supply_requests')
        .select('id, created_at, status, urgent, supervisor_id')
        .eq('service_id', serviceId)
        .order('created_at', { ascending: false })
        .limit(1);
    if (error) throw error;
    const pedido = data?.[0];
    if (!pedido) return null;

    const [itemsRes, supRes] = await Promise.all([
        supabase
            .from('supply_request_items')
            .select('supply_id, cantidad')
            .eq('request_id', pedido.id)
            .eq('eliminado', false)
            .order('id', { ascending: true }),
        pedido.supervisor_id
            ? supabase.from('supervisors').select('app_users:app_user_id(name, surname)').eq('id', pedido.supervisor_id).maybeSingle()
            : Promise.resolve({ data: null }),
    ]);
    if (itemsRes.error) throw itemsRes.error;

    const u = supRes.data?.app_users;
    const desde = Date.now() - DIAS_PEDIDO_REPETIDO * 24 * 60 * 60 * 1000;
    return {
        ...pedido,
        supervisor: u ? `${u.name || ''} ${u.surname || ''}`.trim() : null,
        items: (itemsRes.data || []).map(i => ({ supply_id: i.supply_id, cantidad: Number(i.cantidad) })),
        reciente: parseAppDate(pedido.created_at).getTime() >= desde,
    };
}
