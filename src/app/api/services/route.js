import { db } from '@/lib/db';
import { resolveAmbaAddress } from '@/lib/geocoding';
import { getLocalServices } from '@/lib/local-services';

function getErrorStatus(error) {
    const message = error?.message?.toLowerCase() || '';
    return message.includes('amba') || message.includes('direccion') ? 400 : 500;
}

// Normaliza a formato internacional argentino (54 9 + área + número) para wa.me/<numero>.
// Si el número ya empieza con 54, se respeta tal cual. Si no, se asume Argentina móvil y se antepone 549.
function normalizePhone(value) {
    if (value == null) return null;
    let digits = String(value).replace(/\D+/g, '');
    if (!digits) return null;
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('54')) return digits;
    if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
    return `549${digits}`;
}

export async function GET() {
    try {
        const { rows } = await db.execute('SELECT * FROM services ORDER BY name ASC');
        if (rows && rows.length > 0) return Response.json(rows);
        const local = getLocalServices();
        return Response.json(local);
    } catch (error) {
        console.error('Error fetching services:', error);
        const local = getLocalServices();
        if (local.length > 0) return Response.json(local);
        return Response.json({ error: 'Failed to fetch services' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
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

        const result = await db.execute({
            sql: 'INSERT INTO services (name, address, lat, lng, encargado_nombre, encargado_telefono) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
            args: [trimmedName, resolvedAddress.address, resolvedAddress.lat, resolvedAddress.lng, encargadoNombre, encargadoTelefono]
        });

        const newId = result.rows[0].id;

        return Response.json({
            id: newId,
            name: trimmedName,
            address: resolvedAddress.address,
            lat: resolvedAddress.lat,
            lng: resolvedAddress.lng,
            encargado_nombre: encargadoNombre,
            encargado_telefono: encargadoTelefono,
        }, { status: 201 });
    } catch (error) {
        console.error('Error creating service:', error);
        return Response.json({ error: error.message || 'Failed to create service' }, { status: getErrorStatus(error) });
    }
}
