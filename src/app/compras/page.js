'use client';

import MainLayout from '@/components/MainLayout';
import PurchasesRequestsView from '@/components/PurchasesRequestsView';

export default function ComprasPage() {
    return (
        <MainLayout>
            <PurchasesRequestsView
                title="Compras"
                description="Recepción y seguimiento de pedidos de insumos enviados por supervisores"
                defaultStatusFilter="todos"
                allowStatusEditing
            />
        </MainLayout>
    );
}
