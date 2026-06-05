import { supabase } from '@/lib/db';

export const runtime = 'nodejs';

function cleanList(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
        .map(v => (typeof v === 'string' ? v.trim() : ''))
        .filter(v => v.length > 0);
}

function cleanMails(arr) {
    return cleanList(arr).map(v => v.toLowerCase());
}

export async function PATCH(req, { params }) {
    try {
        const { id } = await params;
        const body = await req.json();
        const update = {
            administrador_nombre: typeof body.administrador_nombre === 'string'
                ? body.administrador_nombre.trim() || null
                : null,
            administrador_mails: cleanMails(body.administrador_mails),
            administrador_telefonos: cleanList(body.administrador_telefonos),
        };
        const { data, error } = await supabase
            .from('services')
            .update(update)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return Response.json(data);
    } catch (error) {
        console.error('Error updating service contacto:', error);
        return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
}
