import { denyIfSupplyReadOnly } from '@/lib/apiAuth';
import { ultimoPedidoDelServicio } from '@/lib/pedidos-servicio';

// GET ?service_id=X -> { pedido }: el último pedido del servicio, lo haya
// cargado quien lo haya cargado. Lo usa la pantalla de pedido nuevo (supervisor
// y compras) para avisar si es repetido o arrancar con sus insumos. Solo para
// quien puede cargar pedidos.
export async function GET(req) {
    try {
        const denied = await denyIfSupplyReadOnly(req);
        if (denied) return denied;

        const serviceId = Number(new URL(req.url).searchParams.get('service_id'));
        if (!serviceId) return Response.json({ error: 'Falta el servicio.' }, { status: 400 });

        return Response.json({ pedido: await ultimoPedidoDelServicio(serviceId) });
    } catch (error) {
        console.error('Error buscando el último pedido del servicio:', error);
        return Response.json({ error: 'No se pudo buscar el pedido anterior.' }, { status: 500 });
    }
}
