-- Cada cuántos meses se renueva cada prenda.
--
-- Con las entregas a nombre de cada operario (desde el 19/10) se sabe qué tiene
-- cada uno y desde cuándo. Con el plazo de la prenda se calcula cuándo le toca
-- uniforme nuevo: última entrega + meses_renovacion.
--
-- NULL = esa prenda no se renueva (o todavía no se cargó el plazo). Arranca
-- vacío a propósito: los plazos los define el usuario.
--
-- Va por fila (prenda + talle) porque así está el catálogo, pero se carga igual
-- para todos los talles de una prenda: el plazo es de la camisa, no del talle L.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

ALTER TABLE uniformes_prendas
    ADD COLUMN IF NOT EXISTS meses_renovacion INTEGER
        CHECK (meses_renovacion IS NULL OR meses_renovacion > 0);
