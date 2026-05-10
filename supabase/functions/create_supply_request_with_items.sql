-- Ejecutar en Supabase SQL Editor o como migración.
-- Crea un pedido de insumos y sus items en una sola transacción atómica.
-- Si cualquier INSERT falla, Postgres hace ROLLBACK automático y ningún dato queda parcialmente guardado.

CREATE OR REPLACE FUNCTION create_supply_request_with_items(
    p_supervisor_id  integer,
    p_service_id     integer,
    p_notas          text,
    p_urgent         boolean,
    p_items          jsonb   -- array de objetos: [{ "supply_id": int, "cantidad": numeric }, ...]
)
RETURNS integer             -- devuelve el id del pedido creado
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_request_id integer;
    v_item       jsonb;
BEGIN
    -- Validaciones básicas antes de tocar la DB
    IF p_supervisor_id IS NULL OR p_service_id IS NULL THEN
        RAISE EXCEPTION 'supervisor_id y service_id son obligatorios';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El pedido debe incluir al menos un item';
    END IF;

    -- INSERT en supply_requests
    INSERT INTO supply_requests (supervisor_id, service_id, notas, status, urgent)
    VALUES (p_supervisor_id, p_service_id, COALESCE(p_notas, ''), 'pendiente', COALESCE(p_urgent, false))
    RETURNING id INTO v_request_id;

    -- INSERT de cada item usando el id recién generado
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO supply_request_items (request_id, supply_id, cantidad)
        VALUES (
            v_request_id,
            (v_item->>'supply_id')::integer,
            (v_item->>'cantidad')::numeric
        );
    END LOOP;

    RETURN v_request_id;
END;
$$;

-- Permitir que el rol anon/authenticated invoque la función.
-- Ajustá 'authenticated' al rol que corresponda en tu proyecto.
GRANT EXECUTE ON FUNCTION create_supply_request_with_items(integer, integer, text, boolean, jsonb)
    TO authenticated;
