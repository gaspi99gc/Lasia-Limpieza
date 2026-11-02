-- Vacaciones que se cobran: cuándo se cobran y el recordatorio de la semana
-- anterior (pedido del usuario, 2026-11-02).
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

-- En qué quincena del mes se cobran los días: el 1 (del 1 al 15) o el 16 (del
-- 16 a fin de mes). Solo para tipo 'pagado'; lo tomado sigue usando fecha_desde.
ALTER TABLE vacaciones_movimientos
    ADD COLUMN IF NOT EXISTS fecha_cobro DATE;

-- El aviso "la semana que viene cobran" que manda el cron de las 8, uno por
-- quincena de cobro. El UNIQUE evita que salga dos veces aunque el cron corra
-- dos veces (igual que trabajos_avisos y rrhh_vencimientos_avisos).
CREATE TABLE IF NOT EXISTS vacaciones_cobros_avisos (
    id BIGSERIAL PRIMARY KEY,
    fecha_cobro DATE NOT NULL,
    dias_antes INTEGER NOT NULL CHECK (dias_antes >= 0),
    estado TEXT NOT NULL DEFAULT 'enviando'
        CHECK (estado IN ('enviando', 'enviado', 'fallido', 'omitido')),
    intentos INTEGER NOT NULL DEFAULT 0,
    destinatarios INTEGER,
    dispositivos INTEGER,
    ultimo_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    enviado_at TIMESTAMPTZ,
    UNIQUE (fecha_cobro, dias_antes)
);

ALTER TABLE vacaciones_cobros_avisos ENABLE ROW LEVEL SECURITY;
GRANT ALL ON vacaciones_cobros_avisos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE vacaciones_cobros_avisos_id_seq TO service_role;
