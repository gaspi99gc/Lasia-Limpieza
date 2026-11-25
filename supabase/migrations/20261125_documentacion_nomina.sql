-- Documentacion mensual (ex Vencimientos): la nomina de cada documentacion y
-- el registro oculto de cada envio. Se suma a las tablas rrhh_vencimientos*
-- de la migracion del 26/10, sin tocarlas.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

-- Quien va en cada documentacion. Una persona puede estar en varias, pero una
-- sola vez en cada una (indice unico de abajo).
CREATE TABLE IF NOT EXISTS rrhh_vencimientos_nomina (
    id BIGSERIAL PRIMARY KEY,
    vencimiento_id BIGINT NOT NULL REFERENCES rrhh_vencimientos(id) ON DELETE CASCADE,
    -- Si se elimina un legajo se van sus filas; el snapshot de los envios
    -- conserva el nombre y el DNI.
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    agregado_por TEXT,
    agregado_at TIMESTAMPTZ DEFAULT now(),
    -- NULL = pendiente: todavia no entro en ningun envio.
    enviado_at TIMESTAMPTZ,
    -- Sacar es anular, como en el resto del sistema. quitado_por es el usuario
    -- o 'Baja del legajo' cuando la saca la limpieza de bajas.
    quitado_at TIMESTAMPTZ,
    quitado_por TEXT
);

-- La misma persona no puede estar dos veces vigente en la misma nomina, ni
-- con dos pedidos simultaneos. Si se la saca y se la vuelve a agregar, es una
-- fila nueva.
CREATE UNIQUE INDEX IF NOT EXISTS uq_nomina_vigente
    ON rrhh_vencimientos_nomina (vencimiento_id, employee_id) WHERE quitado_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_nomina_vencimiento
    ON rrhh_vencimientos_nomina (vencimiento_id) WHERE quitado_at IS NULL;

-- El registro oculto: cada vez que se mando la documentacion, quien, cuando y
-- la foto de a quien se documento. No se muestra en ninguna pantalla.
CREATE TABLE IF NOT EXISTS rrhh_vencimientos_envios (
    id BIGSERIAL PRIMARY KEY,
    vencimiento_id BIGINT NOT NULL REFERENCES rrhh_vencimientos(id) ON DELETE CASCADE,
    -- mensual = "Hecho", parcial = "Ya la mande", inicial = la carga del Excel.
    tipo TEXT NOT NULL CHECK (tipo IN ('mensual', 'parcial', 'inicial')),
    -- La fecha que tenia la documentacion en ese momento.
    fecha_vencimiento DATE,
    enviado_por TEXT,
    enviado_at TIMESTAMPTZ DEFAULT now(),
    -- [{ employee_id, apellido, nombre, dni }]: en mensual la nomina completa,
    -- en parcial solo los que se mandaron.
    nomina JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_envios_vencimiento
    ON rrhh_vencimientos_envios (vencimiento_id);

-- RLS como todas las tablas: la app entra con service_role, anon no ve nada.
ALTER TABLE rrhh_vencimientos_nomina ENABLE ROW LEVEL SECURITY;
ALTER TABLE rrhh_vencimientos_envios ENABLE ROW LEVEL SECURITY;
GRANT ALL ON rrhh_vencimientos_nomina, rrhh_vencimientos_envios TO service_role;
GRANT USAGE, SELECT ON SEQUENCE rrhh_vencimientos_nomina_id_seq, rrhh_vencimientos_envios_id_seq TO service_role;
