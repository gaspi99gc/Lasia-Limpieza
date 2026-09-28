-- Trabajos programados: los trabajos especiales que se acuerdan con el cliente
-- para una fecha (limpieza de vidrios, tanques, pisos).
--
-- Hoy se acuerdan y quedan en la cabeza de alguien o en un WhatsApp. El riesgo
-- no es no saber hacerlos: es llegar a la fecha sin haber conseguido a los 3
-- operarios, porque nadie se acordo con tiempo.
--
-- Esta tabla es la agenda. El aviso anticipado viene despues (sprint 3), y se
-- apoya en esto: sin la agenda no hay de que avisar.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

CREATE TABLE IF NOT EXISTS trabajos_programados (
    id BIGSERIAL PRIMARY KEY,

    -- services.id es INTEGER, no BIGINT. Declararlo mal hace que Postgres no
    -- cree NINGUNA tabla del bloque y el editor igual diga "Success".
    service_id INTEGER NOT NULL REFERENCES services(id),

    titulo TEXT NOT NULL,                 -- "Limpieza de vidrios"
    descripcion TEXT,

    fecha DATE NOT NULL,                  -- cuando se hace
    operarios_necesarios INTEGER NOT NULL DEFAULT 1 CHECK (operarios_necesarios > 0),

    --   pendiente  -> falta conseguir la gente
    --   coordinado -> alguien ya lo arreglo (deja de avisar)
    --   hecho      -> ya se hizo
    --   cancelado  -> no va mas, pero se conserva el registro
    estado TEXT NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'coordinado', 'hecho', 'cancelado')),

    -- Quien confirmo que lo coordino y cuando. Es la respuesta a "esto ya esta
    -- resuelto?", que es la pregunta que el aviso viene a contestar.
    coordinado_por TEXT,
    coordinado_at TIMESTAMPTZ,

    -- Autoria: sale de la sesion, nunca del cliente.
    creado_por TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    actualizado_por TEXT,
    updated_at TIMESTAMPTZ,

    -- Borrar es ANULAR, igual que en faltas, uniformes y vacaciones: un trabajo
    -- que se cargo y desaparecio deja a todos preguntandose si existio.
    anulado_at TIMESTAMPTZ,
    anulado_por TEXT,
    anulado_motivo TEXT
);

-- La consulta normal es "que viene en los proximos dias": por fecha y sin los
-- anulados.
CREATE INDEX IF NOT EXISTS idx_trabajos_fecha
    ON trabajos_programados (fecha) WHERE anulado_at IS NULL;

-- Para el listado por servicio y para el aviso, que necesita saber a que
-- supervisor le corresponde.
CREATE INDEX IF NOT EXISTS idx_trabajos_servicio
    ON trabajos_programados (service_id) WHERE anulado_at IS NULL;

-- Lo que el cron va a buscar en el sprint 3: lo que todavia no se coordino.
CREATE INDEX IF NOT EXISTS idx_trabajos_pendientes
    ON trabajos_programados (fecha)
    WHERE anulado_at IS NULL AND estado = 'pendiente';

ALTER TABLE trabajos_programados ENABLE ROW LEVEL SECURITY;
GRANT ALL ON trabajos_programados TO service_role;
GRANT USAGE, SELECT ON SEQUENCE trabajos_programados_id_seq TO service_role;
