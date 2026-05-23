import { supabase } from '@/lib/db';

const CATEGORIAS = ['sancion', 'advertencia', 'felicitacion', 'incidente'];

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const empleadoId = searchParams.get('empleado_id');

        let query = supabase
            .from('employee_reports')
            .select('id, empleado_id, categoria, descripcion, autor, autor_rol, created_at')
            .order('created_at', { ascending: false });

        if (empleadoId) query = query.eq('empleado_id', empleadoId);

        const { data, error } = await query;
        if (error) throw error;
        return Response.json(data || []);
    } catch (error) {
        console.error('Error fetching employee_reports:', error);
        return Response.json({ error: 'Failed to fetch reports' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { empleado_id, categoria, descripcion, autor, autor_rol } = await req.json();

        if (!empleado_id) {
            return Response.json({ error: 'empleado_id es obligatorio' }, { status: 400 });
        }
        if (!CATEGORIAS.includes(categoria)) {
            return Response.json({ error: 'Categoría inválida' }, { status: 400 });
        }
        if (!descripcion?.trim()) {
            return Response.json({ error: 'La descripción es obligatoria' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('employee_reports')
            .insert({
                empleado_id,
                categoria,
                descripcion: descripcion.trim(),
                autor: autor?.trim() || null,
                autor_rol: autor_rol?.trim() || null,
            })
            .select()
            .single();

        if (error) throw error;
        return Response.json(data, { status: 201 });
    } catch (error) {
        console.error('Error creating employee_report:', error);
        return Response.json({ error: 'Failed to create report' }, { status: 500 });
    }
}
