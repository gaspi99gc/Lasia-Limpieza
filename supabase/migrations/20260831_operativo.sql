-- ============================================================================
-- OPERATIVO de operarios (Etapa 1: espejo del Excel de Operaciones).
--
-- El "operativo" es el Excel maestro del area de Operaciones: una fila por
-- operario-puesto y dos columnas por dia (hora ingreso / hora egreso, en
-- decimal: 6=06:00, 8.5=08:30, y >24 para turnos que cruzan medianoche:
-- 22->30 = 22:00 a 06:00). La app lo importa y lo muestra; el Excel sigue
-- siendo la fuente de verdad hasta la Etapa 2.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run.
-- Es idempotente: se puede correr varias veces sin problema.
-- ============================================================================

-- La fila del operativo. Un puesto puede no tener persona (vacante) y una
-- persona puede tener varios puestos (dos servicios, o titular + adicional).
-- Los campos *_excel guardan el texto crudo del archivo: el match contra
-- services/employees es enriquecimiento, no requisito para mostrar.
CREATE TABLE IF NOT EXISTS operativo_puestos (
    id BIGSERIAL PRIMARY KEY,
    servicio_excel TEXT NOT NULL,
    direccion_excel TEXT,
    service_id BIGINT REFERENCES services(id),
    nombre_excel TEXT,
    apodo_excel TEXT,
    employee_id BIGINT REFERENCES employees(id),
    celular TEXT,
    supervisor_nombre TEXT,
    tipo TEXT NOT NULL DEFAULT 'titular'
        CHECK (tipo IN ('titular', 'adicional_fijo', 'extra', 'vacante')),
    orden INT,
    activo BOOLEAN NOT NULL DEFAULT true,
    -- Clave estable para el upsert entre importaciones diarias:
    -- norm(servicio)|norm(nombre)|ocurrencia (por si el mismo par se repite).
    clave_import TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- La celda: que hace ese puesto ese dia. hi/he en horas decimales, he puede
-- superar 24 cuando el turno cruza medianoche. Celda sin hi/he pero con nota
-- = texto no numerico que venia en el Excel (licencia, aviso, etc.).
CREATE TABLE IF NOT EXISTS operativo_dias (
    id BIGSERIAL PRIMARY KEY,
    puesto_id BIGINT NOT NULL REFERENCES operativo_puestos(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    hi NUMERIC(5, 2),
    he NUMERIC(5, 2),
    estado TEXT CHECK (estado IN ('normal', 'ausente', 'tarde')),
    minutos_tarde INT,
    nota TEXT,
    fuente TEXT NOT NULL DEFAULT 'import',
    updated_by TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (puesto_id, fecha)
);

-- Libro mayor historico de presentismo (hoja PRESENTISMO del Excel, desde
-- dic-2023). Se carga una sola vez por script; alimenta ausentismo/rotacion.
CREATE TABLE IF NOT EXISTS presentismo_historico (
    id BIGSERIAL PRIMARY KEY,
    fecha DATE NOT NULL,
    servicio_excel TEXT,
    direccion_excel TEXT,
    service_id BIGINT REFERENCES services(id),
    operario_excel TEXT,
    employee_id BIGINT REFERENCES employees(id),
    hi NUMERIC(5, 2),
    he NUMERIC(5, 2),
    total_hs NUMERIC(5, 2)
);

CREATE INDEX IF NOT EXISTS idx_operativo_puestos_service ON operativo_puestos(service_id);
CREATE INDEX IF NOT EXISTS idx_operativo_puestos_employee ON operativo_puestos(employee_id);
CREATE INDEX IF NOT EXISTS idx_operativo_dias_fecha ON operativo_dias(fecha);
CREATE INDEX IF NOT EXISTS idx_presentismo_hist_fecha ON presentismo_historico(fecha);
CREATE INDEX IF NOT EXISTS idx_presentismo_hist_employee ON presentismo_historico(employee_id);

-- RLS + grants: la app entra con service_role (BYPASSRLS); anon/authenticated
-- quedan bloqueados por deny-by-default al no haber politicas.
ALTER TABLE operativo_puestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE operativo_dias ENABLE ROW LEVEL SECURITY;
ALTER TABLE presentismo_historico ENABLE ROW LEVEL SECURITY;

GRANT ALL ON operativo_puestos TO service_role;
GRANT ALL ON operativo_dias TO service_role;
GRANT ALL ON presentismo_historico TO service_role;
GRANT USAGE, SELECT ON SEQUENCE operativo_puestos_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE operativo_dias_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE presentismo_historico_id_seq TO service_role;
