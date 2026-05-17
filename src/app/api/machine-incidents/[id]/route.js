import { supabase } from '@/lib/db';

const ESTADOS = ['abierta', 'en_revision', 'reparada', 'reemplazada', 'descartada'];

export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const { descripcion, nota_interna, estado } = await req.json();

        const patch = { updated_at: new Date().toISOString() };
        if (descripcion !== undefined) {
            if (!descripcion?.trim()) {
                return Response.json({ error: 'La descripción no puede estar vacía' }, { status: 400 });
            }
            patch.descripcion = descripcion.trim();
        }
        if (nota_interna !== undefined) patch.nota_interna = nota_interna?.trim() || null;
        if (estado !== undefined) {
            if (!ESTADOS.includes(estado)) {
                return Response.json({ error: 'Estado inválido' }, { status: 400 });
            }
            patch.estado = estado;
        }

        const { error } = await supabase
            .from('machine_incidents')
            .update(patch)
            .eq('id', id);

        if (error) throw error;
        return Response.json({ success: true });
    } catch (error) {
        console.error('Error updating machine_incident:', error);
        return Response.json({ error: 'Failed to update incident' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        const { id } = await params;
        const { error } = await supabase
            .from('machine_incidents')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting machine_incident:', error);
        return Response.json({ error: 'Failed to delete incident' }, { status: 500 });
    }
}
