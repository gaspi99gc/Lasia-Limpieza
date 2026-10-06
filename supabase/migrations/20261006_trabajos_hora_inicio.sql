-- Trabajos programados: a que hora empieza la actividad.
--
-- Hasta ahora un trabajo tenia fecha pero no hora, y quien tenia que ir lo
-- preguntaba por WhatsApp. La hora se pide al cargar el trabajo y sale en la
-- lista, en los avisos y en la agenda del supervisor.
--
-- La columna admite vacio solo por los trabajos cargados antes: el formulario
-- la exige, asi que al editar uno viejo hay que completarla.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.
-- Correrla ANTES de publicar: la pantalla ya manda la hora al guardar.

ALTER TABLE trabajos_programados
    ADD COLUMN IF NOT EXISTS hora_inicio TIME;
