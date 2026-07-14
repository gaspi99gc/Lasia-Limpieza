-- Precio por unidad de cada insumo. Se usa para valorizar los pedidos y calcular
-- el gasto de insumos por servicio (KPI de direccion). Precio actual unico: los
-- pedidos se valorizan con el precio vigente del insumo.
ALTER TABLE supplies ADD COLUMN IF NOT EXISTS precio NUMERIC(14,2) NOT NULL DEFAULT 0;

-- La app accede con la service role key.
GRANT ALL ON TABLE supplies TO service_role;
