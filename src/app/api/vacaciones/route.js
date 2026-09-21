import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';

// Días de vacaciones que le corresponden a cada operario según su antigüedad.
//
// La antigüedad se cuenta al 31 DE DICIEMBRE, no al día de hoy: así lo fija la
// ley (art. 150 LCT) y además es lo que evita que el número cambie solo cada
// vez que se abre la pantalla. Hay 26 personas que cambian de tramo entre
// septiembre y fin de año — calcular "hoy" daría otro resultado.
//
// Esta pantalla NO registra vacaciones tomadas: solo dice cuánto le toca a cada
// uno. Lo que ya se tomó sigue en la planilla de Operaciones.

const ROLES = ['admin', 'rrhh', 'direccion'];

// Escala del art. 150 LCT. El pedido puntual fue ver los de 21 y 28 días, pero
// se calculan todos: si no, el total no cierra y no se puede comparar.
const ESCALA = [
    { desde: 20, dias: 35 },
    { desde: 10, dias: 28 },
    { desde: 5, dias: 21 },
    { desde: 1, dias: 14 },
];

async function traerTodo(buildQuery, pageSize = 1000) {
    const filas = [];
    for (let desde = 0; ; desde += pageSize) {
        const { data, error } = await buildQuery().range(desde, desde + pageSize - 1);
        if (error) throw new Error(error.message);
        filas.push(...(data || []));
        if (!data || data.length < pageSize) return filas;
    }
}

/** Años cumplidos entre dos fechas, sin redondear para arriba. */
export function antiguedadEn(fechaIngreso, corte) {
    const a = new Date(corte);
    const b = new Date(fechaIngreso);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    let anios = a.getFullYear() - b.getFullYear();
    const m = a.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && a.getDate() < b.getDate())) anios--;
    return anios;
}

export function diasPorAntiguedad(anios) {
    if (anios == null || anios < 1) return 0;
    return (ESCALA.find(e => anios >= e.desde) || { dias: 0 }).dias;
}

export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES);
    if (denied) return denied;

    try {
        const { searchParams } = new URL(request.url);
        // El año del cierre. Por defecto el actual, pero se puede mirar el que
        // viene para planificar.
        const anio = Number(searchParams.get('anio'))
            || Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
                .format(new Date()).slice(0, 4));
        const corte = `${anio}-12-31`;

        const empleados = await traerTodo(() =>
            supabase
                .from('employees')
                .select('id, legajo, nombre, apellido, fecha_ingreso, estado_empleado, servicio_id')
                .order('apellido')
                .order('nombre')
        );
        const servicios = await traerTodo(() => supabase.from('services').select('id, name').order('id'));
        const nombreServicio = new Map(servicios.map(s => [s.id, s.name]));

        const activos = empleados.filter(e => e.estado_empleado === 'Activo');

        const filas = [];
        const sinFecha = [];
        for (const e of activos) {
            if (!e.fecha_ingreso) { sinFecha.push(`${e.apellido} ${e.nombre}`.trim()); continue; }
            const anios = antiguedadEn(e.fecha_ingreso, corte);
            const dias = diasPorAntiguedad(anios);
            // Quien cambia de tramo este año: es el dato que sorprende, porque
            // hoy le tocan menos días que los que va a tener en diciembre.
            const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
            const diasHoy = diasPorAntiguedad(antiguedadEn(e.fecha_ingreso, hoy));
            filas.push({
                employee_id: e.id,
                legajo: e.legajo,
                nombre: `${e.apellido} ${e.nombre}`.trim(),
                fecha_ingreso: e.fecha_ingreso,
                servicio: e.servicio_id ? (nombreServicio.get(e.servicio_id) || null) : null,
                anios,
                dias,
                sube_este_anio: dias !== diasHoy,
            });
        }

        filas.sort((a, b) => b.anios - a.anios || a.nombre.localeCompare(b.nombre));

        const porTramo = {};
        for (const f of filas) porTramo[f.dias] = (porTramo[f.dias] || 0) + 1;

        return Response.json({
            anio,
            corte,
            activos: activos.length,
            sinFecha,
            porTramo,
            filas,
        });
    } catch (error) {
        console.error('Error calculando vacaciones:', error);
        return Response.json({ error: 'No se pudieron calcular las vacaciones.' }, { status: 500 });
    }
}
