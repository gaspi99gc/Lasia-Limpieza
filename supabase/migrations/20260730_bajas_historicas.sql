-- Bajas históricas para el análisis de rotación (dashboard de dirección).
-- Fuente: Excel de RRHH cruzado con presentismo (Informe_bajas_1S_2026).
-- Tabla SEPARADA de employees: son bajas históricas que en su mayoría nunca
-- estuvieron cargadas como empleados. No se mezcla con la operación actual.
CREATE TABLE IF NOT EXISTS bajas_historicas (
    id SERIAL PRIMARY KEY,
    cuil TEXT,
    apellido_nombre TEXT NOT NULL,
    fecha_ingreso DATE,
    ultimo_dia DATE,               -- último día trabajado real (del presentismo)
    servicio_baja TEXT,            -- servicio donde acumuló más horas en sus últimos 30 días
    servicio_principal TEXT,       -- servicio histórico principal
    dias_trabajados INTEGER,
    antiguedad_dias INTEGER,       -- ultimo_dia - fecha_ingreso (aprox)
    motivo_baja TEXT,              -- de la base employees si matchea, o a cargar luego
    sin_inicio_efectivo BOOLEAN DEFAULT false, -- alta pero nunca fichó (SIN REGISTRO)
    estado_cruce TEXT,             -- OK / OK (nombre corregido) / REVISAR / SIN REGISTRO
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bajas_historicas_ultimo_dia ON bajas_historicas(ultimo_dia);
CREATE INDEX IF NOT EXISTS idx_bajas_historicas_servicio ON bajas_historicas(servicio_baja);

-- La app accede con la service role key.
GRANT ALL ON TABLE bajas_historicas TO service_role;
GRANT USAGE, SELECT ON SEQUENCE bajas_historicas_id_seq TO service_role;
