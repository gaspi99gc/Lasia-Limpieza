import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';

// Ausentismo: cuántas horas de trabajo se pierden por faltas.
//
// Las faltas ya vienen atadas al legajo (employee_id), así que el cruce con la
// nómina es directo: quién falta, cuánto, y si esa persona sigue en la empresa.
//
// SOLO CUENTA GENTE ACTIVA (decisión del usuario). El 36% de las faltas
// cargadas son de personas que ya no trabajan acá: sirven para estudiar
// rotación, no para gestionar ausentismo. A alguien que ya no está no se lo
// puede llamar, y dejarlo adentro infla los promedios de un problema que ya no
// existe.
//
// Todavía NO corta por servicio: el 60% de las faltas son históricas importadas
// de la planilla, que no trae el servicio. Cuando se cargue el operativo al día,
// el servicio sale de ahí — y sale mejor que del legajo, porque dice dónde
// estaba la persona ESE día y no dónde está hoy.

const ROLES = ['admin', 'rrhh', 'direccion', 'jefe_operativo', 'operaciones'];

async function traerTodo(buildQuery, pageSize = 1000) {
    const filas = [];
    for (let desde = 0; ; desde += pageSize) {
        const { data, error } = await buildQuery().range(desde, desde + pageSize - 1);
        if (error) throw new Error(error.message);
        filas.push(...(data || []));
        if (!data || data.length < pageSize) return filas;
    }
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES);
    if (denied) return denied;

    try {
        const { searchParams } = new URL(request.url);
        // Por defecto, los últimos 6 meses: es lo que se usa para decidir.
        const meses = Math.min(24, Math.max(1, Number(searchParams.get('meses')) || 6));

        const [faltas, empleados] = await Promise.all([
            traerTodo(() =>
                supabase
                    .from('faltas')
                    .select('employee_id, fecha, horas, motivo, anulada_at')
                    .is('anulada_at', null)
                    .order('fecha')
            ),
            traerTodo(() =>
                supabase
                    .from('employees')
                    .select('id, nombre, apellido, legajo, estado_empleado')
                    .order('id')
            ),
        ]);

        const activos = new Map(
            empleados.filter(e => e.estado_empleado === 'Activo').map(e => [e.id, e])
        );

        // Ventana de meses hacia atrás desde el mes actual.
        const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
            .format(new Date());
        const [anio, mes] = hoy.slice(0, 7).split('-').map(Number);
        const desdeMes = new Date(Date.UTC(anio, mes - 1 - (meses - 1), 1)).toISOString().slice(0, 7);

        const propias = faltas.filter(f =>
            activos.has(f.employee_id) && f.fecha.slice(0, 7) >= desdeMes
        );

        // Por mes
        const porMesMap = new Map();
        for (const f of propias) {
            const m = f.fecha.slice(0, 7);
            if (!porMesMap.has(m)) porMesMap.set(m, { mes: m, faltas: 0, horas: 0, personas: new Set() });
            const acc = porMesMap.get(m);
            acc.faltas++;
            acc.horas += num(f.horas);
            acc.personas.add(f.employee_id);
        }
        const porMes = [...porMesMap.values()]
            .sort((a, b) => a.mes.localeCompare(b.mes))
            .map(m => ({ mes: m.mes, faltas: m.faltas, horas: m.horas, personas: m.personas.size }));

        // Ranking de personas. Es el corte accionable: con esta lista se puede
        // hablar con alguien concreto.
        const porPersona = new Map();
        for (const f of propias) {
            if (!porPersona.has(f.employee_id)) porPersona.set(f.employee_id, { faltas: 0, horas: 0 });
            const acc = porPersona.get(f.employee_id);
            acc.faltas++;
            acc.horas += num(f.horas);
        }
        const ranking = [...porPersona.entries()]
            .map(([id, v]) => {
                const e = activos.get(id);
                return {
                    employee_id: id,
                    nombre: `${e.apellido} ${e.nombre}`.trim(),
                    legajo: e.legajo,
                    faltas: v.faltas,
                    horas: v.horas,
                };
            })
            // Por HORAS y no por cantidad: una falta de 8 horas no pesa lo mismo
            // que una de 2, y ordenar por cantidad esconde eso.
            .sort((a, b) => b.horas - a.horas);

        const totalHoras = propias.reduce((a, f) => a + num(f.horas), 0);
        const mesesConDatos = porMes.length || 1;

        // Cuánto se concentra: si unas pocas personas explican gran parte de las
        // horas, el problema se resuelve hablando con ellas y no con una medida
        // general.
        const top10Horas = ranking.slice(0, 10).reduce((a, r) => a + r.horas, 0);

        const porMotivo = {};
        for (const f of propias) {
            const k = f.motivo || 'sin_especificar';
            porMotivo[k] = (porMotivo[k] || 0) + 1;
        }

        return Response.json({
            desde: desdeMes,
            meses: mesesConDatos,
            resumen: {
                faltas: propias.length,
                horas: totalHoras,
                personas: porPersona.size,
                activos: activos.size,
                horasPromedioMes: totalHoras / mesesConDatos,
                // El número que se entiende sin traducir: cuántas jornadas
                // completas de trabajo se pierden por mes.
                jornadasPromedioMes: totalHoras / mesesConDatos / 8,
                pctPersonalConFaltas: activos.size ? (porPersona.size / activos.size) * 100 : 0,
                pctHorasTop10: totalHoras ? (top10Horas / totalHoras) * 100 : 0,
            },
            porMes,
            ranking: ranking.slice(0, 20),
            porMotivo,
        });
    } catch (error) {
        console.error('Error calculando ausentismo:', error);
        return Response.json({ error: 'No se pudo calcular el ausentismo.' }, { status: 500 });
    }
}
