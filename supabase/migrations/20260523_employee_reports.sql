-- Informes formales sobre operarios (empleados): sanción, advertencia, felicitación, incidente.
-- Registro histórico fijo: nadie edita, solo admin puede borrar.
CREATE TABLE IF NOT EXISTS employee_reports (
    id SERIAL PRIMARY KEY,
    empleado_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    categoria TEXT NOT NULL
        CHECK (categoria IN ('sancion', 'advertencia', 'felicitacion', 'incidente')),
    descripcion TEXT NOT NULL,
    autor TEXT,
    autor_rol TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_reports_empleado ON employee_reports(empleado_id);

-- La app accede con la service role key; asegurar permisos sobre la tabla y su secuencia.
GRANT ALL ON TABLE employee_reports TO service_role;
GRANT USAGE, SELECT ON SEQUENCE employee_reports_id_seq TO service_role;
