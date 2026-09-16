-- Ultimo inicio de sesion de cada usuario.
--
-- Hoy no hay forma de saber quien esta usando el sistema. Sirve para dos cosas
-- concretas: detectar cuentas que nadie usa (y darlas de baja, que es higiene de
-- seguridad) y ver si una herramienta nueva la esta abriendo alguien o quedo
-- decorando.
--
-- Se guarda SOLO la fecha del ultimo acceso, no un historial de sesiones. Un log
-- de cada entrada crece para siempre y responde una pregunta que nadie hace; la
-- fecha del ultimo acceso responde las dos de arriba con una columna.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS ultimo_acceso TIMESTAMPTZ;
