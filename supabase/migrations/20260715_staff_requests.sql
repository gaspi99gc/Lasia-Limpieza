-- Solicitudes de personal: el jefe operativo pide operarios para un servicio,
-- RRHH las gestiona (cambia el estado, edita, borra).
CREATE TABLE IF NOT EXISTS staff_requests (
    id SERIAL PRIMARY KEY,
    service_id INTEGER REFERENCES services(id),
    cantidad INTEGER NOT NULL DEFAULT 1,
    tipo_jornada TEXT,
    urgencia TEXT DEFAULT 'normal',
    fecha_necesaria DATE,
    motivo TEXT,
    notas TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'en_proceso', 'cubierta')),
    creado_por_nombre TEXT,
    creado_por_rol TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_staff_requests_estado ON staff_requests(estado);

-- La app accede con la service role key.
GRANT ALL ON TABLE staff_requests TO service_role;
GRANT USAGE, SELECT ON SEQUENCE staff_requests_id_seq TO service_role;
