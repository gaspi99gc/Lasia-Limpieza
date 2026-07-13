-- Casos legales de la empresa (gestionados por RRHH). La persona/entidad es
-- texto libre (no atada a un legajo). El estado tambien es texto libre.
CREATE TABLE IF NOT EXISTS legal_cases (
    id SERIAL PRIMARY KEY,
    persona TEXT NOT NULL,
    caratula TEXT,
    estado TEXT,
    fecha_inicio DATE,
    fecha_audiencia DATE,
    fecha_cierre DATE,
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- La app accede con la service role key; sin estos GRANT la insercion falla con
-- "permission denied for table ..." (code 42501) aunque la tabla exista.
GRANT ALL ON TABLE legal_cases TO service_role;
GRANT USAGE, SELECT ON SEQUENCE legal_cases_id_seq TO service_role;
