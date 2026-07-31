import { supabase } from '@/lib/db';

const CATEGORIAS = ['sancion', 'advertencia', 'felicitacion', 'incidente', 'suspension', 'cambio_servicio'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const empleadoId = searchParams.get('empleado_id');
        const autorId = searchParams.get('autor_id');

        let query = supabase
            .from('employee_reports')
            .select('id, empleado_id, categoria, descripcion, autor, autor_rol, autor_id, created_at, fecha_desde, fecha_hasta, servicio_origen_id, servicio_destino_id, employees(nombre, apellido, legajo)')
            .order('created_at', { ascending: false });

        if (empleadoId) query = query.eq('empleado_id', empleadoId);
        if (autorId) query = query.eq('autor_id', autorId);

        const { data, error } = await query;
        if (error) throw error;

        // Nombres de servicio para los informes de cambio de servicio (sin depender de FK/join).
        const svcIds = [...new Set((data || []).flatMap(r => [r.servicio_origen_id, r.servicio_destino_id]).filter(Boolean))];
        const svcName = new Map();
        if (svcIds.length) {
            const { data: svcs } = await supabase.from('services').select('id, name').in('id', svcIds);
            (svcs || []).forEach(s => svcName.set(s.id, s.name));
        }

        const rows = (data || []).map(r => ({
            id: r.id,
            empleado_id: r.empleado_id,
            categoria: r.categoria,
            descripcion: r.descripcion,
            autor: r.autor,
            autor_rol: r.autor_rol,
            autor_id: r.autor_id,
            created_at: r.created_at,
            fecha_desde: r.fecha_desde || null,
            fecha_hasta: r.fecha_hasta || null,
            servicio_origen_id: r.servicio_origen_id || null,
            servicio_destino_id: r.servicio_destino_id || null,
            servicio_origen_nombre: r.servicio_origen_id ? (svcName.get(r.servicio_origen_id) || null) : null,
            servicio_destino_nombre: r.servicio_destino_id ? (svcName.get(r.servicio_destino_id) || null) : null,
            empleado_nombre: r.employees ? `${r.employees.apellido}, ${r.employees.nombre}` : null,
            empleado_legajo: r.employees?.legajo || null,
        }));
        return Response.json(rows);
    } catch (error) {
        console.error('Error fetching employee_reports:', error);
        return Response.json({ error: 'Failed to fetch reports' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { empleado_id, categoria, descripcion, autor, autor_rol, autor_id, fecha_desde, fecha_hasta, servicio_origen_id, servicio_destino_id } = await req.json();

        if (!empleado_id) {
            return Response.json({ error: 'empleado_id es obligatorio' }, { status: 400 });
        }
        if (!CATEGORIAS.includes(categoria)) {
            return Response.json({ error: 'Categoría inválida' }, { status: 400 });
        }
        // En cambio de servicio la nota es opcional; en el resto la descripción es obligatoria.
        if (categoria !== 'cambio_servicio' && !descripcion?.trim()) {
            return Response.json({ error: 'La descripción es obligatoria' }, { status: 400 });
        }

        let desdeFinal = null;
        let hastaFinal = null;
        let origenFinal = null;
        let destinoFinal = null;

        if (categoria === 'suspension') {
            if (!fecha_desde || !fecha_hasta || !DATE_RE.test(fecha_desde) || !DATE_RE.test(fecha_hasta)) {
                return Response.json({ error: 'Las fechas desde y hasta son obligatorias en una suspensión (formato YYYY-MM-DD).' }, { status: 400 });
            }
            if (fecha_hasta < fecha_desde) {
                return Response.json({ error: 'La fecha "hasta" no puede ser anterior a "desde".' }, { status: 400 });
            }
            desdeFinal = fecha_desde;
            hastaFinal = fecha_hasta;
        }

        if (categoria === 'cambio_servicio') {
            const origen = Number(servicio_origen_id);
            const destino = Number(servicio_destino_id);
            if (!Number.isFinite(origen) || !Number.isFinite(destino)) {
                return Response.json({ error: 'Elegí el servicio de origen y el de destino.' }, { status: 400 });
            }
            if (origen === destino) {
                return Response.json({ error: 'El servicio de origen y el de destino no pueden ser el mismo.' }, { status: 400 });
            }
            origenFinal = origen;
            destinoFinal = destino;
        }

        const { data, error } = await supabase
            .from('employee_reports')
            .insert({
                empleado_id,
                categoria,
                descripcion: descripcion?.trim() || null,
                autor: autor?.trim() || null,
                autor_rol: autor_rol?.trim() || null,
                autor_id: (autor_id || '').toString().trim() || null,
                fecha_desde: desdeFinal,
                fecha_hasta: hastaFinal,
                servicio_origen_id: origenFinal,
                servicio_destino_id: destinoFinal,
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
