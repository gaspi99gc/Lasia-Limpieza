-- FIX: autor_id se había creado como INTEGER, pero los ids de usuario (app_users.id)
-- son UUID (texto). Por eso el filtro "mis informes" del supervisor nunca guardaba
-- el autor. Cambiar a TEXT.
ALTER TABLE employee_reports
    ALTER COLUMN autor_id TYPE TEXT USING autor_id::TEXT;
