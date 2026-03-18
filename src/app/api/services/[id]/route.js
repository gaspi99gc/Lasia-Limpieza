import { db } from '@/lib/db';
import { geocodeAddress } from '@/lib/geocoding';

function toNullableNumber(value) {
    if (value === '' || value === null || value === undefined) return null;

    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
}

export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const { name, address, lat, lng } = await req.json();
        const trimmedName = name?.trim();
        const trimmedAddress = address?.trim();

        if (!trimmedName) {
            return Response.json({ error: 'El nombre del servicio es obligatorio' }, { status: 400 });
        }

        if (!trimmedAddress) {
            return Response.json({ error: 'La direccion exacta del servicio es obligatoria' }, { status: 400 });
        }

        let resolvedLat = toNullableNumber(lat);
        let resolvedLng = toNullableNumber(lng);

        if (resolvedLat === null || resolvedLng === null) {
            const geocoded = await geocodeAddress(trimmedAddress);

            if (!geocoded) {
                return Response.json({ error: 'No encontramos esa direccion. Probá con calle, altura, ciudad y provincia.' }, { status: 400 });
            }

            resolvedLat = geocoded.lat;
            resolvedLng = geocoded.lng;
        }

        await db.execute({
            sql: 'UPDATE services SET name = ?, address = ?, lat = ?, lng = ? WHERE id = ?',
            args: [trimmedName, trimmedAddress, resolvedLat, resolvedLng, id]
        });

        return Response.json({ id: Number(id), name: trimmedName, address: trimmedAddress, lat: resolvedLat, lng: resolvedLng });
    } catch (error) {
        console.error('Error updating service:', error);
        return Response.json({ error: 'Failed to update service' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        const { id } = await params;
        await db.execute({
            sql: 'DELETE FROM services WHERE id = ?',
            args: [id]
        });
        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting service:', error);
        return Response.json({ error: 'Failed to delete service' }, { status: 500 });
    }
}
