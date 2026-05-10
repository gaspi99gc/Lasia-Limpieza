-- Performance indexes for filtered/sorted columns
-- supervisor_status.supervisor_id is the PK — already indexed, omitted here

-- services
CREATE INDEX IF NOT EXISTS idx_services_name
    ON services (name);

-- supplies
CREATE INDEX IF NOT EXISTS idx_supplies_nombre
    ON supplies (nombre);

-- employees
CREATE INDEX IF NOT EXISTS idx_employees_apellido
    ON employees (apellido);

CREATE INDEX IF NOT EXISTS idx_employees_estado_empleado
    ON employees (estado_empleado);

CREATE INDEX IF NOT EXISTS idx_employees_servicio_id
    ON employees (servicio_id);

-- supervisor_status
CREATE INDEX IF NOT EXISTS idx_supervisor_status_status
    ON supervisor_status (status);

-- supply_requests
CREATE INDEX IF NOT EXISTS idx_supply_requests_status
    ON supply_requests (status);

CREATE INDEX IF NOT EXISTS idx_supply_requests_created_at
    ON supply_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_supply_requests_supervisor_id
    ON supply_requests (supervisor_id);

-- supervisor_presentismo_logs
CREATE INDEX IF NOT EXISTS idx_presentismo_logs_supervisor_id
    ON supervisor_presentismo_logs (supervisor_id);

CREATE INDEX IF NOT EXISTS idx_presentismo_logs_occurred_at
    ON supervisor_presentismo_logs (occurred_at DESC);
