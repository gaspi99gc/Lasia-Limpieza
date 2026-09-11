-- Segundo servicio y dias de la semana en las solicitudes de personal.
--
-- Hay gente que cubre DOS servicios: sale de uno y entra al otro. Hoy eso
-- obligaba a cargar dos solicitudes sueltas, y nadie sabia que iban juntas: RRHH
-- podia cubrir una con una persona y la otra con otra, cuando en realidad era un
-- solo puesto. Ahora es UNA solicitud con dos servicios y su horario propio, y
-- se cubre una sola vez.
--
-- Los dias tambien hacian falta: "jornada completa" no dice si incluye sabado, y
-- para RRHH conseguir a alguien de lunes a viernes no es lo mismo que de lunes a
-- sabado. Estaba quedando suelto en las notas, donde no se puede filtrar.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

ALTER TABLE staff_requests
    -- INTEGER y no BIGINT: services.id es INTEGER, y Postgres no deja crear una
    -- FK entre tipos distintos (misma razon que la columna service_id de arriba).
    ADD COLUMN IF NOT EXISTS service_id_2 INTEGER REFERENCES services(id),
    ADD COLUMN IF NOT EXISTS hora_desde_2 TIME,
    ADD COLUMN IF NOT EXISTS hora_hasta_2 TIME,

    -- Los dias como texto separado por comas: 'lun,mar,mie,jue,vie'.
    --
    -- Se guarda asi y no como siete columnas booleanas ni como bitmask: son
    -- pocos datos, se leen tal cual en una consulta suelta, y agregar un dia
    -- especial mas adelante no pide otra migracion. Un bitmask seria mas compacto
    -- pero habria que decodificarlo en cada lugar donde se mire.
    ADD COLUMN IF NOT EXISTS dias TEXT;

CREATE INDEX IF NOT EXISTS idx_staff_requests_service_2 ON staff_requests(service_id_2);
