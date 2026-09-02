import * as XLSX from 'xlsx';
import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';

// Importa el relevamiento de domicilio y contacto de emergencia.
//
// Formato del Excel (5 columnas, con o sin fila de encabezado):
//   1 CUIL | 2 Nombre (solo control visual, no se importa) | 3 Domicilio
//   4 Telefono de emergencia | 5 De quien es ese contacto (madre, esposo...)
//
// El match es por CUIL, que es lo unico inequivoco. La columna del nombre esta
// para que quien arma el Excel vea a quien le esta cargando los datos; aca se
// usa solo para avisar si no coincide con el legajo, no para buscar.
//
// Las celdas vacias NO pisan lo que ya haya cargado: el relevamiento viene por
// tandas y a veces se consigue el telefono antes que el domicilio.

const ALLOWED_ROLES = ['admin', 'rrhh', 'jefe_operativo'];
const MAX_BYTES = 5 * 1024 * 1024;

const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const texto = (v) => {
    const s = String(v ?? '').trim();
    return s || null;
};
const normNombre = (s) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();

export async function POST(request) {
    const denied = await denyUnlessRole(request, ALLOWED_ROLES);
    if (denied) return denied;

    try {
        const form = await request.formData();
        const file = form.get('file');
        if (!file || typeof file.arrayBuffer !== 'function') {
            return Response.json({ error: 'Falta el archivo.' }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
            return Response.json({ error: 'El archivo supera los 5 MB.' }, { status: 400 });
        }

        const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' });
        const hoja = wb.Sheets[wb.SheetNames[0]];
        if (!hoja) return Response.json({ error: 'El archivo no tiene ninguna hoja.' }, { status: 400 });

        const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '', raw: false });
        if (!filas.length) return Response.json({ error: 'La hoja está vacía.' }, { status: 400 });

        // Si la primera fila no tiene un CUIL en la columna 1, es el encabezado.
        const primeraEsHeader = soloDigitos(filas[0]?.[0]).length < 10;
        const datos = primeraEsHeader ? filas.slice(1) : filas;

        // Empleados por CUIL (los CUIL de la base pueden venir con guiones).
        const { data: empleados, error: errEmp } = await supabase
            .from('employees')
            .select('id, legajo, nombre, apellido, cuil, direccion, contacto_emergencia_telefono, contacto_emergencia_vinculo')
            .not('cuil', 'is', null);
        if (errEmp) throw new Error(errEmp.message);

        const porCuil = new Map();
        for (const e of empleados) {
            const c = soloDigitos(e.cuil);
            if (c) porCuil.set(c, e);
        }

        const actualizados = [];
        const sinMatch = [];
        const sinDatos = [];
        const nombreDistinto = [];

        for (const fila of datos) {
            const cuil = soloDigitos(fila[0]);
            const nombreExcel = texto(fila[1]);
            const domicilio = texto(fila[2]);
            const telefono = texto(fila[3]);
            const vinculo = texto(fila[4]);

            if (!cuil) continue;

            const emp = porCuil.get(cuil);
            if (!emp) {
                sinMatch.push({ cuil, nombre: nombreExcel });
                continue;
            }

            // Solo se escribe lo que viene con contenido: una celda vacía no
            // borra un dato ya cargado.
            const cambios = {};
            if (domicilio) cambios.direccion = domicilio;
            if (telefono) cambios.contacto_emergencia_telefono = telefono;
            if (vinculo) cambios.contacto_emergencia_vinculo = vinculo.toUpperCase();

            if (!Object.keys(cambios).length) {
                sinDatos.push({ cuil, nombre: `${emp.apellido} ${emp.nombre}` });
                continue;
            }

            const { error } = await supabase.from('employees').update(cambios).eq('id', emp.id);
            if (error) throw new Error(`al actualizar el legajo ${emp.legajo}: ${error.message}`);

            // Aviso (no bloquea): el nombre del Excel no se parece al del legajo.
            if (nombreExcel) {
                const a = normNombre(nombreExcel);
                const b = normNombre(`${emp.apellido} ${emp.nombre}`);
                const tokensA = a.split(' ').filter(t => t.length > 2);
                const comparte = tokensA.some(t => b.includes(t));
                if (!comparte) {
                    nombreDistinto.push({ cuil, excel: nombreExcel, legajo: `${emp.apellido} ${emp.nombre}` });
                }
            }

            actualizados.push({
                legajo: emp.legajo,
                nombre: `${emp.apellido} ${emp.nombre}`,
                campos: Object.keys(cambios).length,
                domicilio: !!domicilio,
                telefono: !!telefono,
            });
        }

        return Response.json({
            archivo: file.name,
            filasLeidas: datos.filter(f => soloDigitos(f[0])).length,
            actualizados,
            sinMatch,
            sinDatos,
            nombreDistinto,
        });
    } catch (error) {
        console.error('Error importando contactos de emergencia:', error);
        return Response.json({ error: 'No se pudo importar: ' + error.message }, { status: 500 });
    }
}
