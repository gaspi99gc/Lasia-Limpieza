-- Registrar cuándo una solicitud pasa a estado 'cubierta'.
-- La app setea/limpia este valor desde el backend según el cambio de estado.
ALTER TABLE staff_requests
    ADD COLUMN IF NOT EXISTS cubierta_at TIMESTAMP;
