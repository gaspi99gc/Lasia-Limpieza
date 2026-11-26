-- Mejoras de la Solicitud de Personal (2026-11-27, aprobadas por el usuario con fotos).
--
-- - encargado_nombre: quién recibe a la persona en el servicio. Lo escribe la
--   jefa operativa en cada solicitud (no se guarda en el servicio: cambia seguido).
-- - por_vacaciones: la persona se toma para cubrir vacaciones. Se ve en violeta y
--   el tablero de rotación de más adelante no la cuenta como rotación.
-- - grupo_id: une las solicitudes de un mismo pedido ("Guardar y cargar otra
--   igual"), para contarlas una vez en ese tablero.
-- - personas_tomadas: quién entró al puesto, al marcarla Cubierta:
--   [{ "dni": "40123456", "nombre": "PEREZ JUANA" }, ...]
--
-- Correr en: Supabase Dashboard -> SQL Editor. Es idempotente.

ALTER TABLE staff_requests
    ADD COLUMN IF NOT EXISTS encargado_nombre TEXT,
    ADD COLUMN IF NOT EXISTS por_vacaciones BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS grupo_id UUID,
    ADD COLUMN IF NOT EXISTS personas_tomadas JSONB;

-- Las 3 de DENO del 26/11 son un solo pedido (1 hombre, 1 mujer, 1 indistinto).
UPDATE staff_requests
SET grupo_id = '5f0c1a52-6a3e-4c2b-9d43-2b7f0e6a2311'
WHERE id IN (23, 24, 25) AND grupo_id IS NULL;
