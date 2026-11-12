-- Vacaciones que se cobran: marcar cuándo salió el pago (pedido del usuario,
-- 2026-11-12). Lo marcan la jefa operativa y el admin desde Vacaciones ›
-- Aprobadas › Cobran, por quincena de cobro o de a uno. Se puede deshacer.
--
-- Solo para tipo 'pagado' (los días que se cobran en vez de tomarse). Vacío =
-- todavía no se pagó. El monto queda para más adelante.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.
-- Correrla ANTES de publicar: la pantalla manda estos campos al marcar.

ALTER TABLE vacaciones_movimientos
    ADD COLUMN IF NOT EXISTS pago_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pago_por TEXT;
