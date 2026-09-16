import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import {
    ROLES_LECTURA,
    ROLES_ESCRITURA,
    calcularStock,
    calcularEnRotacion,
    compararTalles,
    traerTodo,
} from '@/lib/uniformes';

// Catalogo de uniformes (prenda + talle) con su stock derivado.
//
// El GET devuelve todo lo que necesita la pantalla principal en un solo request:
// catalogo, stock nuevo/usado y cuanto hay en la calle. El stock no se guarda en
// ninguna columna, se calcula sumando el libro de movimientos.

const TALLE_DEFAULT = 'Único';

const limpiar = (v) => (typeof v === 'string' ? v.trim() : '') || null;

function normalizarPrecio(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100) / 100;
}

function enteroNoNegativo(v, porDefecto = 0) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : porDefecto;
}

export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES_LECTURA);
    if (denied) return denied;

    try {
        const [prendas, movimientos] = await Promise.all([
            traerTodo(() =>
                supabase.from('uniformes_prendas').select('*').order('prenda').order('talle')
            ),
            traerTodo(() =>
                supabase
                    .from('uniformes_movimientos')
                    .select('prenda_id, tipo, estado, cantidad, supervisor_id, anulado_at')
                    .order('id')
            ),
        ]);

        const stock = calcularStock(movimientos);
        const { porPrenda: enRotacion } = calcularEnRotacion(movimientos);

        const filas = prendas.map((p) => {
            const s = stock.get(p.id) || { nuevo: 0, usado: 0, total: 0 };
            return {
                ...p,
                stock_nuevo: s.nuevo,
                stock_usado: s.usado,
                stock_total: s.total,
                en_rotacion: enRotacion.get(p.id) || 0,
                // Debajo del minimo hay que comprar. Es el unico dato de esta
                // pantalla sobre el que se puede actuar.
                falta: p.activo && s.total < Number(p.stock_minimo || 0),
            };
        });

        // Los talles se ordenan acá y no en la consulta: la base los guarda como
        // texto y devolvería "L M S XL XXL", o el 9 después del 46 en calzado.
        filas.sort((a, b) => a.prenda.localeCompare(b.prenda) || compararTalles(a.talle, b.talle));

        return Response.json(filas);
    } catch (error) {
        console.error('Error listando uniformes:', error);
        return Response.json({ error: 'No se pudo cargar el catálogo de uniformes.' }, { status: 500 });
    }
}

// Alta. Acepta un talle o varios de una vez: cargar "Camisa" con S/M/L/XL en un
// solo paso evita cuatro altas iguales a mano.
export async function POST(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const body = await request.json();
        const prenda = limpiar(body?.prenda);
        if (!prenda) {
            return Response.json({ error: 'Poné el nombre de la prenda.' }, { status: 400 });
        }

        const talles = Array.isArray(body?.talles) && body.talles.length
            ? [...new Set(body.talles.map(limpiar).filter(Boolean))]
            : [limpiar(body?.talle) || TALLE_DEFAULT];

        const base = {
            prenda,
            precio: normalizarPrecio(body?.precio),
            unidades_por_operario: Math.max(1, enteroNoNegativo(body?.unidades_por_operario, 1)),
            stock_minimo: enteroNoNegativo(body?.stock_minimo, 0),
            activo: body?.activo !== false,
        };

        const { data, error } = await supabase
            .from('uniformes_prendas')
            .insert(talles.map((talle) => ({ ...base, talle })))
            .select();

        if (error) {
            // 23505 = choca con UNIQUE (prenda, talle).
            if (error.code === '23505') {
                return Response.json(
                    { error: `Ya existe "${prenda}" con alguno de esos talles.` },
                    { status: 409 }
                );
            }
            throw error;
        }

        return Response.json(data, { status: 201 });
    } catch (error) {
        console.error('Error creando prenda:', error);
        return Response.json({ error: 'No se pudo crear la prenda.' }, { status: 500 });
    }
}
