-- Cerrar las funciones de la base a cualquiera que no sea el servidor.
--
-- Problema: en Postgres toda funcion nueva la puede ejecutar cualquiera
-- (PUBLIC), y Supabase ademas se la habilita a 'anon' y 'authenticated'. Esas
-- son las claves de AFUERA del servidor. RLS no las frena en este caso: una
-- funcion SECURITY DEFINER corre con los permisos de su dueño y se saltea RLS.
--
-- Caso concreto: create_supply_request_with_items es SECURITY DEFINER y tenia
-- GRANT a 'authenticated'. Con la clave publica se podian crear pedidos de
-- insumos sin pasar por la app.
--
-- No se cierra solo esa: se cierran TODAS las funciones del schema public,
-- porque puede haber alguna creada a mano que no esta en el repo (por ejemplo
-- una exec_sql, que se probo alguna vez) y que abierta permitiria correr
-- cualquier SQL desde afuera.
--
-- La app no se entera: todas sus consultas van con la SERVICE_ROLE key desde
-- el servidor, y a service_role se le deja el permiso explicito. La clave
-- publica solo se usa para el login (Supabase Auth), que no pasa por estas
-- funciones. Los triggers tampoco se ven afectados: Postgres no chequea este
-- permiso cuando un trigger se dispara.
--
-- Quedan afuera las funciones de extensiones (no son nuestras).
--
-- OJO al crear funciones nuevas: nacen abiertas otra vez. Volver a correr esta
-- migracion despues (es idempotente), o agregarles los mismos REVOKE/GRANT.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run.

DO $$
DECLARE
    f RECORD;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure AS firma
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prokind IN ('f', 'p')
          AND NOT EXISTS (
              SELECT 1 FROM pg_depend d
              WHERE d.classid = 'pg_proc'::regclass
                AND d.objid = p.oid
                AND d.deptype = 'e'
          )
    LOOP
        EXECUTE format('REVOKE EXECUTE ON ROUTINE %s FROM PUBLIC, anon, authenticated', f.firma);
        EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO service_role', f.firma);
        RAISE NOTICE 'Cerrada: %', f.firma;
    END LOOP;
END $$;

-- Verificacion: tiene que devolver 0 filas (ninguna funcion abierta a afuera).
SELECT p.oid::regprocedure AS funcion_abierta
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind IN ('f', 'p')
  AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.classid = 'pg_proc'::regclass
        AND d.objid = p.oid
        AND d.deptype = 'e'
  )
  AND (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
  );
