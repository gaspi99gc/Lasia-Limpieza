-- Visitas cotizadas: cuando un supervisor va a inspeccionar a un posible
-- cliente que todavia NO es un servicio del sistema. Se registran en la misma
-- tabla de fichadas para que aparezcan junto al resto en el informe.
--
-- Cambios:
--  * service_id pasa a ser opcional (una visita cotizada no tiene servicio).
--  * es_cotizada: marca la fila como visita cotizada (sin GPS, nombre fijo).
--  * nota: observacion libre de la visita.

ALTER TABLE supervisor_presentismo_logs
    ALTER COLUMN service_id DROP NOT NULL;

ALTER TABLE supervisor_presentismo_logs
    ADD COLUMN IF NOT EXISTS es_cotizada BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS nota TEXT;

-- La app accede con la service role key.
GRANT ALL ON TABLE supervisor_presentismo_logs TO service_role;
