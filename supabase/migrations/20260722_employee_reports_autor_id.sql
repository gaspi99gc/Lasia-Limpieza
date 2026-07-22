-- Guardar el id del autor del informe (app_user_id) para poder filtrar
-- "solo mis informes" de forma robusta (antes solo se guardaba el nombre).
ALTER TABLE employee_reports
    ADD COLUMN IF NOT EXISTS autor_id INTEGER;
