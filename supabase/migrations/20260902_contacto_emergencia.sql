-- Contacto de emergencia en el legajo. Se releva junto con el domicilio para la
-- gente con antigüedad, para poder avisar a alguien si pasa cualquier cosa.
--
-- El domicilio ya existe (employees.direccion), asi que solo se agregan el
-- telefono del contacto y de quien es (madre, esposo, hermano...).
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono TEXT,
    ADD COLUMN IF NOT EXISTS contacto_emergencia_vinculo TEXT;
