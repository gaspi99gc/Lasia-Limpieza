-- Fichadas de servicio agregadas a mano por operaciones (el supervisor no las fichó
-- por la app). Sin GPS, no disparan alerta de "lejos".
ALTER TABLE supervisor_presentismo_logs
    ADD COLUMN IF NOT EXISTS agregado_manual BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS agregado_por TEXT,
    ADD COLUMN IF NOT EXISTS agregado_at TIMESTAMP;
