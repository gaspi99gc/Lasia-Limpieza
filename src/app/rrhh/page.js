import MainLayout from '@/components/MainLayout';
import HRSection from '@/components/HRSection';

export default async function RRHHPage({ searchParams }) {
    const params = await searchParams;
    const tab = params?.tab;
    const initialTab = tab === 'personal' ? 'personal' : tab === 'periodos' ? 'periodos' : tab === 'licencias' ? 'licencias' : tab === 'informes' ? 'informes' : tab === 'recibos' ? 'recibos' : tab === 'legales' ? 'legales' : tab === 'solicitud-personal' ? 'solicitud-personal' : 'calendario';
    const initialEmpleadoId = params?.empleado ? Number(params.empleado) : null;

    return (
        <MainLayout>
            <HRSection initialTab={initialTab} initialEmpleadoId={Number.isFinite(initialEmpleadoId) ? initialEmpleadoId : null} />
        </MainLayout>
    );
}
