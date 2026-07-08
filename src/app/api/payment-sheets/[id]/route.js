import { supabase } from '@/lib/db';

const TIPOS = ['adicional', 'horas_extras', 'liquidacion_final', 'adelanto'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanLines(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map(l => ({
            operario: typeof l?.operario === 'string' ? l.operario.trim() : '',
            monto: Number(l?.monto),
        }))
        .filter(l => l.operario && Number.isFinite(l.monto) && l.monto >= 0);
}

export async function GET(_req, { params }) {
    try {
        const { id } = await params;

        const { data: sheet, error } = await supabase
            .from('payment_sheets')
            .select('id, tipo, nombre, fecha, created_at')
            .eq('id', id)
            .single();

        if (error || !sheet) {
            return Response.json({ error: 'Planilla no encontrada' }, { status: 404 });
        }

        const { data: lines } = await supabase
            .from('payment_sheet_lines')
            .select('id, operario, monto')
            .eq('sheet_id', id)
            .order('id', { ascending: true });

        const cleanedLines = (lines || []).map(l => ({
            id: l.id,
            operario: l.operario,
            monto: Number(l.monto || 0),
        }));

        return Response.json({
            ...sheet,
            lines: cleanedLines,
            total: cleanedLines.reduce((acc, l) => acc + l.monto, 0),
        });
    } catch (error) {
        console.error('Error fetching payment_sheet detail:', error);
        return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
}

export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const { tipo, nombre, fecha, lines } = await req.json();

        if (!TIPOS.includes(tipo)) {
            return Response.json({ error: 'Tipo de pago inválido' }, { status: 400 });
        }
        if (!nombre?.trim()) {
            return Response.json({ error: 'El nombre de la planilla es obligatorio' }, { status: 400 });
        }
        if (!fecha || !DATE_RE.test(fecha)) {
            return Response.json({ error: 'La fecha es obligatoria (formato YYYY-MM-DD)' }, { status: 400 });
        }

        const { error: updateError } = await supabase
            .from('payment_sheets')
            .update({ tipo, nombre: nombre.trim(), fecha })
            .eq('id', id);

        if (updateError) throw updateError;

        // Reemplazamos todas las lineas: borramos las viejas e insertamos las nuevas.
        const cleanedLines = cleanLines(lines);

        const { error: delError } = await supabase
            .from('payment_sheet_lines')
            .delete()
            .eq('sheet_id', id);

        if (delError) throw delError;

        if (cleanedLines.length > 0) {
            const { error: insError } = await supabase
                .from('payment_sheet_lines')
                .insert(cleanedLines.map(l => ({ sheet_id: Number(id), operario: l.operario, monto: l.monto })));

            if (insError) throw insError;
        }

        return Response.json({
            id: Number(id),
            tipo,
            nombre: nombre.trim(),
            fecha,
            cantidad_operarios: cleanedLines.length,
            total: cleanedLines.reduce((acc, l) => acc + l.monto, 0),
        });
    } catch (error) {
        console.error('Error updating payment_sheet:', error);
        return Response.json({ error: 'Failed to update payment sheet' }, { status: 500 });
    }
}

export async function DELETE(_req, { params }) {
    try {
        const { id } = await params;
        // Las lineas se borran solas por ON DELETE CASCADE.
        const { error } = await supabase
            .from('payment_sheets')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting payment_sheet:', error);
        return Response.json({ error: 'Failed to delete payment sheet' }, { status: 500 });
    }
}
