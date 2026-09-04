-- Registro de faltas de operarios.
--
-- Hoy una sola ausencia se escribe a mano en cuatro planillas distintas: quien
-- falto (AUSENTES), quien lo cubrio y cuanto se le paga (EXTRAS de la quincena),
-- si quedo sin cubrir y cuanto se le descuenta al cliente (NOVEDADES), y el
-- operativo del dia queda desactualizado. La idea es registrar el hecho UNA vez
-- y que de ahi salgan los cuatro numeros.
--
-- Etapa 1 (esta): solo registrar la falta. Las columnas de cobertura quedan
-- creadas pero sin usar, para no necesitar otra migracion cuando se sumen.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

CREATE TABLE IF NOT EXISTS faltas (
    id BIGSERIAL PRIMARY KEY,
    fecha DATE NOT NULL,

    -- A quien le falto. employee_id puede ser null si el nombre del operativo no
    -- matchea ningun legajo; el nombre crudo se guarda igual para no perder el dato.
    employee_id BIGINT REFERENCES employees(id),
    nombre_excel TEXT,

    -- De donde falto. Sale del operativo del dia, por eso se guarda el puesto.
    puesto_id BIGINT REFERENCES operativo_puestos(id),
    service_id BIGINT REFERENCES services(id),
    servicio_excel TEXT,

    -- Horas que se perdieron, precargadas del horario que tenia ese dia.
    horas NUMERIC(5, 2),

    -- Si aviso o no aviso cambia como se trata la falta, no es un detalle.
    aviso BOOLEAN NOT NULL DEFAULT true,
    motivo TEXT NOT NULL DEFAULT 'sin_especificar'
        CHECK (motivo IN ('enfermedad', 'personal', 'sin_aviso', 'accidente', 'sin_especificar')),
    nota TEXT,

    -- Etapa 2: cobertura. Sin uso todavia.
    estado_cobertura TEXT NOT NULL DEFAULT 'pendiente'
        CHECK (estado_cobertura IN ('pendiente', 'cubierta', 'sin_cubrir')),
    cubierto_por_employee_id BIGINT REFERENCES employees(id),
    cubierto_por_nombre TEXT,

    registrado_por TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- La misma persona no puede faltar dos veces el mismo dia en el mismo puesto.
    UNIQUE (fecha, employee_id, puesto_id)
);

CREATE INDEX IF NOT EXISTS idx_faltas_fecha ON faltas(fecha);
CREATE INDEX IF NOT EXISTS idx_faltas_employee ON faltas(employee_id);
CREATE INDEX IF NOT EXISTS idx_faltas_service ON faltas(service_id);

ALTER TABLE faltas ENABLE ROW LEVEL SECURITY;
GRANT ALL ON faltas TO service_role;
GRANT USAGE, SELECT ON SEQUENCE faltas_id_seq TO service_role;
