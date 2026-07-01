import { supabase } from '@/lib/db';

export const TIPOS = ['adicional', 'horas_extras', 'liquidacion_final', 'adelanto'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Normaliza las lineas: operario con texto y monto numerico >= 0. Descarta vacias.
function cleanLines(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map(l => ({
            operario: typeof l?.operario === 'string' ? l.operario.trim() : '',
            monto: Number(l?.monto),
        }))
        .filter(l => l.operario && Number.isFinite(l.monto) && l.monto >= 0);
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const tipo = searchParams.get('tipo');

        let query = supabase
            .from('payment_sheets')
            .select('id, tipo, nombre, fecha, created_at, payment_sheet_lines(monto)')
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false });

        if (tipo && TIPOS.includes(tipo)) query = query.eq('tipo', tipo);

        const { data, error } = await query;
        if (error) throw error;

        const rows = (data || []).map(s => {
            const lines = Array.isArray(s.payment_sheet_lines) ? s.payment_sheet_lines : [];
            return {
                id: s.id,
                tipo: s.tipo,
                nombre: s.nombre,
                fecha: s.fecha,
                created_at: s.created_at,
                cantidad_operarios: lines.length,
                total: lines.reduce((acc, l) => acc + Number(l.monto || 0), 0),
            };
        });

        return Response.json(rows);
    } catch (error) {
        console.error('Error fetching payment_sheets:', error);
        return Response.json({ error: 'Failed to fetch payment sheets' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
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

        const cleanedLines = cleanLines(lines);

        const { data: sheet, error: sheetError } = await supabase
            .from('payment_sheets')
            .insert({ tipo, nombre: nombre.trim(), fecha })
            .select('id')
            .single();

        if (sheetError) throw sheetError;

        if (cleanedLines.length > 0) {
            const { error: linesError } = await supabase
                .from('payment_sheet_lines')
                .insert(cleanedLines.map(l => ({ sheet_id: sheet.id, operario: l.operario, monto: l.monto })));

            if (linesError) {
                // Deshacemos la planilla para no dejar una sin sus lineas.
                await supabase.from('payment_sheets').delete().eq('id', sheet.id);
                throw linesError;
            }
        }

        return Response.json({
            id: sheet.id,
            tipo,
            nombre: nombre.trim(),
            fecha,
            cantidad_operarios: cleanedLines.length,
            total: cleanedLines.reduce((acc, l) => acc + l.monto, 0),
        }, { status: 201 });
    } catch (error) {
        console.error('Error creating payment_sheet:', error);
        return Response.json({ error: 'Failed to create payment sheet' }, { status: 500 });
    }
}
