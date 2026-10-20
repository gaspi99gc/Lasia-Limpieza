-- Todos los servicios de cada operario, no solo el principal.
--
-- Es normal que una persona trabaje en dos servicios (ej. 4 hs en uno y 4 en
-- otro), pero el legajo tiene un solo campo servicio_id. Esta tabla guarda la
-- lista completa, con las horas por día de cada uno, para que el legajo los
-- muestre a todos. servicio_id sigue siendo el principal.
--
-- La llena un script a partir del operativo de Operaciones (no se carga a
-- mano): cada vez que se actualiza el operativo, se reemplaza la lista.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

CREATE TABLE IF NOT EXISTS employee_servicios (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES services(id),
    horas_dia NUMERIC(4, 1),          -- promedio en los días que trabaja ahí
    fuente TEXT,                      -- de qué operativo salió (ej. '21-10-2026.xlsx')
    actualizado_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (employee_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_servicios_emp ON employee_servicios(employee_id);

ALTER TABLE employee_servicios ENABLE ROW LEVEL SECURITY;
GRANT ALL ON employee_servicios TO service_role;
GRANT USAGE, SELECT ON SEQUENCE employee_servicios_id_seq TO service_role;
