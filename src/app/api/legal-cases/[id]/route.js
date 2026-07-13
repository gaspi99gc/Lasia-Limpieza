import { supabase } from '@/lib/db';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanDate(v) {
    return (typeof v === 'string' && DATE_RE.test(v)) ? v : null;
}
function cleanText(v) {
    return (typeof v === 'string' ? v.trim() : '') || null;
}

export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const body = await req.json();
        const persona = cleanText(body.persona);

        if (!persona) {
            return Response.json({ error: 'La persona o entidad es obligatoria' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('legal_cases')
            .update({
                persona,
                caratula: cleanText(body.caratula),
                estado: cleanText(body.estado),
                fecha_inicio: cleanDate(body.fecha_inicio),
                fecha_audiencia: cleanDate(body.fecha_audiencia),
                fecha_cierre: cleanDate(body.fecha_cierre),
                notas: cleanText(body.notas),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return Response.json(data);
    } catch (error) {
        console.error('Error updating legal_case:', error);
        return Response.json({ error: 'No se pudo actualizar el caso legal' }, { status: 500 });
    }
}

export async function DELETE(_req, { params }) {
    try {
        const { id } = await params;
        const { error } = await supabase
            .from('legal_cases')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting legal_case:', error);
        return Response.json({ error: 'No se pudo eliminar el caso legal' }, { status: 500 });
    }
}
