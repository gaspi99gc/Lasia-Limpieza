// Calculos del stock de uniformes.
//
// El stock NO se guarda en ningun lado: se deriva del libro de movimientos. Todo
// el modulo calcula desde aca para que el numero de una pantalla no pueda
// contradecir al de otra.
//
// Framework-free a proposito, igual que operativo-import.js: se usa desde las
// rutas de API y desde scripts sueltos.

export const TIPOS = ['compra', 'entrega', 'devolucion', 'descarte', 'ajuste'];

// Dos estados. El lavadero NO es uno: se manda a lavar y a los dos dias vuelve
// al armario, asi que modelarlo obligaria a cargar cuatro movimientos cada dos
// dias para algo que se resuelve solo. Lo que esta lavandose cuenta como usado.
export const ESTADOS = ['nuevo', 'usado'];

// Los talles se guardan como texto, asi que ordenarlos alfabeticamente da
// "L M S XL XXL" en vez de "S M L XL XXL". Y los numericos (calzado) tienen que
// ir por numero, no por texto, o el 9 caeria despues del 46.
const ORDEN_TALLE = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

export function compararTalles(a, b) {
    const na = Number(a);
    const nb = Number(b);
    const aNum = Number.isFinite(na);
    const bNum = Number.isFinite(nb);
    if (aNum && bNum) return na - nb;          // 38 antes que 39
    if (aNum !== bNum) return aNum ? 1 : -1;   // las letras primero

    const ia = ORDEN_TALLE.indexOf(String(a).toUpperCase());
    const ib = ORDEN_TALLE.indexOf(String(b).toUpperCase());
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return String(a).localeCompare(String(b));
}

// Quien ve y quien carga. El corte real va en el servidor, no escondiendo
// botones. Los supervisores NO entran: son a quien se asigna el uniforme, no
// quienes lo cargan (decision del usuario).
export const ROLES_LECTURA = ['admin', 'rrhh', 'direccion'];
export const ROLES_ESCRITURA = ['admin', 'rrhh'];
// El precio y los supuestos de la proyeccion los edita el jefe: son sus numeros.
export const ROLES_PRECIO = ['admin', 'rrhh', 'direccion'];

// Movimientos que suman al deposito y los que restan. El signo lo decide el
// tipo, nunca un campo aparte que pueda quedar incoherente con el tipo.
const SUMAN_AL_DEPOSITO = new Set(['compra', 'devolucion']);
const RESTAN_DEL_DEPOSITO = new Set(['entrega', 'descarte']);

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/** Solo los movimientos vigentes: los anulados no cuentan para nada. */
export function soloVigentes(movimientos) {
    return (movimientos || []).filter((m) => !m.anulado_at);
}

/**
 * Stock en el armario, por prenda y estado.
 *
 * Devuelve Map(prenda_id -> { nuevo, usado, total }).
 *
 * Lo que esta en el lavadero cuenta como usado: vuelve al armario en dos dias,
 * asi que no vale la pena sacarlo y volverlo a meter a mano cada vez.
 *
 * El ajuste suma con su signo (una correccion de inventario puede ser para
 * abajo). Los demas tipos traen cantidad positiva y el tipo dice para donde va.
 */
export function calcularStock(movimientos) {
    const porPrenda = new Map();
    const vacio = () => ({ nuevo: 0, usado: 0, total: 0 });

    for (const m of soloVigentes(movimientos)) {
        const id = m.prenda_id;
        if (!porPrenda.has(id)) porPrenda.set(id, vacio());
        const acc = porPrenda.get(id);
        const cant = num(m.cantidad);
        const estado = ESTADOS.includes(m.estado) ? m.estado : 'nuevo';

        if (m.tipo === 'ajuste') acc[estado] += cant;              // ya trae signo
        else if (SUMAN_AL_DEPOSITO.has(m.tipo)) acc[estado] += Math.abs(cant);
        else if (RESTAN_DEL_DEPOSITO.has(m.tipo)) acc[estado] -= Math.abs(cant);
    }

    for (const acc of porPrenda.values()) acc.total = acc.nuevo + acc.usado;
    return porPrenda;
}

/**
 * Lo que esta en la calle, por supervisor y prenda.
 *
 * enRotacion = entregas - devoluciones. Sin distinguir nuevo/usado: en la calle
 * una prenda es una prenda. El estado importa para el deposito y el gasto.
 *
 * Devuelve { porSupervisor: Map(supervisor_id|null -> Map(prenda_id -> n)),
 *            porPrenda: Map(prenda_id -> n) }.
 *
 * Los movimientos sin supervisor quedan bajo la clave null y se muestran como
 * "Sin asignar": un balde visible de "no se de quien es" es mucho mejor que uno
 * escondido que descuadra el total.
 */
export function calcularEnRotacion(movimientos) {
    const porSupervisor = new Map();
    const porPrenda = new Map();

    for (const m of soloVigentes(movimientos)) {
        if (m.tipo !== 'entrega' && m.tipo !== 'devolucion') continue;
        const signo = m.tipo === 'entrega' ? 1 : -1;
        const cant = Math.abs(num(m.cantidad)) * signo;
        const sup = m.supervisor_id ?? null;

        if (!porSupervisor.has(sup)) porSupervisor.set(sup, new Map());
        const mapa = porSupervisor.get(sup);
        mapa.set(m.prenda_id, (mapa.get(m.prenda_id) || 0) + cant);
        porPrenda.set(m.prenda_id, (porPrenda.get(m.prenda_id) || 0) + cant);
    }

    return { porSupervisor, porPrenda };
}

const mesDe = (fecha) => String(fecha || '').slice(0, 7);

/**
 * Gasto REAL. Es una medicion, no una estimacion.
 *
 * Usa el precio congelado del movimiento y no el precio actual de la prenda: el
 * gasto de marzo no cambia porque hoy se corrigio un precio.
 *
 * Tres numeros distintos que no hay que mezclar:
 *   compra  = lo que efectivamente salio de la caja (hubo una factura).
 *   entrega = el costo de vestir gente, contando SOLO las prendas nuevas.
 *   ahorroReuso = lo que habria costado si esas usadas hubieran sido nuevas.
 *
 * Que la entrega cuente solo 'nuevo' es toda la idea del stock separado:
 * entregar una usada ya se pago cuando se compro. Contarla de nuevo inflaria el
 * gasto y castigaria contablemente el reuso, que es justo lo que se quiere
 * premiar.
 */
export function calcularGastoReal(movimientos) {
    const porMes = new Map();
    const fila = () => ({ compra: 0, entrega: 0, ahorroReuso: 0 });

    for (const m of soloVigentes(movimientos)) {
        const mes = mesDe(m.fecha);
        if (!mes) continue;
        const importe = Math.abs(num(m.cantidad)) * num(m.precio_unitario);
        if (!porMes.has(mes)) porMes.set(mes, fila());
        const acc = porMes.get(mes);

        if (m.tipo === 'compra') acc.compra += importe;
        else if (m.tipo === 'entrega') {
            if (m.estado === 'usado') acc.ahorroReuso += importe;
            else acc.entrega += importe;
        }
    }

    const meses = [...porMes.keys()].sort();
    return {
        porMes: meses.map((mes) => ({ mes, ...porMes.get(mes) })),
        total: meses.reduce(
            (a, mes) => {
                const f = porMes.get(mes);
                return {
                    compra: a.compra + f.compra,
                    entrega: a.entrega + f.entrega,
                    ahorroReuso: a.ahorroReuso + f.ahorroReuso,
                };
            },
            fila()
        ),
    };
}

/**
 * Cuanto de lo entregado volvio, medido sobre los ultimos N dias.
 *
 * Es el numero que valida (o desmiente) el supuesto de recupero que carga el
 * jefe. Si todavia no hay entregas en el periodo devuelve null y la pantalla
 * muestra "todavia no hay datos": un 0% aca parece una medicion y no lo es.
 */
export function calcularRecuperoReal(movimientos, dias = 90) {
    const corte = new Date();
    corte.setUTCDate(corte.getUTCDate() - dias);
    const desde = corte.toISOString().slice(0, 10);

    let entregado = 0;
    let devuelto = 0;
    for (const m of soloVigentes(movimientos)) {
        if (String(m.fecha || '') < desde) continue;
        if (m.tipo === 'entrega') entregado += Math.abs(num(m.cantidad));
        else if (m.tipo === 'devolucion') devuelto += Math.abs(num(m.cantidad));
    }

    if (entregado === 0) return { pct: null, entregado, devuelto, dias };
    return { pct: (devuelto / entregado) * 100, entregado, devuelto, dias };
}

/**
 * Gasto ESPERADO. Es una estimacion y la pantalla tiene que decirlo.
 *
 *   costoEquipo = suma del precio de un juego completo (una prenda de cada tipo,
 *                 por sus unidades_por_operario).
 *
 *   porIngresos = ingresos esperados x costoEquipo x (1 - recupero)
 *                 Los ingresos del mes no necesitan equipos nuevos si vuelve
 *                 algo: ese factor es el unico lugar donde el circuito de
 *                 devolucion mueve la aguja de la proyeccion.
 *
 *   porDesgaste = valor de lo que esta en la calle x perdida anual / 12
 *                 Lo que se rompe o se pierde aunque la persona siga trabajando.
 */
export function calcularGastoEstimado({ prendas, enRotacionPorPrenda, parametros }) {
    const activas = (prendas || []).filter((p) => p.activo);
    const costoEquipo = activas.reduce(
        (a, p) => a + num(p.precio) * Math.max(1, num(p.unidades_por_operario) || 1),
        0
    );

    const ingresos = num(parametros?.ingresos_mes_esperados);
    const pctRecupero = Math.min(100, Math.max(0, num(parametros?.pct_recupero_uniforme)));
    const pctPerdida = Math.min(100, Math.max(0, num(parametros?.pct_perdida_uso)));

    const porIngresos = ingresos * costoEquipo * (1 - pctRecupero / 100);

    let valorEnCalle = 0;
    for (const p of activas) {
        const enCalle = Math.max(0, num(enRotacionPorPrenda?.get?.(p.id)));
        valorEnCalle += enCalle * num(p.precio);
    }
    const porDesgaste = (valorEnCalle * (pctPerdida / 100)) / 12;

    const mensual = porIngresos + porDesgaste;
    return {
        costoEquipo,
        mensual,
        anual: mensual * 12,
        componentes: { porIngresos, porDesgaste, valorEnCalle },
        parametros: {
            ingresos_mes_esperados: ingresos,
            pct_recupero_uniforme: pctRecupero,
            pct_perdida_uso: pctPerdida,
        },
    };
}

/** Supabase corta en 1000 filas por consulta. */
export async function traerTodo(buildQuery, pageSize = 1000) {
    const filas = [];
    for (let desde = 0; ; desde += pageSize) {
        const { data, error } = await buildQuery().range(desde, desde + pageSize - 1);
        if (error) throw new Error(error.message);
        filas.push(...(data || []));
        if (!data || data.length < pageSize) return filas;
    }
}
