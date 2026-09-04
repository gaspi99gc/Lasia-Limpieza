-- ============================================================================
-- DESARMAR POR COMPLETO EL EXPERIMENTO DEL OPERATIVO / PRESENTISMO
--
-- Esto NO se corre salvo que se decida dar de baja todo el modulo. Borra las
-- tablas del operativo y las faltas CON TODOS SUS DATOS, sin vuelta atras.
--
-- Es seguro para el resto del sistema: ninguna otra tabla depende de estas.
-- Las claves foraneas van en un solo sentido (faltas -> employees/services),
-- asi que borrar esto no toca ni legajos, ni servicios, ni licencias, ni nada
-- de lo que ya esta en produccion.
--
-- Del lado del codigo, la contraparte es borrar la rama:
--     git branch -D operativo
--     git push origin --delete operativo
--
-- Correr en: Supabase Dashboard -> SQL Editor.
-- ============================================================================

DROP TABLE IF EXISTS faltas;
DROP TABLE IF EXISTS operativo_dias;      -- tiene FK a operativo_puestos, va antes
DROP TABLE IF EXISTS operativo_puestos;
DROP TABLE IF EXISTS presentismo_historico;

-- Verificacion: estas 4 consultas tienen que fallar con "does not exist".
-- SELECT 1 FROM faltas;
-- SELECT 1 FROM operativo_dias;
-- SELECT 1 FROM operativo_puestos;
-- SELECT 1 FROM presentismo_historico;
