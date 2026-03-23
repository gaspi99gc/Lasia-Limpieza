'use client';

import MainLayout from '@/components/MainLayout';
import PurchasesRequestsView from '@/components/PurchasesRequestsView';

export default function ComprasRealizadosPage() {
    return (
        <MainLayout>
            <PurchasesRequestsView
                title="Pedidos Completos"
                description="Pedidos marcados como OK desde Compras"
                fixedStatus="ok"
            />
        </MainLayout>
    );
}
