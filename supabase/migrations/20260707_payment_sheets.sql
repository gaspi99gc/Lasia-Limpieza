-- Planillas de pago: cada una es un pago puntual (adicional, horas extras,
-- liquidacion final o adelanto) con una lista de operarios (texto libre) y su
-- monto. El total se calcula sumando las lineas.

CREATE TABLE IF NOT EXISTS payment_sheets (
    id SERIAL PRIMARY KEY,
    tipo TEXT NOT NULL
        CHECK (tipo IN ('adicional', 'horas_extras', 'liquidacion_final', 'adelanto')),
    nombre TEXT NOT NULL,
    fecha DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_sheet_lines (
    id SERIAL PRIMARY KEY,
    sheet_id INTEGER NOT NULL REFERENCES payment_sheets(id) ON DELETE CASCADE,
    operario TEXT NOT NULL,
    monto NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_sheet_lines_sheet_id ON payment_sheet_lines(sheet_id);

-- La app accede con la service role key; sin estos GRANT la insercion falla con
-- "permission denied for table ..." (code 42501) aunque las tablas existan.
GRANT ALL ON TABLE payment_sheets TO service_role;
GRANT USAGE, SELECT ON SEQUENCE payment_sheets_id_seq TO service_role;

GRANT ALL ON TABLE payment_sheet_lines TO service_role;
GRANT USAGE, SELECT ON SEQUENCE payment_sheet_lines_id_seq TO service_role;
