-- Trazabilidad de borrado en el calendario de RRHH: quién y cuándo eliminó un evento.
-- El borrado ya es soft-delete (columna eliminado); ahora guardamos también el autor.
ALTER TABLE hr_calendar_events
    ADD COLUMN IF NOT EXISTS eliminado_por_id TEXT,
    ADD COLUMN IF NOT EXISTS eliminado_por_nombre TEXT,
    ADD COLUMN IF NOT EXISTS eliminado_at TIMESTAMP;
