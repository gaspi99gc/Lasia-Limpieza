import { db } from '@/lib/db';
import { resolveAmbaAddress } from '@/lib/geocoding';

function getErrorStatus(error) {
    const message = error?.message?.toLowerCase() || '';
    return message.includes('amba') || message.includes('direccion') ? 400 : 500;
}

export async function PUT(req, { params }) {
    try {
        const { id } = await params;
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

        await db.execute({
            sql: 'UPDATE services SET name = ?, address = ?, lat = ?, lng = ? WHERE id = ?',
            args: [trimmedName, resolvedAddress.address, resolvedAddress.lat, resolvedAddress.lng, id]
        });

        return Response.json({ id: Number(id), name: trimmedName, address: resolvedAddress.address, lat: resolvedAddress.lat, lng: resolvedAddress.lng });
    } catch (error) {
        console.error('Error updating service:', error);
        return Response.json({ error: error.message || 'Failed to update service' }, { status: getErrorStatus(error) });
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
