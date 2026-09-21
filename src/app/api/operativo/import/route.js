import * as XLSX from 'xlsx';
import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import {
    normText,
    parseOperativoSheet,
    buildEmployeeMatcher,
    buildServiceMatcher,
} from '@/lib/operativo-import';

// Importa el archivo diario del operativo (el mismo xlsx que Operaciones ya
// genera todos los dias). El archivo es la verdad para la ventana de fechas
// que trae: los dias de esa ventana cargados por import previo se reemplazan.

const IMPORT_ROLES = ['operaciones', 'admin'];
const MAX_BYTES = 15 * 1024 * 1024;

async function fetchAll(buildQuery, pageSize = 1000) {
    const all = [];
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await buildQuery().range(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        all.push(...(data || []));
        if (!data || data.length < pageSize) break;
    }
    return all;
}

const chunk = (arr, n) => {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
};

export async function POST(request) {
    const denied = await denyUnlessRole(request, IMPORT_ROLES);
    if (denied) return denied;

    try {
        const form = await request.formData();
        const file = form.get('file');
        if (!file || typeof file.arrayBuffer !== 'function') {
            return Response.json({ error: 'Falta el archivo (campo "file").' }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
            return Response.json({ error: 'El archivo supera los 15 MB.' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const wb = XLSX.read(buffer, { cellStyles: false });
        const sheetName = wb.SheetNames.find(n => normText(n) === 'OPERATIVO');
        if (!sheetName) {
            return Response.json(
                { error: `El archivo no tiene una hoja "OPERATIVO". Hojas: ${wb.SheetNames.join(', ')}` },
                { status: 400 }
            );
        }

        const { fechas, filas } = parseOperativoSheet(XLSX, wb.Sheets[sheetName]);
        if (!filas.length || !fechas.length) {
            return Response.json(
                { error: 'La hoja OPERATIVO no tiene filas de operarios o columnas de fechas reconocibles.' },
                { status: 400 }
            );
        }

        // Catalogos para el match (todos los empleados: uno recien dado de baja
        // puede seguir apareciendo en el archivo un par de dias).
        const employees = await fetchAll(() =>
            supabase.from('employees').select('id, nombre, apellido, estado_empleado').order('id')
        );
        const services = await fetchAll(() => supabase.from('services').select('id, name').order('id'));
        const matchEmployee = buildEmployeeMatcher(employees);
        const matchService = buildServiceMatcher(services);

        const existentes = await fetchAll(() =>
            supabase.from('operativo_puestos').select('id, clave_import, activo').order('id')
        );
        const clavesExistentes = new Set(existentes.map(p => p.clave_import));

        const ahora = new Date().toISOString();
        const sinMatchEmpleados = new Set();
        const sinMatchServicios = new Set();

        const rows = filas.map(f => {
            const emp = f.tipo !== 'vacante' ? matchEmployee(f.nombre) : null;
            const svc = matchService(f.servicio);
            if (f.tipo === 'titular' && !emp) sinMatchEmpleados.add(f.nombre);
            if (!svc) sinMatchServicios.add(f.servicio);
            return {
                servicio_excel: f.servicio,
                direccion_excel: f.direccion,
                service_id: svc?.id ?? null,
                nombre_excel: f.nombre,
                apodo_excel: f.apodo,
                employee_id: emp?.id ?? null,
                celular: f.celular,
                supervisor_nombre: f.supervisor,
                tipo: f.tipo,
                orden: f.orden,
                activo: true,
                clave_import: f.claveImport,
                updated_at: ahora,
            };
        });

        // Upsert de puestos por clave estable.
        const porClave = new Map();
        for (const grupo of chunk(rows, 500)) {
            const { data, error } = await supabase
                .from('operativo_puestos')
                .upsert(grupo, { onConflict: 'clave_import' })
                .select('id, clave_import');
            if (error) throw new Error('upsert puestos: ' + error.message);
            for (const p of data) porClave.set(p.clave_import, p.id);
        }

        // Puestos que ya no figuran en el archivo: dejan de mostrarse.
        const clavesArchivo = new Set(rows.map(r => r.clave_import));
        const aDesactivar = existentes.filter(p => p.activo && !clavesArchivo.has(p.clave_import)).map(p => p.id);
        for (const grupo of chunk(aDesactivar, 200)) {
            const { error } = await supabase
                .from('operativo_puestos')
                .update({ activo: false, updated_at: ahora })
                .in('id', grupo);
            if (error) throw new Error('desactivar puestos: ' + error.message);
        }

        // Celdas: el archivo manda en su ventana. Se borran los dias importados
        // del rango y se reinsertan (las celdas editadas en la app, fuente
        // distinta de 'import', quedan intactas).
        const desde = fechas[0];
        const hasta = fechas[fechas.length - 1];
        const { error: delError } = await supabase
            .from('operativo_dias')
            .delete()
            .gte('fecha', desde)
            .lte('fecha', hasta)
            .eq('fuente', 'import');
        if (delError) throw new Error('limpiar dias: ' + delError.message);

        // Lo que sobrevivio al delete en el rango son celdas editadas en la app:
        // el import no las pisa.
        const editadas = await fetchAll(() =>
            supabase
                .from('operativo_dias')
                .select('puesto_id, fecha')
                .gte('fecha', desde)
                .lte('fecha', hasta)
                .order('id')
        );
        const clavesEditadas = new Set(editadas.map(d => `${d.puesto_id}|${d.fecha?.slice(0, 10)}`));

        const celdas = [];
        for (const f of filas) {
            const puestoId = porClave.get(f.claveImport);
            if (!puestoId) continue;
            for (const [fecha, c] of Object.entries(f.celdas)) {
                if (clavesEditadas.has(`${puestoId}|${fecha}`)) continue;
                celdas.push({
                    puesto_id: puestoId,
                    fecha,
                    hi: c.hi,
                    he: c.he,
                    nota: c.nota,
                    fuente: 'import',
                    updated_at: ahora,
                });
            }
        }
        for (const grupo of chunk(celdas, 500)) {
            const { error } = await supabase.from('operativo_dias').insert(grupo);
            if (error) throw new Error('insertar dias: ' + error.message);
        }

        return Response.json({
            archivo: file.name,
            desde,
            hasta,
            dias: fechas.length,
            puestos: rows.length,
            puestosNuevos: rows.filter(r => !clavesExistentes.has(r.clave_import)).length,
            puestosDesactivados: aDesactivar.length,
            celdas: celdas.length,
            sinMatchEmpleados: [...sinMatchEmpleados].sort(),
            sinMatchServicios: [...sinMatchServicios].sort(),
        });
    } catch (error) {
        console.error('Error importando operativo:', error);
        return Response.json({ error: 'No se pudo importar: ' + error.message }, { status: 500 });
    }
}
