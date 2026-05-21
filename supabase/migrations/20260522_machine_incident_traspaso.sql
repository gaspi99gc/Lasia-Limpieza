-- Servicio destino para incidencias de tipo "Traspaso"
ALTER TABLE machine_incidents
    ADD COLUMN IF NOT EXISTS service_destino_id INTEGER REFERENCES services(id) ON DELETE SET NULL;

-- Estado "completada" (usado al cerrar un traspaso)
ALTER TABLE machine_incidents
    DROP CONSTRAINT IF EXISTS machine_incidents_estado_check;
ALTER TABLE machine_incidents
    ADD CONSTRAINT machine_incidents_estado_check
    CHECK (estado IN ('abierta', 'en_revision', 'reparada', 'reemplazada', 'descartada', 'completada'));
