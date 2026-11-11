-- Rol nuevo: ventas.
--
-- Ve el mapa, el listado de servicios y la maquinaria, todo de solo lectura
-- (el corte de escritura esta en el middleware).
--
-- La tabla app_users tiene un CHECK (app_users_role_check) con la lista de
-- roles validos, que no esta en ninguna migracion del repo: se ajusto a mano
-- cuando se sumaron los roles anteriores. Sin esto, crear un usuario de ventas
-- desde /usuarios falla al insertar el perfil.
--
-- Se reescribe el CHECK con la lista completa que acepta hoy la app (la misma
-- de /api/app-users) mas 'ventas'. Va en una transaccion: si hubiera algun
-- usuario con un rol fuera de la lista, el ADD falla y se deshace tambien el
-- DROP, asi que nunca queda la tabla sin control.
--
-- Para ver como esta el CHECK antes de correrla:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'app_users_role_check';
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

BEGIN;

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;

ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN (
    'admin',
    'purchases',
    'supervisor',
    'jefe_operativo',
    'rrhh',
    'direccion',
    'operaciones',
    'supervisor_tecnico',
    'wework',
    'mantenimiento',
    'ventas'
));

COMMIT;
