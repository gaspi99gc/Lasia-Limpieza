import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { getSessionFromRequest } from '@/lib/authCookie';

// Faltas de operarios. Se registra el hecho una sola vez y de ahí salen después
// las horas perdidas, la cobertura y lo que se le descuenta al cliente.
//
// Quien avisa es el propio operario, así que esto se carga en el momento, con la
// persona al teléfono: la ruta acepta lo mínimo y completa el resto sola.

const ROLES_ESCRITURA = ['operaciones', 'admin', 'jefe_operativo'];
const ROLES_LECTURA = ['operaciones', 'admin', 'jefe_operativo', 'rrhh', 'direccion'];

const MOTIVOS = ['enfermedad', 'personal', 'sin_aviso', 'accidente', 'sin_especificar'];
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

const todayAR = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES_LECTURA);
    if (denied) return denied;

    try {
        const { searchParams } = new URL(request.url);
        const desde = searchParams.get('desde') || todayAR();
        const hasta = searchParams.get('hasta') || desde;
        if (!FECHA_RE.test(desde) || !FECHA_RE.test(hasta) || desde > hasta) {
            return Response.json({ error: 'Rango de fechas inválido' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('faltas')
            .select(`
                *,
                employees:employee_id (nombre, apellido, legajo),
                services:service_id (name)
            `)
            .gte('fecha', desde)
            .lte('fecha', hasta)
            .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);

        return Response.json((data || []).map(f => ({
            ...f,
            fecha: f.fecha?.slice(0, 10),
            // Para mostrar: el nombre del legajo si matcheó, si no el del operativo.
            nombre: f.employees
                ? `${f.employees.apellido} ${f.employees.nombre}`
                : (f.nombre_excel || 'Sin identificar'),
            legajo: f.employees?.legajo || null,
            servicio: f.services?.name || f.servicio_excel || null,
        })));
    } catch (error) {
        console.error('Error listando faltas:', error);
        return Response.json({ error: 'No se pudieron cargar las faltas: ' + error.message }, { status: 500 });
    }
}

export async function POST(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const session = await getSessionFromRequest(request);
        const body = await request.json();

        const fecha = FECHA_RE.test(body.fecha || '') ? body.fecha : todayAR();
        const puestoId = body.puesto_id ? Number(body.puesto_id) : null;
        if (!puestoId && !body.employee_id) {
            return Response.json({ error: 'Falta indicar de qué puesto o persona se trata.' }, { status: 400 });
        }

        // El puesto del operativo ya sabe quién es y dónde: se toma de ahí en vez
        // de confiar en lo que mande el cliente.
        let puesto = null;
        if (puestoId) {
            const { data, error } = await supabase
                .from('operativo_puestos')
                .select('id, employee_id, nombre_excel, service_id, servicio_excel')
                .eq('id', puestoId)
                .single();
            if (error || !data) {
                return Response.json({ error: 'Ese puesto del operativo no existe.' }, { status: 400 });
            }
            puesto = data;
        }

        // Horas perdidas: las que tenía asignadas ese día, salvo que se corrijan.
        let horas = body.horas != null && body.horas !== '' ? Number(body.horas) : null;
        if (horas == null && puestoId) {
            const { data: celda } = await supabase
                .from('operativo_dias')
                .select('hi, he')
                .eq('puesto_id', puestoId)
                .eq('fecha', fecha)
                .maybeSingle();
            if (celda?.hi != null && celda?.he != null) {
                horas = Math.round((Number(celda.he) - Number(celda.hi)) * 100) / 100;
            }
        }
        if (horas != null && (!Number.isFinite(horas) || horas < 0 || horas > 24)) {
            return Response.json({ error: 'Las horas tienen que estar entre 0 y 24.' }, { status: 400 });
        }

        const motivo = MOTIVOS.includes(body.motivo) ? body.motivo : 'sin_especificar';

        // Quién la registró sale de la sesión, no de lo que mande el cliente: es
        // un dato de auditoría y tiene que ser confiable. La cookie solo trae el
        // id, así que el nombre se busca en app_users.
        let registrante = session?.role || null;
        if (session?.appUserId) {
            const { data: u } = await supabase
                .from('app_users')
                .select('name, surname, username')
                .eq('id', session.appUserId)
                .maybeSingle();
            if (u) registrante = [u.name, u.surname].filter(Boolean).join(' ').trim() || u.username || registrante;
        }

        const fila = {
            fecha,
            employee_id: body.employee_id ?? puesto?.employee_id ?? null,
            nombre_excel: body.nombre_excel ?? puesto?.nombre_excel ?? null,
            puesto_id: puestoId,
            service_id: body.service_id ?? puesto?.service_id ?? null,
            servicio_excel: body.servicio_excel ?? puesto?.servicio_excel ?? null,
            horas,
            // "sin_aviso" es la única que por definición no avisó.
            aviso: motivo === 'sin_aviso' ? false : (body.aviso !== false),
            motivo,
            nota: (body.nota || '').trim() || null,
            registrado_por: registrante,
        };

        const { data, error } = await supabase.from('faltas').insert(fila).select().single();
        if (error) {
            // La restricción UNIQUE evita cargar dos veces la misma falta.
            if (error.code === '23505') {
                return Response.json({ error: 'Esa falta ya estaba registrada para ese día.' }, { status: 409 });
            }
            throw new Error(error.message);
        }

        return Response.json(data, { status: 201 });
    } catch (error) {
        console.error('Error registrando falta:', error);
        return Response.json({ error: 'No se pudo registrar la falta: ' + error.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const { searchParams } = new URL(request.url);
        const id = Number(searchParams.get('id'));
        if (!id) return Response.json({ error: 'Falta el id.' }, { status: 400 });

        const { error } = await supabase.from('faltas').delete().eq('id', id);
        if (error) throw new Error(error.message);
        return Response.json({ ok: true });
    } catch (error) {
        console.error('Error borrando falta:', error);
        return Response.json({ error: 'No se pudo borrar: ' + error.message }, { status: 500 });
    }
}
