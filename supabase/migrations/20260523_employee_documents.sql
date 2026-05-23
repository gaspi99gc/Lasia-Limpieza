-- La tabla employee_documents ya existía con un esquema viejo
-- (archivo_url, archivo_nombre, fecha_carga). Agregamos las columnas
-- que usa el nuevo flujo de carga a Storage, sin romper lo existente.
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS size_bytes INTEGER;
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS cargado_por TEXT;
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_employee_documents_empleado ON employee_documents(empleado_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_tipo ON employee_documents(documento_tipo_id);

-- La app accede con la service role key; asegurar permisos sobre la tabla.
GRANT ALL ON TABLE employee_documents TO service_role;

-- Bucket privado para los archivos de documentación de legajos.
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-documents', 'employee-documents', false)
ON CONFLICT (id) DO NOTHING;
