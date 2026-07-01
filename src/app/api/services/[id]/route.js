import { db, supabase } from '@/lib/db';
import { resolveAmbaAddress } from '@/lib/geocoding';

export async function GET(_req, { params }) {
    try {
        const { id } = await params;
        const { data: service, error } = await supabase
            .from('services')
            .select('*')
            .eq('id', id)
            .single();
        if (error || !service) {
            return Response.json({ error: 'Servicio no encontrado' }, { status: 404 });
        }
        const { data: machineRows } = await supabase
            .from('service_machines')
            .select('quantity, machines(id, nombre)')
            .eq('service_id', id);
        const machines = (machineRows || [])
            .filter(r => r.machines)
            .map(r => ({
                id: r.machines.id,
                nombre: r.machines.nombre,
                quantity: r.quantity ?? 1,
            }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre));
        return Response.json({ ...service, machines });
    } catch (error) {
        console.error('Error fetching service detail:', error);
        return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
}

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
        const { name, address, lat, lng, geocodeCandidateId, manualCoords, encargado_nombre, encargado_telefono, sin_insumos } = await req.json();
        const trimmedName = name?.trim();
        const trimmedAddress = address?.trim();
        const encargadoNombre = encargado_nombre?.trim() || null;
        const encargadoTelefono = normalizePhone(encargado_telefono);
        const sinInsumos = sin_insumos === true;

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
            manualCoords,
        });

        if (!resolvedAddress) {
            return Response.json({ error: 'No encontramos direcciones exactas dentro de AMBA para esa busqueda.' }, { status: 400 });
        }

        await db.execute({
            sql: 'UPDATE services SET name = ?, address = ?, lat = ?, lng = ?, encargado_nombre = ?, encargado_telefono = ?, sin_insumos = ? WHERE id = ?',
            args: [trimmedName, resolvedAddress.address, resolvedAddress.lat, resolvedAddress.lng, encargadoNombre, encargadoTelefono, sinInsumos, id]
        });

        return Response.json({
            id: Number(id),
            name: trimmedName,
            address: resolvedAddress.address,
            lat: resolvedAddress.lat,
            lng: resolvedAddress.lng,
            encargado_nombre: encargadoNombre,
            encargado_telefono: encargadoTelefono,
            sin_insumos: sinInsumos,
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
