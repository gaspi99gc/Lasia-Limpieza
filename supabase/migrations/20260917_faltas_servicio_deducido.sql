-- De donde salio el servicio de cada falta.
--
-- La hoja AUSENTES del presentismo NO trae el servicio: solo fecha, persona y
-- horas. Pero la hoja PRESENTISMO si dice donde trabajo cada uno cada dia, asi
-- que el servicio de una falta se puede deducir mirando donde venia trabajando
-- esa persona los dias cercanos.
--
-- Eso no es lo mismo que un dato registrado, y la diferencia hay que poder
-- rastrearla despues: si un servicio aparece con mucho ausentismo, conviene
-- saber si es porque se midio o porque se dedujo.
--
--   'registrado' -> lo cargo Operaciones desde la pantalla, sale del operativo
--                   de ese dia. Es el dato bueno.
--   'deducido'   -> se infirio del presentismo. La confianza dice que tan
--                   solido: 'alta' si la persona trabajaba en un solo servicio
--                   esos dias, 'media' si rotaba entre varios.
--
-- La pantalla los muestra juntos (decision del usuario); esto queda para poder
-- auditar un numero raro sin tener que rehacer el analisis.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

ALTER TABLE faltas
    ADD COLUMN IF NOT EXISTS servicio_fuente TEXT
        CHECK (servicio_fuente IN ('registrado', 'deducido')),
    ADD COLUMN IF NOT EXISTS servicio_confianza TEXT
        CHECK (servicio_confianza IN ('alta', 'media'));

-- Lo que ya tiene servicio vino del operativo al cargarse: eso es registrado.
UPDATE faltas
   SET servicio_fuente = 'registrado'
 WHERE service_id IS NOT NULL
   AND servicio_fuente IS NULL;
