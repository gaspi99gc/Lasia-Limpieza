-- Run this in Supabase SQL Editor if tables don't exist yet.
-- PostgreSQL version of the LASIA schema.

CREATE TABLE IF NOT EXISTS supervisors (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    surname TEXT NOT NULL,
    dni TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    login_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    password_updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS services (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    lat REAL,
    lng REAL
);

CREATE TABLE IF NOT EXISTS employees (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legajo TEXT UNIQUE,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL,
    dni TEXT,
    cuil TEXT,
    fecha_ingreso DATE,
    fecha_fin_prueba DATE,
    servicio_id BIGINT REFERENCES services(id),
    supervisor_id BIGINT REFERENCES supervisors(id),
    estado_empleado TEXT DEFAULT 'Activo',
    fecha_baja DATE,
    motivo_baja TEXT
);

CREATE TABLE IF NOT EXISTS document_types (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL,
    requiere_vencimiento BOOLEAN DEFAULT FALSE,
    dias_alerta INTEGER DEFAULT 30,
    obligatorio BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS employee_documents (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empleado_id BIGINT REFERENCES employees(id),
    documento_tipo_id BIGINT REFERENCES document_types(id),
    archivo_url TEXT,
    archivo_nombre TEXT,
    fecha_carga DATE,
    fecha_vencimiento DATE
);

CREATE TABLE IF NOT EXISTS attendance (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supervisor_id BIGINT REFERENCES supervisors(id),
    service_id BIGINT REFERENCES services(id),
    type TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    distance_meters REAL,
    zone TEXT DEFAULT 'red'
);

CREATE TABLE IF NOT EXISTS supervisor_status (
    supervisor_id BIGINT PRIMARY KEY REFERENCES supervisors(id),
    status TEXT NOT NULL DEFAULT 'afuera',
    current_service_id BIGINT REFERENCES services(id),
    entered_at TIMESTAMPTZ,
    entered_lat REAL,
    entered_lng REAL,
    exited_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supervisor_presentismo_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supervisor_id BIGINT NOT NULL REFERENCES supervisors(id),
    service_id BIGINT NOT NULL REFERENCES services(id),
    event_type TEXT NOT NULL,
    event_lat REAL,
    event_lng REAL,
    occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supervisor_routes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supervisor_id BIGINT REFERENCES supervisors(id),
    service_id BIGINT REFERENCES services(id),
    route_order INTEGER NOT NULL,
    UNIQUE(supervisor_id, service_id)
);

CREATE TABLE IF NOT EXISTS supplies (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL,
    unidad TEXT DEFAULT 'unidades',
    activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS providers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS supply_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supervisor_id BIGINT REFERENCES supervisors(id),
    service_id BIGINT REFERENCES services(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    notas TEXT,
    status TEXT NOT NULL DEFAULT 'pendiente',
    urgent BOOLEAN DEFAULT FALSE,
    provider_id BIGINT REFERENCES providers(id),
    completed_by TEXT,
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS supply_request_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id BIGINT REFERENCES supply_requests(id),
    supply_id BIGINT REFERENCES supplies(id),
    cantidad REAL NOT NULL,
    faltante BOOLEAN NOT NULL DEFAULT false,
    agregado BOOLEAN NOT NULL DEFAULT false,
    marcado_por TEXT,
    marcado_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    accion TEXT,
    entidad TEXT,
    entidad_id BIGINT,
    detalle TEXT
);

CREATE TABLE IF NOT EXISTS app_users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    surname TEXT NOT NULL,
    role TEXT NOT NULL,
    login_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    supervisor_id BIGINT REFERENCES supervisors(id)
);

CREATE TABLE IF NOT EXISTS licenses (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id),
    type TEXT NOT NULL CHECK(type IN ('vacaciones', 'enfermedad', 'maternidad', 'paternidad', 'psiquiatrica', 'sin_goce')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'activa' CHECK(status IN ('activa', 'finalizada', 'cancelada')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default providers
INSERT INTO providers (name, active)
VALUES
    ('Proveedor General', TRUE),
    ('Proveedor Express', TRUE),
    ('Proveedor Mayorista', TRUE)
ON CONFLICT (name) DO NOTHING;
