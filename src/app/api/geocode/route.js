import { geocodeAddress } from '@/lib/geocoding';

export async function POST(req) {
    try {
        const { address } = await req.json();

        if (!address?.trim()) {
            return Response.json({ error: 'La direccion es obligatoria' }, { status: 400 });
        }

        const result = await geocodeAddress(address);

        if (!result) {
            return Response.json({ error: 'No encontramos esa direccion. Probá con calle, altura, ciudad y provincia.' }, { status: 404 });
        }

        return Response.json(result);
    } catch (error) {
        console.error('Error geocoding address:', error);
        return Response.json({ error: error.message || 'No se pudo geocodificar la direccion' }, { status: 500 });
    }
}
