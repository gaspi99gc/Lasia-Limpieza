import { denyUnlessRole } from '@/lib/apiAuth';
import { ROLES_NOMINA } from '@/lib/vencimientos';
import { buscarOperarios } from '@/lib/buscar-operarios';

// Buscar operarios activos para sumarlos a la nómina de una documentación.
// Además de apellido, nombre y legajo, busca por DNI y lo devuelve: la nómina
// se arma con el DNI, que es lo que pide el cliente.
//
// GET ?q=acosta  |  ?q=23456789

export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES_NOMINA);
    if (denied) return denied;

    try {
        const q = new URL(request.url).searchParams.get('q');
        return Response.json(await buscarOperarios(q, { porDni: true }));
    } catch (error) {
        console.error('Error buscando operarios para la nómina:', error);
        return Response.json({ error: 'No se pudo buscar en el legajo.' }, { status: 500 });
    }
}
