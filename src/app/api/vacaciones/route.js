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

/**
 * Días hábiles (lunes a viernes) entre dos fechas, contando las dos puntas.
 *
 * No se descuentan feriados: el art. 151 los cuenta como hábiles cuando el
 * trabajador debía prestar servicios, así que sacarlos daría de menos.
 */
export function diasHabilesEntre(desde, hasta) {
    const a = new Date(`${String(desde).slice(0, 10)}T12:00:00Z`);
    const b = new Date(`${String(hasta).slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || a > b) return 0;

    const totalDias = Math.round((b - a) / 86400000) + 1;
    // Las semanas enteras aportan 5 hábiles cada una; del resto se cuenta día
    // por día. Así no hace falta iterar 365 veces por persona.
    const semanas = Math.floor(totalDias / 7);
    let habiles = semanas * 5;
    const sobran = totalDias % 7;
    const primerDia = a.getUTCDay();   // 0 domingo … 6 sábado
    for (let i = 0; i < sobran; i++) {
        const d = (primerDia + semanas * 7 + i) % 7;
        if (d !== 0 && d !== 6) habiles++;
    }
    return habiles;
}

/**
 * Vacaciones proporcionales del art. 153 LCT: un día por cada VEINTE de
 * trabajo efectivo, para quien no llegó a la mitad de los días hábiles del año
 * y por lo tanto no alcanza el mínimo del art. 151.
 *
 * Son 105 de los 334 activos: casi un tercio del plantel, no un caso raro.
 *
 * Se cuentan días HÁBILES (decisión del usuario, y es como suele liquidarse):
 * seis meses dan 6 días, no 9. Las faltas injustificadas NO se descuentan
 * aunque el art. 152 lo permitiría: el número tiene que salir de un solo dato
 * (la fecha de ingreso) para que no se mueva solo y se pueda explicar en una
 * frase. Un caso puntual se corrige a mano con un movimiento de tipo 'ajuste'.
 *
 * Se trunca para abajo: 19 días trabajados todavía no son un día de vacaciones.
 */
export function diasProporcionales(fechaIngreso, corte) {
    if (!fechaIngreso) return 0;
    return Math.floor(diasHabilesEntre(fechaIngreso, corte) / 20);
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

        // Los días ya usados, por persona y período. Cuentan igual los tomados y
        // los pagados en efectivo: los dos son días que la persona ya no tiene
        // disponibles (decisión del usuario).
        const movimientos = await traerTodo(() =>
            supabase
                .from('vacaciones_movimientos')
                .select('employee_id, periodo, cantidad, anulado_at')
                .is('anulado_at', null)
                .order('id')
        );
        const usadosPor = new Map();   // "empleado|periodo" -> días
        for (const m of movimientos) {
            const k = `${m.employee_id}|${m.periodo}`;
            usadosPor.set(k, (usadosPor.get(k) || 0) + (Number(m.cantidad) || 0));
        }

        // Arrastre del año anterior. 2026 arranca en cero porque lo de años
        // previos se cerró por afuera (decisión del usuario); de 2027 en
        // adelante se encadena el saldo que haya quedado a favor.
        const PRIMER_PERIODO = 2026;
        const arrastreDe = (empleadoId, fechaIngreso) => {
            if (anio <= PRIMER_PERIODO) return 0;
            let saldo = 0;
            for (let p = PRIMER_PERIODO; p < anio; p++) {
                const corresponden = diasPorAntiguedad(antiguedadEn(fechaIngreso, `${p}-12-31`));
                const usados = usadosPor.get(`${empleadoId}|${p}`) || 0;
                // Solo se arrastra lo que quedó a favor: un saldo negativo de un
                // año no se convierte en deuda del siguiente.
                saldo = Math.max(0, corresponden + saldo - usados);
            }
            return saldo;
        };

        const activos = empleados.filter(e => e.estado_empleado === 'Activo');

        const filas = [];
        const sinFecha = [];
        for (const e of activos) {
            if (!e.fecha_ingreso) { sinFecha.push(`${e.apellido} ${e.nombre}`.trim()); continue; }
            const anios = antiguedadEn(e.fecha_ingreso, corte);
            // Quien no llega al año va por el proporcional del art. 153 (un día
            // cada 20 hábiles) en vez de los 14 de la escala.
            const proporcional = anios < 1;
            const dias = proporcional
                ? diasProporcionales(e.fecha_ingreso, corte)
                : diasPorAntiguedad(anios);
            // Quien cambia de tramo este año: es el dato que sorprende, porque
            // hoy le tocan menos días que los que va a tener en diciembre.
            const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
            const aniosHoy = antiguedadEn(e.fecha_ingreso, hoy);
            const diasHoy = aniosHoy < 1
                ? diasProporcionales(e.fecha_ingreso, hoy)
                : diasPorAntiguedad(aniosHoy);
            const usados = usadosPor.get(`${e.id}|${anio}`) || 0;
            const arrastre = arrastreDe(e.id, e.fecha_ingreso);

            filas.push({
                employee_id: e.id,
                legajo: e.legajo,
                nombre: `${e.apellido} ${e.nombre}`.trim(),
                fecha_ingreso: e.fecha_ingreso,
                servicio: e.servicio_id ? (nombreServicio.get(e.servicio_id) || null) : null,
                anios,
                dias,
                // La pantalla necesita saber que este número no salió de la
                // escala sino del art. 153: se explica distinto.
                proporcional,
                dias_habiles: proporcional ? diasHabilesEntre(e.fecha_ingreso, corte) : null,
                usados,
                arrastre,
                // Puede dar negativo si se cargó de más. Se devuelve tal cual:
                // forzarlo a cero escondería un error de carga.
                saldo: dias + arrastre - usados,
                sube_este_anio: dias !== diasHoy,
            });
        }

        filas.sort((a, b) => b.anios - a.anios || a.nombre.localeCompare(b.nombre));

        // Los de la escala se agrupan por su tramo (14/21/28/35). Los
        // proporcionales NO: cada uno tiene su propio número (3, 6, 9, 13…) y
        // agruparlos por día llenaría el resumen de tramos de una persona.
        // Van juntos bajo la clave 'proporcional'.
        const porTramo = {};
        let proporcionales = 0;
        let diasProporcionalesTotal = 0;
        for (const f of filas) {
            if (f.proporcional) {
                proporcionales++;
                diasProporcionalesTotal += f.dias;
            } else {
                porTramo[f.dias] = (porTramo[f.dias] || 0) + 1;
            }
        }

        return Response.json({
            anio,
            corte,
            activos: activos.length,
            sinFecha,
            porTramo,
            proporcionales,
            diasProporcionalesTotal,
            filas,
        });
    } catch (error) {
        console.error('Error calculando vacaciones:', error);
        // El mensaje real va a la pantalla: "no se pudieron calcular" no le decía
        // a nadie que faltaba correr la migración.
        return Response.json(
            { error: `No se pudieron calcular las vacaciones: ${error.message || 'error desconocido'}` },
            { status: 500 }
        );
    }
}
