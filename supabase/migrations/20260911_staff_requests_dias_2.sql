-- Dias propios para el segundo servicio de una solicitud de personal.
--
-- Pasa que la misma persona va al primer servicio toda la semana y al segundo
-- solo un par de dias. Hasta ahora los dias eran unicos para toda la solicitud,
-- asi que ese caso no se podia expresar y terminaba en las notas.
--
-- NULL significa "los mismos dias que el primer servicio", que es el caso
-- normal. Solo se guarda algo cuando de verdad son distintos: asi no hay que
-- mantener dos listas sincronizadas cuando coinciden, que es lo que pasaria si
-- se copiaran los dias al guardar.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

ALTER TABLE staff_requests
    ADD COLUMN IF NOT EXISTS dias_2 TEXT;
