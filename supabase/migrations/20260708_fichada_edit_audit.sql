-- Auditoría de edición de fichadas: guardamos la hora original del evento y
-- quién/cuándo lo editó. Operaciones/admin pueden corregir la hora de una
-- fichada desde el informe; este rastro deja trazabilidad del cambio.

ALTER TABLE supervisor_presentismo_logs
    ADD COLUMN IF NOT EXISTS original_occurred_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS edited_by TEXT;

-- La app accede con la service role key.
GRANT ALL ON TABLE supervisor_presentismo_logs TO service_role;
