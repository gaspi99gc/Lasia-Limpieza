-- Marcas de "Faltante" y "Agregado" en ítems de pedidos de insumos.
-- Faltante: el supervisor_tecnico (Nestor) marca un ítem original que el proveedor no entregó.
-- Agregado: el supervisor agrega un ítem al pedido después de creado (olvido al armarlo).
ALTER TABLE supply_request_items
    ADD COLUMN IF NOT EXISTS faltante BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS agregado BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS marcado_por TEXT,
    ADD COLUMN IF NOT EXISTS marcado_at TIMESTAMPTZ;
