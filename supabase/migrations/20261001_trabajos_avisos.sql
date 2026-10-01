-- Avisos automaticos de los trabajos programados (sprint 3).
--
-- Un cron diario mira los trabajos sin coordinar que se vienen y les manda una
-- notificacion push a Operaciones y al supervisor que se eligio en el trabajo.
-- Esta tabla es el registro de cada aviso: si salio, a cuantos dispositivos
-- llego y, si no salio, por que. Es lo que contesta "¿por que no me llego?".
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.
-- Correrla ANTES de publicar el codigo: la pantalla de trabajos ya pide el
-- supervisor, y sin la columna la lista da error.

-- 1) A que supervisor le llega el aviso. Se elige al cargar el trabajo porque
--    el sistema no tiene un supervisor fijo por servicio que sea confiable
--    (supervisor_routes existe pero ninguna pantalla la mantiene). Es opcional:
--    sin supervisor, el aviso le llega solo a Operaciones.
--
--    supervisors.id es INTEGER, no BIGINT. Declararlo mal hace que Postgres no
--    cree nada del bloque y el editor igual diga "Success".
ALTER TABLE trabajos_programados
    ADD COLUMN IF NOT EXISTS supervisor_id INTEGER REFERENCES supervisors(id);

-- 2) Cada aviso que el cron mando (o intento mandar).
CREATE TABLE IF NOT EXISTS trabajos_avisos (
    id BIGSERIAL PRIMARY KEY,

    -- trabajos_programados.id es BIGSERIAL, asi que aca va BIGINT.
    trabajo_id BIGINT NOT NULL REFERENCES trabajos_programados(id) ON DELETE CASCADE,

    -- La fecha que tenia el trabajo cuando se aviso. Si despues se reprograma,
    -- la fecha nueva vuelve a generar sus avisos: avisar "en 7 dias" de una
    -- fecha que ya no existe no le sirve a nadie.
    fecha_trabajo DATE NOT NULL,

    -- Que aviso es: el de 7 dias antes, el de 2 dias antes. Se manda el dia
    -- fecha_trabajo - dias_antes (o el primer dia despues, si el trabajo se
    -- cargo tarde o el cron no corrio).
    dias_antes INTEGER NOT NULL CHECK (dias_antes >= 0),

    --   enviando -> el cron lo tomo y esta mandando. Si queda asi, el envio se
    --               corto a la mitad (timeout): no se reintenta solo para no
    --               mandarlo dos veces.
    --   enviado  -> llego a por lo menos un dispositivo
    --   fallido  -> no llego a nadie; se reintenta en las corridas siguientes
    --               hasta 3 veces (ej: nadie tenia las notificaciones activadas)
    --   omitido  -> no se mando porque ya correspondia uno mas cercano (el
    --               trabajo se cargo tarde): no tiene sentido avisar "en 7 dias"
    --               y "en 2 dias" el mismo dia
    estado TEXT NOT NULL DEFAULT 'enviando'
        CHECK (estado IN ('enviando', 'enviado', 'fallido', 'omitido')),

    intentos INTEGER NOT NULL DEFAULT 0,
    destinatarios INTEGER,      -- personas a las que se les mando
    dispositivos INTEGER,       -- dispositivos que lo recibieron
    ultimo_error TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),
    enviado_at TIMESTAMPTZ,

    -- La idempotencia va aca y no en la logica: si el cron corre dos veces el
    -- mismo dia, el segundo insert choca contra este indice y no manda nada.
    -- Es la diferencia entre "no deberia duplicar" y "no puede duplicar".
    UNIQUE (trabajo_id, fecha_trabajo, dias_antes)
);

-- El cron busca los fallidos para reintentarlos.
CREATE INDEX IF NOT EXISTS idx_trabajos_avisos_fallidos
    ON trabajos_avisos (trabajo_id) WHERE estado = 'fallido';

ALTER TABLE trabajos_avisos ENABLE ROW LEVEL SECURITY;
GRANT ALL ON trabajos_avisos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE trabajos_avisos_id_seq TO service_role;
