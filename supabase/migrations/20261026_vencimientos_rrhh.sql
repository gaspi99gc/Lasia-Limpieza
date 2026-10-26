-- Vencimientos de RRHH: tareas con fecha (una sola vez o cada N meses) que
-- avisan por push a los responsables elegidos 7 dias antes, 2 dias antes y el
-- mismo dia, hasta que alguien las marca como hechas.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

CREATE TABLE IF NOT EXISTS rrhh_vencimientos (
    id BIGSERIAL PRIMARY KEY,
    titulo TEXT NOT NULL,
    nota TEXT,
    -- El proximo vencimiento. En los que se repiten avanza al marcar "Hecho".
    fecha DATE NOT NULL,
    -- NULL = una sola vez; 1 = todos los meses; 3 = trimestral; 12 = anual.
    cada_meses INTEGER CHECK (cada_meses IS NULL OR cada_meses BETWEEN 1 AND 24),
    -- El dia del mes original: si vence el 31, en febrero cae el 28 y en marzo
    -- vuelve al 31. Sin esto la fecha se iria corriendo para atras.
    dia_mes INTEGER CHECK (dia_mes BETWEEN 1 AND 31),
    -- A quienes les llega el aviso (app_users.id).
    responsables UUID[] NOT NULL DEFAULT '{}',
    estado TEXT NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'hecho')),
    creado_por TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    actualizado_por TEXT,
    updated_at TIMESTAMPTZ,
    -- Borrar es anular, como en el resto del sistema.
    anulado_at TIMESTAMPTZ,
    anulado_por TEXT
);

CREATE INDEX IF NOT EXISTS idx_rrhh_vencimientos_pendientes
    ON rrhh_vencimientos (fecha)
    WHERE anulado_at IS NULL AND estado = 'pendiente';

-- Cada vez que se marca "Hecho": que vencimiento era, quien y cuando.
-- El UNIQUE hace que un doble clic no avance la fecha dos veces.
CREATE TABLE IF NOT EXISTS rrhh_vencimientos_hechos (
    id BIGSERIAL PRIMARY KEY,
    vencimiento_id BIGINT NOT NULL REFERENCES rrhh_vencimientos(id) ON DELETE CASCADE,
    fecha_vencimiento DATE NOT NULL,
    hecho_por TEXT,
    hecho_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (vencimiento_id, fecha_vencimiento)
);

-- Los avisos mandados, igual que trabajos_avisos: el UNIQUE evita que un
-- aviso salga dos veces aunque el cron corra dos veces.
CREATE TABLE IF NOT EXISTS rrhh_vencimientos_avisos (
    id BIGSERIAL PRIMARY KEY,
    vencimiento_id BIGINT NOT NULL REFERENCES rrhh_vencimientos(id) ON DELETE CASCADE,
    fecha_vencimiento DATE NOT NULL,
    dias_antes INTEGER NOT NULL CHECK (dias_antes >= 0),
    estado TEXT NOT NULL DEFAULT 'enviando'
        CHECK (estado IN ('enviando', 'enviado', 'fallido', 'omitido')),
    intentos INTEGER NOT NULL DEFAULT 0,
    destinatarios INTEGER,
    dispositivos INTEGER,
    ultimo_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    enviado_at TIMESTAMPTZ,
    UNIQUE (vencimiento_id, fecha_vencimiento, dias_antes)
);

CREATE INDEX IF NOT EXISTS idx_rrhh_vencimientos_avisos_fallidos
    ON rrhh_vencimientos_avisos (vencimiento_id) WHERE estado = 'fallido';

-- RLS como todas las tablas: la app entra con service_role, anon no ve nada.
ALTER TABLE rrhh_vencimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE rrhh_vencimientos_hechos ENABLE ROW LEVEL SECURITY;
ALTER TABLE rrhh_vencimientos_avisos ENABLE ROW LEVEL SECURITY;
GRANT ALL ON rrhh_vencimientos, rrhh_vencimientos_hechos, rrhh_vencimientos_avisos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE rrhh_vencimientos_id_seq, rrhh_vencimientos_hechos_id_seq, rrhh_vencimientos_avisos_id_seq TO service_role;
