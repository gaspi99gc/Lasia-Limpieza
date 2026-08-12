-- ============================================================================
-- Habilitar Row-Level Security (RLS) en TODAS las tablas del schema public.
--
-- Contexto: la app se conecta con la SERVICE_ROLE key, que IGNORA RLS por
-- diseño (atributo BYPASSRLS). Por lo tanto activar RLS NO afecta el
-- funcionamiento de la app: la app sigue leyendo y escribiendo igual.
-- No creamos políticas para 'anon' ni 'authenticated': sin políticas, RLS
-- bloquea TODAS las filas para esas keys (deny-by-default), que es justo lo
-- que queremos. Es defensa en profundidad, además del GRANT que ya bloquea
-- a anon a nivel tabla.
--
-- Resultado: el aviso "Table publicly accessible / rls_disabled_in_public"
-- de Supabase deja de aparecer, y queda una segunda cerradura por si algún
-- día se le diera un GRANT a anon por error.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run.
-- Es idempotente: se puede correr varias veces sin problema.
-- ============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
        RAISE NOTICE 'RLS habilitado en: %', r.tablename;
    END LOOP;
END $$;

-- Verificación: esta consulta debe devolver 0 filas (ninguna tabla sin RLS).
SELECT tablename AS tablas_sin_rls
FROM pg_tables
WHERE schemaname = 'public'
  AND NOT rowsecurity;
