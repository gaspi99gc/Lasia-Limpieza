-- Historial de ediciones de las faltas.
--
-- Se pueden corregir el motivo, las horas y la nota (cargar mal algo pasa), pero
-- cada cambio queda asentado con quien lo hizo y cuando, y se muestra en la
-- pantalla a todos los que ven faltas. Sin eso, "editar" se convierte en la
-- funcion de tapar: se corrige un numero a ultimo momento y nadie se entera.
--
-- Una fila por campo cambiado, para poder mostrarlo como frase sin parsear JSON.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

CREATE TABLE IF NOT EXISTS faltas_historial (
    id BIGSERIAL PRIMARY KEY,
    -- Si la falta se borra, se lleva su historial: hoy el borrado es definitivo
    -- y no deja rastro (decision del usuario 2026-09-07).
    falta_id BIGINT NOT NULL REFERENCES faltas(id) ON DELETE CASCADE,
    campo TEXT NOT NULL CHECK (campo IN ('motivo', 'horas', 'nota')),
    valor_anterior TEXT,
    valor_nuevo TEXT,
    usuario TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faltas_historial_falta ON faltas_historial(falta_id);

ALTER TABLE faltas_historial ENABLE ROW LEVEL SECURITY;
GRANT ALL ON faltas_historial TO service_role;
GRANT USAGE, SELECT ON SEQUENCE faltas_historial_id_seq TO service_role;
