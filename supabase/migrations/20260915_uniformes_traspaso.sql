-- Traspaso de uniformes entre supervisores.
--
-- Los supervisores cambian de servicio de vez en cuando, y el uniforme que
-- entregaron sigue figurando a su nombre aunque a esa gente ya la vea otro. Con
-- 157 servicios repartidos entre 6 supervisores, eso pasa seguido y el saldo
-- quedaba pegado al que ya no corresponde.
--
-- El traspaso NO mueve mercaderia: el uniforme lo tiene puesto el operario y no
-- vuelve al armario (confirmado con el usuario). Solo cambia de quien es la
-- responsabilidad. Por eso se arma con los movimientos que ya existen —una
-- devolucion del que entrega y una entrega al que recibe, con la misma fecha—,
-- sin un tipo nuevo: el stock del armario queda intacto porque las dos se
-- cancelan entre si.
--
-- Esta columna ata las dos mitades para poder mostrarlas como una sola cosa en
-- el historial, y para poder anular el traspaso completo en vez de media parte.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

ALTER TABLE uniformes_movimientos
    ADD COLUMN IF NOT EXISTS traspaso_id TEXT;

CREATE INDEX IF NOT EXISTS idx_uniformes_mov_traspaso
    ON uniformes_movimientos(traspaso_id) WHERE traspaso_id IS NOT NULL;
