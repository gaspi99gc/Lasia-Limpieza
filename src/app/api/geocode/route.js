import { searchAmbaAddresses } from '@/lib/geocoding';

function getErrorStatus(error) {
    const message = error?.message?.toLowerCase() || '';
    return message.includes('amba') || message.includes('direccion') ? 400 : 500;
}

export async function POST(req) {
    try {
        const { address } = await req.json();

        if (!address?.trim()) {
            return Response.json({ error: 'La direccion es obligatoria' }, { status: 400 });
        }

        const result = await searchAmbaAddresses(address);

        if (result.candidates.length === 0) {
            return Response.json({ error: 'No encontramos direcciones exactas dentro de AMBA para esa busqueda.' }, { status: 404 });
        }

        return Response.json(result);
    } catch (error) {
        console.error('Error geocoding address:', error);
        return Response.json({ error: error.message || 'No se pudo geocodificar la direccion' }, { status: getErrorStatus(error) });
    }
}
