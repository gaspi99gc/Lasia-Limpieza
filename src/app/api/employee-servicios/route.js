import { supabase } from '@/lib/db';

// Los servicios de un operario (todos, no solo el principal), con las horas por
// día de cada uno. Los llena un script desde el operativo; acá solo se leen.
//
// GET ?employee_id=123 -> [{ service_id, nombre, horas_dia }]
//
// Mismo acceso que /api/employees: el middleware ya exige sesión.

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const empleadoId = Number(searchParams.get('employee_id'));
        if (!empleadoId) return Response.json({ error: 'Falta employee_id.' }, { status: 400 });

        const { data, error } = await supabase
            .from('employee_servicios')
            .select('service_id, horas_dia, services:service_id (name)')
            .eq('employee_id', empleadoId)
            .order('horas_dia', { ascending: false, nullsFirst: false });
        // Si la tabla todavía no existe (migración sin correr), el legajo se
        // ve igual que antes: con su servicio principal.
        if (error) return Response.json([]);

        return Response.json((data || []).map((s) => ({
            service_id: s.service_id,
            nombre: s.services?.name || null,
            horas_dia: s.horas_dia != null ? Number(s.horas_dia) : null,
        })));
    } catch (error) {
        console.error('Error leyendo servicios del operario:', error);
        return Response.json([]);
    }
}
