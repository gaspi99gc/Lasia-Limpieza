-- Vincular cada entrevista del calendario con la solicitud de personal que la originó.
-- Base del embudo de reclutamiento: cuántas personas se toman por puesto/servicio.
ALTER TABLE hr_calendar_events
    ADD COLUMN IF NOT EXISTS staff_request_id INTEGER REFERENCES staff_requests(id);
