-- Contacto del encargado por servicio (sucursal).
-- Lo usa el repartidor desde /mi-panel-tecnico para avisarle al encargado al llegar.
ALTER TABLE services ADD COLUMN IF NOT EXISTS encargado_nombre TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS encargado_telefono TEXT;
