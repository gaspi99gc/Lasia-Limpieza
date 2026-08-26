import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';

export const runtime = 'nodejs';

// Estadística de documentación faltante de los empleados ACTIVOS.
// Por cada tipo de documento, cuántos activos lo tienen cargado y cuántos no.
// Devuelve además la lista de quiénes NO tienen cada documento (para gestionarlo).
// Lo ve RRHH y conducción (no operativos ni compras).
const ROLES = ['admin', 'rrhh', 'direccion', 'jefe_operativo'];

const PAGE = 1000;
async function fetchAll(table, sel, applyRange) {
    const all = [];
    for (let from = 0; ; from += PAGE) {
        let q = supabase.from(table).select(sel).range(from, from + PAGE - 1);
        if (applyRange) q = applyRange(q);
        const { data, error } = await q;
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < PAGE) break;
    }
    return all;
}

export async function GET(req) {
    try {
        const denied = await denyUnlessRole(req, ROLES);
        if (denied) return denied;

        // 1) Tipos de documento
        const { data: tipos, error: eTipos } = await supabase
            .from('document_types')
            .select('id, nombre, obligatorio')
            .order('id', { ascending: true });
        if (eTipos) throw eTipos;

        // 2) Empleados activos (con su servicio para mostrarlo en la lista)
        const activos = await fetchAll(
            'employees',
            'id, apellido, nombre, legajo, servicio_id, services:servicio_id(name)',
            (q) => q.eq('estado_empleado', 'Activo'),
        );

        // 3) Qué documentos tiene cada empleado (empleado_id + documento_tipo_id).
        // Un empleado "tiene" un tipo si existe al menos una fila con archivo (file_path).
        const docs = await fetchAll('employee_documents', 'empleado_id, documento_tipo_id, file_path');
        const tienePar = new Set(
            docs.filter(d => d.file_path).map(d => `${d.empleado_id}|${d.documento_tipo_id}`)
        );

        const totalActivos = activos.length;

        // 4) Resumen por tipo + lista de faltantes por tipo
        const porTipo = tipos.map(t => {
            const faltan = activos.filter(e => !tienePar.has(`${e.id}|${t.id}`));
            return {
                tipo_id: t.id,
                nombre: t.nombre,
                obligatorio: !!t.obligatorio,
                tienen: totalActivos - faltan.length,
                faltan: faltan.length,
                // Lista de los que NO tienen este documento.
                faltantes: faltan
                    .map(e => ({
                        id: e.id,
                        apellido: e.apellido || '',
                        nombre: e.nombre || '',
                        legajo: e.legajo || '',
                        servicio: e.services?.name || null,
                    }))
                    .sort((a, b) => `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, 'es')),
            };
        });

        return Response.json({ totalActivos, porTipo });
    } catch (error) {
        console.error('Error en employee-documents/faltantes:', error);
        return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
}
