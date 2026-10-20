import { denyUnlessRole } from '@/lib/apiAuth';
import { ROLES_ESCRITURA } from '@/lib/uniformes';
import { buscarOperarios } from '@/lib/buscar-operarios';

// Buscar a quién se le entrega un uniforme o quién lo devuelve.
//
// GET ?q=acosta            -> solo activos (entregar)
// GET ?q=acosta&bajas=1    -> también los dados de baja (devolver: quien
//                             renuncia trae el uniforme después de irse)

export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const { searchParams } = new URL(request.url);
        const encontrados = await buscarOperarios(searchParams.get('q'), {
            incluirBajas: searchParams.get('bajas') === '1',
        });
        return Response.json(encontrados);
    } catch (error) {
        console.error('Error buscando operarios para uniformes:', error);
        return Response.json({ error: 'No se pudo buscar en el legajo.' }, { status: 500 });
    }
}
