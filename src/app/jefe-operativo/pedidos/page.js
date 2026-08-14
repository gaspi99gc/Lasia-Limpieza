'use client';

import MainLayout from '@/components/MainLayout';
import PurchasesRequestsView from '@/components/PurchasesRequestsView';

// Vista de consulta para el jefe operativo: ve todos los pedidos y en que estado
// esta cada uno, sin poder cambiar nada (readOnly corta tambien la edicion de items).
export default function JefeOperativoPedidosPage() {
    return (
        <MainLayout>
            <PurchasesRequestsView
                title="Pedidos de Insumos"
                description="Consulta del estado de los pedidos. Solo lectura."
                defaultStatusFilter="activos"
                readOnly
            />
        </MainLayout>
    );
}
