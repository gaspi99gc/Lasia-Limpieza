-- Borrar una falta pasa a ser ANULARLA: sale de la lista igual que antes, pero
-- la fila queda guardada con quien la anulo y cuando.
--
-- El motivo: si editar deja rastro pero borrar no, el que quiera tapar un error
-- simplemente borra. El freno no es que se vea todo el tiempo (eso se siente
-- vigilancia), es que se sepa que queda guardado.
--
-- Beneficio de paso: una falta borrada por error se puede recuperar, antes se
-- perdia y habia que reconstruirla de memoria.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

ALTER TABLE faltas
    ADD COLUMN IF NOT EXISTS anulada_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS anulada_por TEXT;

-- Las consultas del dia filtran por anulada_at IS NULL, asi que conviene el indice.
CREATE INDEX IF NOT EXISTS idx_faltas_anulada ON faltas(anulada_at);

-- La restriccion UNIQUE original (fecha, employee_id, puesto_id) impediria volver
-- a cargar una falta que se anulo por error. Se reemplaza por una parcial, que
-- solo aplica a las faltas vigentes.
ALTER TABLE faltas DROP CONSTRAINT IF EXISTS faltas_fecha_employee_id_puesto_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_faltas_unica_vigente
    ON faltas (fecha, employee_id, puesto_id)
    WHERE anulada_at IS NULL;
