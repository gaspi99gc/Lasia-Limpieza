-- Trabajos programados, sprint 4: que operarios van y el historial de cambios.
--
-- Coordinar un trabajo es conseguir la gente. Hasta ahora se marcaba
-- "coordinado" y nada mas: no quedaba quienes iban. Ahora Operaciones elige
-- los operarios del legajo al coordinar (decidido el 2026-10-05: solo del
-- legajo, y se puede dar por coordinado aunque sean menos de los necesarios).
--
-- Y cada cambio del trabajo queda asentado: si la fecha pasa del 15 al 20, o se
-- baja un operario y entra otro, se ve quien lo hizo y cuando. Igual que en
-- faltas: sin historial, editar se convierte en tapar.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.
-- Correrla ANTES de publicar: la lista de trabajos ya pide los operarios.

-- 1) Los operarios asignados HOY a cada trabajo. Si alguien se baja, se borra
--    la fila: lo que paso queda en trabajos_historial.
CREATE TABLE IF NOT EXISTS trabajos_operarios (
    id BIGSERIAL PRIMARY KEY,

    -- trabajos_programados.id es BIGSERIAL.
    trabajo_id BIGINT NOT NULL REFERENCES trabajos_programados(id) ON DELETE CASCADE,

    -- BIGINT como en faltas y vacaciones, que ya referencian employees(id).
    employee_id BIGINT NOT NULL REFERENCES employees(id),

    asignado_por TEXT,
    asignado_at TIMESTAMPTZ DEFAULT now(),

    -- La misma persona dos veces en el mismo trabajo no tiene sentido.
    UNIQUE (trabajo_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_trabajos_operarios_trabajo ON trabajos_operarios (trabajo_id);

ALTER TABLE trabajos_operarios ENABLE ROW LEVEL SECURITY;
GRANT ALL ON trabajos_operarios TO service_role;
GRANT USAGE, SELECT ON SEQUENCE trabajos_operarios_id_seq TO service_role;

-- 2) Historial: una fila por cambio, con los valores ya escritos como se leen
--    ("15/10/2026", "Pérez, Juan (leg. 123)"), para mostrarlo como frase sin
--    tener que ir a buscar nombres que quiza ya cambiaron.
--
--    campo: creado, titulo, descripcion, fecha, servicio, supervisor,
--           operarios_necesarios, estado, operario_agregado, operario_quitado,
--           anulado
CREATE TABLE IF NOT EXISTS trabajos_historial (
    id BIGSERIAL PRIMARY KEY,
    trabajo_id BIGINT NOT NULL REFERENCES trabajos_programados(id) ON DELETE CASCADE,
    campo TEXT NOT NULL,
    valor_anterior TEXT,
    valor_nuevo TEXT,
    usuario TEXT,               -- sale de la sesion, nunca del cliente
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trabajos_historial_trabajo ON trabajos_historial (trabajo_id);

ALTER TABLE trabajos_historial ENABLE ROW LEVEL SECURITY;
GRANT ALL ON trabajos_historial TO service_role;
GRANT USAGE, SELECT ON SEQUENCE trabajos_historial_id_seq TO service_role;
