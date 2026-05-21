-- Tipo de falla por incidencia
ALTER TABLE machine_incidents
    ADD COLUMN IF NOT EXISTS tipo_falla TEXT;

-- Adjuntos (foto/video) de incidencias
CREATE TABLE IF NOT EXISTS machine_incident_attachments (
    id SERIAL PRIMARY KEY,
    incident_id INTEGER NOT NULL REFERENCES machine_incidents(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_machine_incident_attachments_incident
    ON machine_incident_attachments(incident_id);

-- Bucket privado para fotos/videos de incidencias de maquinaria
INSERT INTO storage.buckets (id, name, public)
VALUES ('machine-incidents', 'machine-incidents', false)
ON CONFLICT (id) DO NOTHING;
