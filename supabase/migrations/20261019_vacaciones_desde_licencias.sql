-- Las licencias de tipo "vacaciones" descuentan del saldo de vacaciones.
--
-- Las vacaciones se cargan en /vacaciones. La pestaña Licencias de RRHH se usa
-- para los días que quedaron pendientes y se toman sueltos. Hasta ahora esas
-- licencias no tocaban el saldo: la persona seguía figurando con los días
-- aunque ya se los hubiera tomado.
--
-- Desde esta migración, crear una licencia de vacaciones crea también el
-- movimiento 'tomado' en vacaciones_movimientos, y esta columna los une: si la
-- licencia se edita, el movimiento se actualiza; si se borra, se anula.
-- Las licencias cargadas antes NO se tocan (decisión del usuario).
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

ALTER TABLE vacaciones_movimientos
    ADD COLUMN IF NOT EXISTS licencia_id BIGINT;

-- Una licencia descuenta una sola vez: si el alta llega dos veces (doble
-- clic, reintento), el segundo movimiento no entra.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vac_mov_licencia
    ON vacaciones_movimientos(licencia_id)
    WHERE licencia_id IS NOT NULL AND anulado_at IS NULL;
