import { db } from '@/lib/db';
import { geocodeAddress } from '@/lib/geocoding';

function toNullableNumber(value) {
    if (value === '' || value === null || value === undefined) return null;

    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
}

export async function GET() {
    try {
        const { rows } = await db.execute('SELECT * FROM services ORDER BY name ASC');
        return Response.json(rows);
    } catch (error) {
        console.error('Error fetching services:', error);
        return Response.json({ error: 'Failed to fetch services' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
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

        const result = await db.execute({
            sql: 'INSERT INTO services (name, address, lat, lng) VALUES (?, ?, ?, ?) RETURNING id',
            args: [trimmedName, trimmedAddress, resolvedLat, resolvedLng]
        });

        const newId = result.rows[0].id;

        return Response.json({
            id: newId,
            name: trimmedName,
            address: trimmedAddress,
            lat: resolvedLat,
            lng: resolvedLng
        }, { status: 201 });
    } catch (error) {
        console.error('Error creating service:', error);
        return Response.json({ error: 'Failed to create service' }, { status: 500 });
    }
}
