-- Informe "cambio de servicio": guarda de qué servicio a qué servicio se movió el operario.
-- Solo aplica a los informes con categoria='cambio_servicio'.
ALTER TABLE employee_reports
    ADD COLUMN IF NOT EXISTS servicio_origen_id INTEGER,
    ADD COLUMN IF NOT EXISTS servicio_destino_id INTEGER;

-- La categoria tiene un CHECK constraint; hay que incluir el nuevo valor 'cambio_servicio'.
ALTER TABLE employee_reports DROP CONSTRAINT IF EXISTS employee_reports_categoria_check;
ALTER TABLE employee_reports ADD CONSTRAINT employee_reports_categoria_check
    CHECK (categoria IN ('sancion', 'advertencia', 'felicitacion', 'incidente', 'suspension', 'cambio_servicio'));

-- Foreign keys hacia services (necesarias para que el join origen/destino funcione en la API).
ALTER TABLE employee_reports DROP CONSTRAINT IF EXISTS employee_reports_servicio_origen_fk;
ALTER TABLE employee_reports ADD CONSTRAINT employee_reports_servicio_origen_fk
    FOREIGN KEY (servicio_origen_id) REFERENCES services(id);
ALTER TABLE employee_reports DROP CONSTRAINT IF EXISTS employee_reports_servicio_destino_fk;
ALTER TABLE employee_reports ADD CONSTRAINT employee_reports_servicio_destino_fk
    FOREIGN KEY (servicio_destino_id) REFERENCES services(id);
