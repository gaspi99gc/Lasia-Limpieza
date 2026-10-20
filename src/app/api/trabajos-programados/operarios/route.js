import { denyUnlessRole } from '@/lib/apiAuth';
import { ROLES_ESCRITURA } from '@/lib/trabajos-server';
import { buscarOperarios } from '@/lib/buscar-operarios';

// Buscar operarios del legajo activo (sin fecha de baja) para coordinar un
// trabajo. Solo para quien coordina: Operaciones y admin.
//
// GET ?q=acosta maria&service_id=12
//
// La busqueda (3 letras, sin acentos, los del servicio primero) vive en
// src/lib/buscar-operarios.js: la usan tambien los uniformes.

export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const { searchParams } = new URL(request.url);
        const encontrados = await buscarOperarios(searchParams.get('q'), {
            servicioId: Number(searchParams.get('service_id')) || null,
        });
        return Response.json(encontrados);
    } catch (error) {
        console.error('Error buscando operarios para trabajos:', error);
        return Response.json({ error: 'No se pudo buscar en el legajo.' }, { status: 500 });
    }
}
