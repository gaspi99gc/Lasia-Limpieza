-- Sexo en las solicitudes de personal (2026-11-26).
--
-- La jefa operativa elige si el puesto es para un hombre, una mujer o
-- indistinto. Las solicitudes que ya estaban quedan en 'indistinto', que es lo
-- que eran: nadie había pedido un sexo.
--
-- Correr en: Supabase Dashboard -> SQL Editor. Es idempotente.

ALTER TABLE staff_requests
    ADD COLUMN IF NOT EXISTS sexo TEXT NOT NULL DEFAULT 'indistinto';

ALTER TABLE staff_requests DROP CONSTRAINT IF EXISTS staff_requests_sexo_check;
ALTER TABLE staff_requests
    ADD CONSTRAINT staff_requests_sexo_check CHECK (sexo IN ('hombre', 'mujer', 'indistinto'));
