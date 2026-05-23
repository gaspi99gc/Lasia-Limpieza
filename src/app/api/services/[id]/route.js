import { db } from '@/lib/db';
import { resolveAmbaAddress } from '@/lib/geocoding';

function getErrorStatus(error) {
    const message = error?.message?.toLowerCase() || '';
    return message.includes('amba') || message.includes('direccion') ? 400 : 500;
}

function normalizePhone(value) {
    if (value == null) return null;
    let digits = String(value).replace(/\D+/g, '');
    if (!digits) return null;
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('54')) return digits;
    if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
    return `549${digits}`;
}

export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const { name, address, lat, lng, geocodeCandidateId, encargado_nombre, encargado_telefono } = await req.json();
        const trimmedName = name?.trim();
        const trimmedAddress = address?.trim();
        const encargadoNombre = encargado_nombre?.trim() || null;
        const encargadoTelefono = normalizePhone(encargado_telefono);

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
            sql: 'UPDATE services SET name = ?, address = ?, lat = ?, lng = ?, encargado_nombre = ?, encargado_telefono = ? WHERE id = ?',
            args: [trimmedName, resolvedAddress.address, resolvedAddress.lat, resolvedAddress.lng, encargadoNombre, encargadoTelefono, id]
        });

        return Response.json({
            id: Number(id),
            name: trimmedName,
            address: resolvedAddress.address,
            lat: resolvedAddress.lat,
            lng: resolvedAddress.lng,
            encargado_nombre: encargadoNombre,
            encargado_telefono: encargadoTelefono,
        });
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
