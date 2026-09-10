-- Stock de uniformes.
--
-- Direccion quiere saber cuanto uniforme hay, cuanto esta en la calle y cuanto
-- cuesta reponerlo. Hoy no se registra en ningun lado.
--
-- El problema de fondo es la rotacion: ~37 bajas por mes, y 50 de las bajas del
-- ultimo año duraron 2 dias o menos. Lo que se le entrega a alguien que dura dos
-- dias rara vez vuelve. Eso es plata que se va sin que nadie la mida.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.


-- Catalogo: una fila por PRENDA + TALLE.
--
-- "Camisa talle M" es una fila propia, no un atributo de "Camisa". El talle es
-- lo que hace que el stock sirva: tener 40 camisas no ayuda si son todas XXL y
-- el que entra usa M.
CREATE TABLE IF NOT EXISTS uniformes_prendas (
    id BIGSERIAL PRIMARY KEY,

    prenda TEXT NOT NULL,
    talle TEXT NOT NULL DEFAULT 'Único',

    -- Precio de la prenda NUEVA. Lo edita direccion. Entregar una usada no
    -- genera gasto nuevo, que es lo que hace honesta la cuenta.
    precio NUMERIC(12, 2) NOT NULL DEFAULT 0,

    -- Cuantas unidades de esta prenda lleva un equipo completo. Es el
    -- multiplicador del gasto esperado: si el equipo son 2 camisas, cada
    -- ingreso proyecta 2, no 1.
    unidades_por_operario INTEGER NOT NULL DEFAULT 1,

    -- Debajo de esto la pantalla lo marca en rojo. Es el unico numero que
    -- convierte el stock en una accion ("comprar esto").
    stock_minimo INTEGER NOT NULL DEFAULT 0,

    -- Desactivar en vez de borrar: una prenda con movimientos no se puede
    -- borrar sin romper el gasto de los meses pasados.
    activo BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE (prenda, talle)
);

CREATE INDEX IF NOT EXISTS idx_uniformes_prendas_activo ON uniformes_prendas(activo);


-- LIBRO DE MOVIMIENTOS. Es la fuente de verdad del stock.
--
-- No hay ninguna columna "stock" en ninguna tabla: el stock se calcula sumando
-- esta tabla. Con un saldo guardado, cuando el numero queda mal no hay forma de
-- saber en que momento se desvio ni quien lo toco. Con el libro, "por que hay 3
-- camisas M y no 5" se contesta leyendo hacia atras. Es el mismo criterio que en
-- faltas: anular en vez de borrar.
--
-- El volumen lo permite de sobra: ~350 operarios y ~37 bajas por mes son unos
-- 3.000-6.000 movimientos al año. Sumarlos es instantaneo.
CREATE TABLE IF NOT EXISTS uniformes_movimientos (
    id BIGSERIAL PRIMARY KEY,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,

    prenda_id BIGINT NOT NULL REFERENCES uniformes_prendas(id),

    -- Que paso. El signo lo decide el tipo, no se guarda aparte para que no
    -- pueda quedar incoherente:
    --   compra     -> entra al deposito
    --   entrega    -> sale del deposito, va a un supervisor
    --   devolucion -> vuelve de la calle al deposito
    --   descarte   -> sale del deposito y no vuelve (roto/perdido)
    --   ajuste     -> correccion de inventario fisico (acepta negativo)
    tipo TEXT NOT NULL CHECK (tipo IN ('compra', 'entrega', 'devolucion', 'descarte', 'ajuste')),

    -- Nuevo y usado son dos stocks separados: una prenda entregada nueva vuelve
    -- como devolucion en estado 'usado', asi el stock usado crece solo sin que
    -- nadie trasvase nada a mano.
    --
    -- El lavadero NO es un estado. Se manda a lavar y a los dos dias vuelve al
    -- armario: es un ida y vuelta, no un lugar donde el uniforme se queda.
    -- Modelarlo obligaria a cargar cuatro movimientos cada dos dias para algo
    -- que se resuelve solo, y esa friccion es lo que hace que se abandone la
    -- carga. Lo que esta lavandose sigue contando como usado en el armario.
    estado TEXT NOT NULL CHECK (estado IN ('nuevo', 'usado')),

    -- Siempre distinta de cero. El sentido lo pone el tipo; solo 'ajuste' usa
    -- negativos, porque una correccion de inventario puede ser para abajo.
    cantidad INTEGER NOT NULL CHECK (cantidad <> 0),

    -- A QUIEN. El uniforme se asigna al SUPERVISOR, que es el responsable de lo
    -- que tiene su gente porque los ve seguido (decision del jefe). Obligatorio
    -- en entrega y devolucion; null en compra, descarte y ajuste, que son
    -- movimientos de deposito. Lo valida la ruta.
    --
    -- INTEGER y no BIGINT: supervisors.id es INTEGER, y Postgres no deja crear
    -- una FK entre tipos distintos. Es la unica tabla del sistema que referencia
    -- a supervisors, por eso no se habia notado antes.
    supervisor_id INTEGER REFERENCES supervisors(id),

    -- Opcional y solo informativo: si RRHH sabe para quien es, lo anota. NUNCA
    -- se usa para calcular "en rotacion" (eso va por supervisor). Sirve para
    -- poder decir, en un reclamo, "esto se entrego para tal persona".
    employee_id BIGINT REFERENCES employees(id),
    para_nombre TEXT,

    -- Precio CONGELADO al momento del movimiento. El gasto de marzo no puede
    -- cambiar porque hoy se corrigio un precio: con inflacion, es la unica forma
    -- de que "lo que gastamos en marzo" siga siendo cierto en diciembre.
    precio_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0,

    nota TEXT,

    -- Quien lo cargo. Sale de la sesion, nunca del cliente.
    registrado_por TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),

    -- Anular en vez de borrar: si editar deja rastro y borrar no, el que quiera
    -- tapar un error simplemente borra. De paso, un movimiento anulado por error
    -- se puede recuperar.
    anulado_at TIMESTAMPTZ,
    anulado_por TEXT,
    anulado_motivo TEXT
);

CREATE INDEX IF NOT EXISTS idx_uniformes_mov_prenda ON uniformes_movimientos(prenda_id);
CREATE INDEX IF NOT EXISTS idx_uniformes_mov_fecha ON uniformes_movimientos(fecha);
CREATE INDEX IF NOT EXISTS idx_uniformes_mov_supervisor ON uniformes_movimientos(supervisor_id);
-- Casi toda consulta filtra los anulados.
CREATE INDEX IF NOT EXISTS idx_uniformes_mov_vigentes
    ON uniformes_movimientos(fecha) WHERE anulado_at IS NULL;


-- Cada cambio de precio queda asentado con quien y cuando.
--
-- El precio lo edita direccion y de ahi sale la proyeccion de gasto. Sin este
-- asiento, un precio corregido a mano y un aumento real del proveedor se ven
-- identicos en el grafico: no habria forma de explicar un salto.
--
-- No se usa para calcular: el gasto real usa el precio congelado del
-- movimiento. Esto es para poder contar la historia.
CREATE TABLE IF NOT EXISTS uniformes_precios_historial (
    id BIGSERIAL PRIMARY KEY,
    prenda_id BIGINT NOT NULL REFERENCES uniformes_prendas(id) ON DELETE CASCADE,
    precio_anterior NUMERIC(12, 2),
    precio_nuevo NUMERIC(12, 2) NOT NULL,
    usuario TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uniformes_precios_hist_prenda
    ON uniformes_precios_historial(prenda_id, created_at DESC);


-- Los supuestos de la PROYECCION de gasto, guardados y editables.
--
-- Van en una tabla y no en el codigo porque el jefe va a preguntar de donde sale
-- el numero, y "esta en el codigo" es la respuesta que hace que deje de creerle
-- a la pantalla. Aca los ve, los discute y los cambia.
--
-- Los defaults salen de datos MEDIDOS sobre 642 bajas: ~37 bajas por mes en los
-- ultimos 12 meses, y 50 de esas duraron 2 dias o menos.
CREATE TABLE IF NOT EXISTS uniformes_parametros (
    clave TEXT PRIMARY KEY,
    valor NUMERIC(12, 4) NOT NULL,
    descripcion TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by TEXT
);

-- DO NOTHING a proposito: si la migracion se corre dos veces, no pisa los
-- valores que el jefe ya haya ajustado.
INSERT INTO uniformes_parametros (clave, valor, descripcion) VALUES
    ('ingresos_mes_esperados', 37,
     'Ingresos de personal por mes. Cada uno necesita un equipo. Medido: ~37 bajas por mes en los ultimos 12 meses.'),
    ('pct_recupero_uniforme', 25,
     'De cada 100 uniformes entregados, cuantos vuelven en condiciones de reusar. Conviene empezar bajo: 50 de las bajas del ultimo año duraron 2 dias o menos y esas casi nunca devuelven.'),
    ('pct_perdida_uso', 15,
     'De cada 100 uniformes en la calle, cuantos se pierden o se rompen por año y hay que reponer aunque la persona siga trabajando.')
ON CONFLICT (clave) DO NOTHING;


ALTER TABLE uniformes_prendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE uniformes_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE uniformes_precios_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE uniformes_parametros ENABLE ROW LEVEL SECURITY;

GRANT ALL ON uniformes_prendas TO service_role;
GRANT ALL ON uniformes_movimientos TO service_role;
GRANT ALL ON uniformes_precios_historial TO service_role;
GRANT ALL ON uniformes_parametros TO service_role;

GRANT USAGE, SELECT ON SEQUENCE uniformes_prendas_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE uniformes_movimientos_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE uniformes_precios_historial_id_seq TO service_role;
-- uniformes_parametros tiene PK de texto: no lleva secuencia.
