-- supervisor_status.supervisor_id es la clave primaria/única (usada en upsert onConflict),
-- por lo que ya tiene un índice implícito. Los siguientes son los índices adicionales útiles.

-- Índice para el filtro por status (dashboard admin: GET /api/supervisor-status?status=chambeando)
CREATE INDEX IF NOT EXISTS idx_supervisor_status_status
    ON supervisor_status(status);

-- Índice en current_service_id para el JOIN con services en getSupervisorStatus.
-- Postgres crea índices en FKs declaradas, pero si la FK no está declarada formalmente,
-- este índice asegura que el LEFT JOIN sea eficiente.
CREATE INDEX IF NOT EXISTS idx_supervisor_status_current_service_id
    ON supervisor_status(current_service_id);
