import { db } from '@/lib/db';
import { resolveAmbaAddress } from '@/lib/geocoding';

function getErrorStatus(error) {
    const message = error?.message?.toLowerCase() || '';
    return message.includes('amba') || message.includes('direccion') ? 400 : 500;
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
        const { name, address, lat, lng, geocodeCandidateId } = await req.json();
        const trimmedName = name?.trim();
        const trimmedAddress = address?.trim();

        if (!trimmedName) {
            return Response.json({ error: 'El nombre del servicio es obligatorio' }, { status: 400 });
        }

        if (!trimmedAddress) {
            return Response.json({ error: 'La direccion exacta del servicio es obligatoria' }, { status: 400 });
        }

        const resolvedAddress = await resolveAmbaAddress(trimmedAddress, {
            candidateId: geocodeCandidateId,
            fallbackLat: lat,
            fallbackLng: lng,
        });

        if (!resolvedAddress) {
            return Response.json({ error: 'No encontramos direcciones exactas dentro de AMBA para esa busqueda.' }, { status: 400 });
        }

        const result = await db.execute({
            sql: 'INSERT INTO services (name, address, lat, lng) VALUES (?, ?, ?, ?) RETURNING id',
            args: [trimmedName, resolvedAddress.address, resolvedAddress.lat, resolvedAddress.lng]
        });

        const newId = result.rows[0].id;

        return Response.json({
            id: newId,
            name: trimmedName,
            address: resolvedAddress.address,
            lat: resolvedAddress.lat,
            lng: resolvedAddress.lng
        }, { status: 201 });
    } catch (error) {
        console.error('Error creating service:', error);
        return Response.json({ error: error.message || 'Failed to create service' }, { status: getErrorStatus(error) });
    }
}
