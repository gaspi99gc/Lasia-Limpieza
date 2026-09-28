-- Suscripciones a notificaciones push.
--
-- Cuando alguien acepta recibir notificaciones, el navegador entrega tres datos
-- (endpoint y dos claves) que son la direccion a la que se le puede mandar un
-- aviso aunque tenga la app cerrada. Sin guardarlos no hay a donde mandar nada.
--
-- Una persona puede tener varias: el celular y la computadora son suscripciones
-- distintas, y las dos tienen que recibir.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

CREATE TABLE IF NOT EXISTS push_suscripciones (
    id BIGSERIAL PRIMARY KEY,

    -- app_users.id es UUID, no BIGINT. Declararlo mal hace que Postgres no cree
    -- la tabla y el editor igual diga "Success".
    app_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,

    -- El endpoint es la direccion unica del navegador: es el identificador real
    -- de la suscripcion. Si el mismo dispositivo se vuelve a suscribir, el
    -- endpoint se repite y hay que actualizar la fila, no crear otra.
    endpoint TEXT NOT NULL UNIQUE,

    -- Claves de cifrado que entrega el navegador. Sin ellas el mensaje no se
    -- puede firmar y el push service lo rechaza.
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,

    -- Para poder decirle a alguien cual de sus dispositivos es cual cuando
    -- tenga que darlos de baja.
    user_agent TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),
    -- Cuando se le mando algo por ultima vez con exito. Sirve para detectar
    -- suscripciones que quedaron muertas sin avisar.
    ultimo_uso_at TIMESTAMPTZ
);

-- La consulta normal es "a que dispositivos le mando a esta persona".
CREATE INDEX IF NOT EXISTS idx_push_susc_usuario
    ON push_suscripciones (app_user_id);

ALTER TABLE push_suscripciones ENABLE ROW LEVEL SECURITY;
GRANT ALL ON push_suscripciones TO service_role;
GRANT USAGE, SELECT ON SEQUENCE push_suscripciones_id_seq TO service_role;
