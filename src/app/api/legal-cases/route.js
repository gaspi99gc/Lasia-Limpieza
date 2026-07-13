import { supabase } from '@/lib/db';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Normaliza una fecha opcional: '' o invalida -> null.
function cleanDate(v) {
    return (typeof v === 'string' && DATE_RE.test(v)) ? v : null;
}
function cleanText(v) {
    return (typeof v === 'string' ? v.trim() : '') || null;
}

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('legal_cases')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return Response.json(data || []);
    } catch (error) {
        console.error('Error fetching legal_cases:', error);
        return Response.json({ error: 'No se pudieron obtener los casos legales' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const body = await req.json();
        const persona = cleanText(body.persona);

        if (!persona) {
            return Response.json({ error: 'La persona o entidad es obligatoria' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('legal_cases')
            .insert({
                persona,
                caratula: cleanText(body.caratula),
                estado: cleanText(body.estado),
                fecha_inicio: cleanDate(body.fecha_inicio),
                fecha_audiencia: cleanDate(body.fecha_audiencia),
                fecha_cierre: cleanDate(body.fecha_cierre),
                notas: cleanText(body.notas),
            })
            .select()
            .single();

        if (error) throw error;
        return Response.json(data, { status: 201 });
    } catch (error) {
        console.error('Error creating legal_case:', error);
        return Response.json({ error: 'No se pudo crear el caso legal' }, { status: 500 });
    }
}
