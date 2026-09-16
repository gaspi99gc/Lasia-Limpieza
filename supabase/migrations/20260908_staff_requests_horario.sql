-- Horario concreto en las solicitudes de personal.
--
-- Hasta ahora solo se pedia el TIPO de jornada (completa 8h / media 4h / turno).
-- Pero muchos pedidos no son los clasicos, y ademas para RRHH no es lo mismo
-- buscar a alguien "de 8 horas" que "de 6 a 14": el horario es justamente lo que
-- define si a la persona le sirve el puesto.
--
-- Correr en: Supabase Dashboard -> SQL Editor. Es idempotente.

ALTER TABLE staff_requests
    ADD COLUMN IF NOT EXISTS hora_desde TIME,
    ADD COLUMN IF NOT EXISTS hora_hasta TIME;
