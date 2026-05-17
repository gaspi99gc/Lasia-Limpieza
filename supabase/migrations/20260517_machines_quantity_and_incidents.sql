-- Cantidad de unidades por (servicio, máquina)
ALTER TABLE service_machines
    ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1
    CHECK (quantity >= 0);

-- Asegurar unicidad del par para poder hacer upsert desde el cliente
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'service_machines_service_machine_unique'
    ) THEN
        ALTER TABLE service_machines
            ADD CONSTRAINT service_machines_service_machine_unique
            UNIQUE (service_id, machine_id);
    END IF;
END $$;

-- Incidencias sobre máquinas de un servicio
CREATE TABLE IF NOT EXISTS machine_incidents (
    id SERIAL PRIMARY KEY,
    service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    machine_id INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    descripcion TEXT NOT NULL,
    nota_interna TEXT,
    estado TEXT NOT NULL DEFAULT 'abierta'
        CHECK (estado IN ('abierta', 'en_revision', 'reparada', 'reemplazada', 'descartada')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_machine_incidents_service ON machine_incidents(service_id);
CREATE INDEX IF NOT EXISTS idx_machine_incidents_machine ON machine_incidents(machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_incidents_estado ON machine_incidents(estado);
