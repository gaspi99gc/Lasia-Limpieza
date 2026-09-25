import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';

// Altas de cuenta bancaria para los operarios nuevos.
//
// Todos los meses hay que mandarle al banco un Excel con quienes entraron, para
// que les abran la cuenta donde cobran. El archivo se armaba a mano y el trabajo
// no era llenarlo sino ACORDARSE de a quien ya se habia mandado.
//
// El criterio real no es "los que entraron este mes": en el envio de agosto, de
// 63 ingresos de julio se mandaron 21 porque los otros 42 ya se habian ido.
// Entonces la lista es: activos, que todavia no fueron enviados.

const ROLES = ['admin', 'rrhh'];

const PAGE = 1000;
async function traerTodo(construirQuery) {
    const todo = [];
    for (let desde = 0; ; desde += PAGE) {
        const { data, error } = await construirQuery().range(desde, desde + PAGE - 1);
        if (error) throw error;
        todo.push(...(data || []));
        if (!data || data.length < PAGE) break;
    }
    return todo;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET: quienes faltan mandar al banco.
 *
 * Devuelve tambien que datos les faltan, porque el banco rechaza el alta si
 * viene incompleta y es mejor verlo antes de generar el archivo que despues.
 */
export async function GET(req) {
    const denied = await denyUnlessRole(req, ROLES);
    if (denied) return denied;

    try {
        const empleados = await traerTodo(() =>
            supabase
                .from('employees')
                .select('id, legajo, nombre, apellido, cuil, dni, celular, fecha_ingreso, fecha_nacimiento, fecha_baja, alta_banco_enviada_at')
                .order('fecha_ingreso', { ascending: true })
        );

        const pendientes = empleados
            .filter((e) => !e.alta_banco_enviada_at && !e.fecha_baja)
            .map((e) => ({
                ...e,
                // Lo que el banco necesita si o si. La fecha de nacimiento no
                // entra: en los envios anteriores se mandaba con "-" cuando no
                // se sabia, asi que no frena el alta.
                //
                // El telefono se revisa ademas de que exista: hay cargados como
                // "W.1125774175/LL.1124741102" (whatsapp y linea juntos) o con
                // menos digitos de los que corresponden, y asi salen tal cual en
                // el archivo. No se limpian solos porque no hay forma de saber
                // cual de los dos numeros queda; se avisa para corregirlo en el
                // legajo.
                faltan: [
                    !e.cuil && 'CUIL',
                    !e.celular ? 'teléfono' : (String(e.celular).replace(/\D/g, '').length < 10 || /\D/.test(String(e.celular))) && 'revisar teléfono',
                ].filter(Boolean),
            }));

        // Cuando fue el ultimo envio, para poder decir "faltan N desde el 26/08".
        const enviados = empleados.filter((e) => e.alta_banco_enviada_at);
        const ultimoEnvio = enviados.length
            ? enviados.map((e) => e.alta_banco_enviada_at).sort().at(-1)
            : null;

        return Response.json({
            pendientes,
            ultimoEnvio,
            totalEnviados: enviados.length,
        });
    } catch (error) {
        console.error('Error listando altas de banco:', error);
        return Response.json({ error: 'No se pudo cargar la lista.' }, { status: 500 });
    }
}

/**
 * POST: marcar como enviados.
 *
 * Se llama DESPUES de bajar el Excel, no antes: si se marcara al generar y el
 * archivo no se llegara a mandar, esa gente quedaria sin alta y sin aparecer
 * en la lista de pendientes, que es la peor combinacion.
 */
export async function POST(req) {
    const denied = await denyUnlessRole(req, ROLES);
    if (denied) return denied;

    try {
        const { ids, fecha } = await req.json();

        if (!Array.isArray(ids) || !ids.length) {
            return Response.json({ error: 'No hay a quién marcar.' }, { status: 400 });
        }
        if (fecha && !DATE_RE.test(fecha)) {
            return Response.json({ error: 'La fecha tiene que ser YYYY-MM-DD.' }, { status: 400 });
        }

        const cuando = fecha || new Date().toISOString().slice(0, 10);
        const numericos = ids.map(Number).filter(Number.isFinite);
        if (!numericos.length) {
            return Response.json({ error: 'Los ids no son válidos.' }, { status: 400 });
        }

        // Solo se marcan los que NO tenian fecha: si alguien ya fue enviado en
        // una tanda anterior, se respeta esa fecha y no se pisa con la de hoy.
        const { data, error } = await supabase
            .from('employees')
            .update({ alta_banco_enviada_at: cuando })
            .in('id', numericos)
            .is('alta_banco_enviada_at', null)
            .select('id');

        if (error) throw error;

        return Response.json({ marcados: data?.length || 0, fecha: cuando });
    } catch (error) {
        console.error('Error marcando altas de banco:', error);
        return Response.json({ error: 'No se pudo marcar el envío.' }, { status: 500 });
    }
}

/**
 * DELETE: deshacer un envio.
 *
 * Por si se marca por error o el banco rechaza la tanda entera: sin esto habria
 * que tocar la base a mano.
 */
export async function DELETE(req) {
    const denied = await denyUnlessRole(req, ROLES);
    if (denied) return denied;

    try {
        const { searchParams } = new URL(req.url);
        const id = Number(searchParams.get('id'));
        if (!Number.isFinite(id)) {
            return Response.json({ error: 'Falta el id.' }, { status: 400 });
        }

        const { error } = await supabase
            .from('employees')
            .update({ alta_banco_enviada_at: null })
            .eq('id', id);

        if (error) throw error;
        return Response.json({ ok: true });
    } catch (error) {
        console.error('Error deshaciendo alta de banco:', error);
        return Response.json({ error: 'No se pudo deshacer.' }, { status: 500 });
    }
}
