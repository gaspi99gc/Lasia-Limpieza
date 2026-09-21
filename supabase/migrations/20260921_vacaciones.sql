-- Saldo de vacaciones: cuantos dias uso cada uno y cuantos le quedan.
--
-- La pantalla ya dice cuantos dias CORRESPONDEN segun la antiguedad. Falta la
-- otra mitad: la mayoria se toma una o dos semanas y el resto queda pendiente
-- para mas adelante, o se cobra en efectivo. Hoy eso no se registra en ningun
-- lado, asi que "cuantos dias me quedan" se contesta sacando la cuenta a mano
-- contra la planilla.
--
-- Va en tabla propia y no como un tipo mas de licencia porque una licencia no
-- puede representar dias PAGADOS (no hay ausencia ni rango de fechas) ni decir a
-- que periodo se imputan, que es lo que hace falta para arrastrar saldo de un
-- año al otro.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

CREATE TABLE IF NOT EXISTS vacaciones_movimientos (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id),

    -- El año al que se imputan los dias. No es lo mismo que la fecha en que se
    -- toman: alguien puede tomarse en marzo de 2027 dias que corresponden al
    -- periodo 2026.
    periodo INTEGER NOT NULL,

    --   tomado -> se ausento esos dias.
    --   pagado -> cobro en efectivo, no se ausento. Descuenta igual del saldo
    --             (decision del usuario): son dias que ya no va a tomarse.
    --   ajuste -> correccion manual. Acepta negativo, es la via para los casos
    --             que no encajan en los otros dos.
    tipo TEXT NOT NULL CHECK (tipo IN ('tomado', 'pagado', 'ajuste')),

    cantidad INTEGER NOT NULL CHECK (cantidad <> 0),

    -- Obligatorias en 'tomado', nulas en 'pagado' (no hay ausencia que ubicar en
    -- el calendario). fecha_hasta la calcula el servidor: se carga la fecha de
    -- inicio y la cantidad de dias, no las dos puntas. Asi no se cuenta mal, que
    -- es lo que paso con las cargas viejas de 8, 15 y 4 dias.
    fecha_desde DATE,
    fecha_hasta DATE,

    nota TEXT,

    -- Quien lo cargo. Sale de la sesion, nunca del cliente.
    registrado_por TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),

    -- Borrar es ANULAR, igual que en faltas y uniformes. El saldo es un numero
    -- que alguien va a discutir, y tiene que poder reconstruirse.
    anulado_at TIMESTAMPTZ,
    anulado_por TEXT,
    anulado_motivo TEXT
);

CREATE INDEX IF NOT EXISTS idx_vac_mov_empleado ON vacaciones_movimientos(employee_id);
CREATE INDEX IF NOT EXISTS idx_vac_mov_periodo ON vacaciones_movimientos(periodo);
-- Casi toda consulta filtra los anulados.
CREATE INDEX IF NOT EXISTS idx_vac_mov_vigentes
    ON vacaciones_movimientos(employee_id, periodo) WHERE anulado_at IS NULL;

ALTER TABLE vacaciones_movimientos ENABLE ROW LEVEL SECURITY;
GRANT ALL ON vacaciones_movimientos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE vacaciones_movimientos_id_seq TO service_role;


-- NO se migran las vacaciones que ya existen como licencia.
--
-- En una version anterior de esta migracion se copiaban las 9 licencias de tipo
-- 'vacaciones' para que descontaran del saldo. Se saco a pedido del usuario: el
-- saldo arranca en CERO para todos y lo que se haya tomado antes se carga a mano
-- si corresponde.
--
-- El motivo es que esas licencias no son una fuente confiable de dias: estan
-- cargadas con las dos puntas elegidas a mano y hay periodos de 8, 15 y 4 dias
-- que no cuadran con semanas completas. Arrastrar eso al saldo seria empezar con
-- numeros que nadie puede defender.
--
-- Las licencias siguen existiendo y marcando la ausencia en el calendario, que
-- es para lo que sirven.
