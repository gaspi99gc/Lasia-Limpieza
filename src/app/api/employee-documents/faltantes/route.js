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

        // 2) Empleados activos (con su servicio para mostrarlo en la lista).
        // Los campos del contacto de emergencia son nuevos: si la migración
        // todavía no corrió, la consulta falla. Se reintenta sin ellos para no
        // romper la vista de documentación, que no depende de esos datos.
        const SELECT_BASE = 'id, apellido, nombre, legajo, servicio_id, direccion, services:servicio_id(name)';
        const soloActivos = (q) => q.eq('estado_empleado', 'Activo');
        let activos;
        let hayContactoEmergencia = true;
        try {
            activos = await fetchAll(
                'employees',
                `${SELECT_BASE}, contacto_emergencia_telefono`,
                soloActivos,
            );
        } catch {
            hayContactoEmergencia = false;
            activos = await fetchAll('employees', SELECT_BASE, soloActivos);
        }

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

        // 5) Datos del legajo que no son documentos adjuntos pero también faltan:
        // el relevamiento de domicilio y contacto de emergencia, y el servicio
        // asignado. Misma forma que porTipo para reusar la lista y el Excel.
        const aFila = (e) => ({
            id: e.id,
            apellido: e.apellido || '',
            nombre: e.nombre || '',
            legajo: e.legajo || '',
            servicio: e.services?.name || null,
        });
        const porNombre = (a, b) => `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, 'es');

        const definiciones = [
            { dato_key: 'domicilio', nombre: 'Domicilio', falta: (e) => !e.direccion },
            ...(hayContactoEmergencia
                ? [{ dato_key: 'emergencia', nombre: 'Contacto de emergencia', falta: (e) => !e.contacto_emergencia_telefono }]
                : []),
            { dato_key: 'servicio', nombre: 'Sin servicio asignado', falta: (e) => !e.servicio_id },
        ];

        const porDato = definiciones.map(d => {
            const faltan = activos.filter(d.falta);
            return {
                dato_key: d.dato_key,
                nombre: d.nombre,
                tienen: totalActivos - faltan.length,
                faltan: faltan.length,
                faltantes: faltan.map(aFila).sort(porNombre),
            };
        });

        return Response.json({ totalActivos, porTipo, porDato });
    } catch (error) {
        console.error('Error en employee-documents/faltantes:', error);
        return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
}
