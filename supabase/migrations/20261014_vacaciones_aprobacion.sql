-- Aprobación de vacaciones por la jefa operativa.
--
-- El circuito real es: RRHH carga, y después la jefa operativa aprueba, rechaza
-- o mueve la fecha (por la cobertura del servicio). Hasta ahora la carga de
-- RRHH quedaba firme apenas se guardaba.
--
-- Solo los días TOMADOS pasan por la jefa: son una ausencia que hay que cubrir.
-- Los cobrados y los ajustes nacen aprobados, no hay nada operativo que decidir.
--
-- Un pendiente DESCUENTA del saldo igual que uno aprobado: funciona como una
-- reserva, así no se le cargan dos veces los mismos días a nadie mientras se
-- espera la respuesta (decisión del usuario). El rechazado deja de contar.
--
-- Rechazar NO es anular: anular es "me equivoqué al cargar", rechazar es "la
-- jefa dijo que no". Se guardan distinto para poder contar cada cosa.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

ALTER TABLE vacaciones_movimientos
    -- El DEFAULT deja como aprobado todo lo que ya estaba cargado.
    ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'aprobado',
    ADD COLUMN IF NOT EXISTS resuelto_por TEXT,
    ADD COLUMN IF NOT EXISTS resuelto_at TIMESTAMPTZ,
    -- El motivo del rechazo, o un comentario opcional al aprobar/mover.
    ADD COLUMN IF NOT EXISTS resuelto_nota TEXT,
    -- La fecha que había cargado RRHH, si la jefa la movió. Se completa una
    -- sola vez y no se pisa.
    ADD COLUMN IF NOT EXISTS fecha_desde_original DATE,
    -- La segunda opción de quincena que pidió el operario. La jefa puede
    -- aprobar cualquiera de las dos: no todos salen cuando lo pidieron. Solo la
    -- primera reserva fechas; la segunda se controla recién si se aprueba.
    ADD COLUMN IF NOT EXISTS fecha_desde_opcion2 DATE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vacaciones_movimientos_estado_check'
    ) THEN
        ALTER TABLE vacaciones_movimientos
            ADD CONSTRAINT vacaciones_movimientos_estado_check
            CHECK (estado IN ('pendiente', 'aprobado', 'rechazado'));
    END IF;
END $$;

-- La bandeja de la jefa consulta siempre los pendientes vigentes.
CREATE INDEX IF NOT EXISTS idx_vac_mov_pendientes
    ON vacaciones_movimientos(fecha_desde)
    WHERE estado = 'pendiente' AND anulado_at IS NULL;
