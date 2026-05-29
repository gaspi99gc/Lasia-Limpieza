import { supabase } from '@/lib/db';

export const runtime = 'nodejs';

const TIPOS = ['entrevista', 'cita', 'desvinculacion', 'sancion_programada', 'recordatorio'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

// Roles autorizados a crear cada tipo de evento.
// Entrevistas: solo RRHH/admin. El resto: RRHH + Operaciones (jefe_operativo) + admin.
function canCreateTipo(rol, tipo) {
    if (rol === 'admin' || rol === 'rrhh') return true;
    if (rol === 'jefe_operativo') return tipo !== 'entrevista';
    return false;
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
            return Response.json({ error: 'Parámetros from y to (YYYY-MM-DD) son obligatorios.' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('hr_calendar_events')
            .select('id, titulo, descripcion, tipo, fecha, hora_inicio, empleado_id, candidato_nombre, candidato_telefono, creado_por_id, creado_por_rol, creado_por_nombre, created_at, employees(nombre, apellido, legajo)')
            .eq('eliminado', false)
            .gte('fecha', from)
            .lte('fecha', to)
            .order('fecha', { ascending: true })
            .order('hora_inicio', { ascending: true, nullsFirst: true });

        if (error) throw error;

        const rows = (data || []).map(r => ({
            id: r.id,
            titulo: r.titulo,
            descripcion: r.descripcion,
            tipo: r.tipo,
            fecha: r.fecha,
            hora_inicio: r.hora_inicio,
            empleado_id: r.empleado_id,
            empleado_nombre: r.employees ? `${r.employees.apellido}, ${r.employees.nombre}` : null,
            empleado_legajo: r.employees?.legajo || null,
            candidato_nombre: r.candidato_nombre,
            candidato_telefono: r.candidato_telefono,
            creado_por_id: r.creado_por_id,
            creado_por_rol: r.creado_por_rol,
            creado_por_nombre: r.creado_por_nombre,
            created_at: r.created_at,
        }));
        return Response.json(rows);
    } catch (error) {
        console.error('Error fetching hr_calendar_events:', error);
        return Response.json({ error: 'Failed to fetch events' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const body = await req.json();
        const {
            titulo, descripcion, tipo, fecha, hora_inicio,
            empleado_id, candidato_nombre, candidato_telefono,
            creado_por_id, creado_por_rol, creado_por_nombre,
        } = body;

        if (!TIPOS.includes(tipo)) {
            return Response.json({ error: 'Tipo de evento inválido.' }, { status: 400 });
        }
        if (!canCreateTipo(creado_por_rol, tipo)) {
            return Response.json({ error: 'No tenés permiso para crear este tipo de evento.' }, { status: 403 });
        }
        if (!fecha || !DATE_RE.test(fecha)) {
            return Response.json({ error: 'La fecha es obligatoria (YYYY-MM-DD).' }, { status: 400 });
        }
        if (hora_inicio && !TIME_RE.test(hora_inicio)) {
            return Response.json({ error: 'Hora inválida (HH:MM).' }, { status: 400 });
        }

        if (tipo === 'entrevista') {
            if (!candidato_nombre?.trim()) {
                return Response.json({ error: 'El nombre del candidato es obligatorio.' }, { status: 400 });
            }
        } else if (tipo !== 'recordatorio') {
            if (!empleado_id) {
                return Response.json({ error: 'Tenés que vincular un empleado.' }, { status: 400 });
            }
        }

        const insert = {
            titulo: (titulo?.trim()) || tipo,
            descripcion: descripcion?.trim() || null,
            tipo,
            fecha,
            hora_inicio: hora_inicio || null,
            empleado_id: tipo === 'entrevista' ? null : (empleado_id || null),
            candidato_nombre: tipo === 'entrevista' ? candidato_nombre.trim() : null,
            candidato_telefono: tipo === 'entrevista' ? (candidato_telefono?.trim() || null) : null,
            creado_por_id: creado_por_id || null,
            creado_por_rol: creado_por_rol || null,
            creado_por_nombre: creado_por_nombre?.trim() || null,
        };

        const { data, error } = await supabase
            .from('hr_calendar_events')
            .insert(insert)
            .select()
            .single();

        if (error) throw error;
        return Response.json(data, { status: 201 });
    } catch (error) {
        console.error('Error creating hr_calendar_event:', error);
        return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
}
