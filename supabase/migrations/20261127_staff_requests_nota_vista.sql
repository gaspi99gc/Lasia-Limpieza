-- "Nota nueva" en las solicitudes de personal (2026-11-27).
--
-- RRHH ve la etiqueta "Nota nueva" hasta que abre la nota. Al abrirla se guarda
-- cuándo y quién. Si la jefa operativa cambia la nota, se vacían las dos y la
-- etiqueta vuelve a aparecer.
--
-- Correr en: Supabase Dashboard -> SQL Editor. Es idempotente.

ALTER TABLE staff_requests
    ADD COLUMN IF NOT EXISTS nota_vista_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS nota_vista_por TEXT;
