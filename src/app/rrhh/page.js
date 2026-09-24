import MainLayout from '@/components/MainLayout';
import HRSection from '@/components/HRSection';

export default async function RRHHPage({ searchParams }) {
    const params = await searchParams;
    // El tab ya no se resuelve acá: lo lee HRSection de la URL, que es la fuente
    // de verdad desde que la navegación vive ahí. Tener el default en dos
    // lugares fue justo el bug: al abrir un legajo desde Personal la URL perdía
    // el tab y el servidor lo reponía con 'calendario'.
    //
    // Lo único que queda es traducir el parámetro viejo `empleado`, para que los
    // links ya compartidos sigan abriendo el legajo.
    const initialEmpleadoId = params?.empleado ? Number(params.empleado) : null;

    return (
        <MainLayout>
            <HRSection initialEmpleadoId={Number.isFinite(initialEmpleadoId) ? initialEmpleadoId : null} />
        </MainLayout>
    );
}
