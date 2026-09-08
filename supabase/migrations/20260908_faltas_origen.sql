-- Distinguir las faltas que registra Operaciones en el momento de las que se
-- importaron del historico (hoja AUSENTES del PRESENTISMO).
--
-- No son lo mismo: las historicas solo traen fecha, persona y horas. NO tienen
-- servicio ni turno, asi que no sirven para el ranking por servicio. Sin esta
-- marca, los reportes mezclarian ocho meses de historia con lo de hoy.
--
-- Correr en: Supabase Dashboard -> SQL Editor. Es idempotente.

ALTER TABLE faltas
    ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'app';

CREATE INDEX IF NOT EXISTS idx_faltas_origen ON faltas(origen);
