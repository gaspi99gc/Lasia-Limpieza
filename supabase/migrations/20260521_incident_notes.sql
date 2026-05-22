-- Historial de notas de seguimiento por incidencia.
-- Permanente: las incidencias resueltas no se borran (cambian de estado),
-- por lo que el hilo de notas queda atado a la máquina + servicio de forma histórica.
CREATE TABLE IF NOT EXISTS incident_notes (
    id SERIAL PRIMARY KEY,
    incident_id INTEGER NOT NULL REFERENCES machine_incidents(id) ON DELETE CASCADE,
    nota TEXT NOT NULL,
    autor TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_notes_incident ON incident_notes(incident_id);

-- La app accede con la service role key; asegurar permisos sobre la tabla y su secuencia.
GRANT ALL ON TABLE incident_notes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE incident_notes_id_seq TO service_role;
