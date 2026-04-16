-- Supervisores (login por DNI + contrasena)
CREATE TABLE supervisors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  surname TEXT NOT NULL,
  dni TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  login_enabled INTEGER NOT NULL DEFAULT 1,
  password_updated_at DATETIME
);

-- Servicios (con coordenadas GPS para geofencing)
CREATE TABLE services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  lat REAL,
  lng REAL
);

-- Empleados
CREATE TABLE employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  legajo TEXT UNIQUE,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  dni TEXT,
  cuil TEXT,
  fecha_ingreso DATE,
  fecha_fin_prueba DATE,
  servicio_id INTEGER REFERENCES services(id),
  supervisor_id INTEGER REFERENCES supervisors(id),
  estado_empleado TEXT DEFAULT 'Activo',
  fecha_baja DATE,
  motivo_baja TEXT
);

-- Tipos de documento
CREATE TABLE document_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  requiere_vencimiento BOOLEAN DEFAULT 0,
  dias_alerta INTEGER DEFAULT 30,
  obligatorio BOOLEAN DEFAULT 0
);

-- Documentos de empleados
CREATE TABLE employee_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empleado_id INTEGER REFERENCES employees(id),
  documento_tipo_id INTEGER REFERENCES document_types(id),
  archivo_url TEXT,
  archivo_nombre TEXT,
  fecha_carga DATE,
  fecha_vencimiento DATE
);

-- ★ NUEVO: Fichadas (Presentismo GPS)
CREATE TABLE attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supervisor_id INTEGER REFERENCES supervisors(id),
  service_id INTEGER REFERENCES services(id),
  type TEXT NOT NULL, -- 'check-in' | 'check-out'
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  verified BOOLEAN DEFAULT 0, -- true si estaba a <200m del servicio
  distance_meters REAL, -- distancia real al servicio
  zone TEXT DEFAULT 'red' -- 'green' (<= 200m), 'yellow' (201-500m), 'red' (> 500m)
);

-- Estado actual del supervisor para presentismo en tiempo real
CREATE TABLE supervisor_status (
  supervisor_id INTEGER PRIMARY KEY REFERENCES supervisors(id),
  status TEXT NOT NULL DEFAULT 'afuera',
  current_service_id INTEGER REFERENCES services(id),
  entered_at DATETIME,
  entered_lat REAL,
  entered_lng REAL,
  exited_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Log historico de presentismo del supervisor
CREATE TABLE supervisor_presentismo_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supervisor_id INTEGER NOT NULL REFERENCES supervisors(id),
  service_id INTEGER NOT NULL REFERENCES services(id),
  event_type TEXT NOT NULL,
  event_lat REAL,
  event_lng REAL,
  occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ★ NUEVO: Recorridos de supervisores (servicios asignados en orden)
CREATE TABLE supervisor_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supervisor_id INTEGER REFERENCES supervisors(id),
  service_id INTEGER REFERENCES services(id),
  route_order INTEGER NOT NULL,
  UNIQUE(supervisor_id, service_id)
);

-- ★ NUEVO: Insumos (lista fija, admin configurable)
CREATE TABLE supplies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  unidad TEXT DEFAULT 'unidades', -- 'litros', 'kg', 'unidades', etc.
  activo BOOLEAN DEFAULT 1
);

-- Proveedores registrados para compras
CREATE TABLE providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN DEFAULT 1
);

-- ★ NUEVO: Relevamientos (pedidos semanales)
CREATE TABLE supply_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supervisor_id INTEGER REFERENCES supervisors(id),
  service_id INTEGER REFERENCES services(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notas TEXT,
  status TEXT NOT NULL DEFAULT 'pendiente',
  urgent BOOLEAN DEFAULT 0,
  provider_id INTEGER REFERENCES providers(id),
  completed_by TEXT,
  completed_at DATETIME
);

-- ★ NUEVO: Items del relevamiento
CREATE TABLE supply_request_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER REFERENCES supply_requests(id),
  supply_id INTEGER REFERENCES supplies(id),
  cantidad REAL NOT NULL
);

-- Auditoría
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  accion TEXT,
  entidad TEXT,
  entidad_id INTEGER,
  detalle TEXT
);

-- Usuarios de aplicación centralizados (admin, purchases, supervisor)
CREATE TABLE app_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  surname TEXT NOT NULL,
  role TEXT NOT NULL, -- 'admin' | 'purchases' | 'supervisor'
  login_enabled INTEGER NOT NULL DEFAULT 1,
  supervisor_id INTEGER REFERENCES supervisors(id) -- solo para role='supervisor'
);
