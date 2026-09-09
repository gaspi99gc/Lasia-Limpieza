import * as XLSX from 'xlsx';
import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { getSessionFromRequest } from '@/lib/authCookie';
import { buildEmployeeMatcher, normText } from '@/lib/operativo-import';

// Importa la hoja AUSENTES del PRESENTISMO desde la pantalla de Faltas.
//
// Mientras la encargada siga anotando las faltas en la planilla, esa planilla es
// la fuente real y hay que poder traerla cada tanto. Esto es convivencia
// deliberada, no algo transitorio: el sistema se lleva bien con que le carguen
// lo mismo dos veces.
//
// El PRESENTISMO entero pesa 30 MB (cuatro hojas del año) y ademas tarda 16
// segundos en abrirse. Vercel corta las subidas en ~4,5 MB, asi que se sube la
// hoja AUSENTES sola: son ~290 KB y abre al instante. Si alguien manda el
// archivo completo igual, el error se lo explica en vez de tirar un 413 pelado.
//
// Trabaja en dos pasos: primero devuelve el resumen de lo que haria (preview) y
// solo escribe cuando el que lo mando confirma. Nadie carga a ciegas.

const ROLES_IMPORT = ['operaciones', 'admin'];

// La hoja sola pesa ~290 KB; 5 MB deja lugar de sobra sin permitir el archivo
// entero de 30 MB, que igual no pasaria por Vercel.
const MAX_BYTES = 5 * 1024 * 1024;

// La hoja escribe las fechas como "3-Sep", sin año. El archivo es el del año en
// curso y la serie va de enero en adelante sin cortes, asi que se asume ese año.
const MES = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

// Convierte el numero de serie de Excel (dias desde 1899-12-30) a YYYY-MM-DD.
function desdeSerialExcel(n) {
    const ms = Math.round((n - 25569) * 86400 * 1000); // 25569 = 1970-01-01 en serie Excel
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    const anio = d.getUTCFullYear();
    if (anio < 2020 || anio > 2100) return null; // no era una fecha
    return `${anio}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function parseFecha(s, anio) {
    const txt = String(s || '').trim();
    if (!txt) return null;

    // Excel a veces la entrega ya como fecha real (2026-09-03).
    const iso = txt.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    // Al guardar la hoja sola se pierde el formato de fecha y las celdas vienen
    // como numero de serie ("46023"). Es el caso normal del archivo recortado.
    if (/^\d{5}$/.test(txt)) return desdeSerialExcel(Number(txt));

    // Como se ve en el archivo original: "3-Sep", sin año.
    const m = txt.match(/^(\d{1,2})-([A-Za-z]{3})/);
    if (!m) return null;
    const mes = MES[m[2].toLowerCase()];
    return mes ? `${anio}-${String(mes).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}` : null;
}

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

async function quienEs(session) {
    let quien = session?.role || null;
    if (session?.appUserId) {
        const { data: u } = await supabase
            .from('app_users')
            .select('name, surname, username')
            .eq('id', session.appUserId)
            .maybeSingle();
        if (u) quien = [u.name, u.surname].filter(Boolean).join(' ').trim() || u.username || quien;
    }
    return quien;
}

export async function POST(request) {
    const denied = await denyUnlessRole(request, ROLES_IMPORT);
    if (denied) return denied;

    try {
        const form = await request.formData();
        const file = form.get('file');
        const confirmar = String(form.get('confirmar') || '') === '1';
        const desde = String(form.get('desde') || '').trim();
        const hasta = String(form.get('hasta') || '').trim();

        if (!file || typeof file.arrayBuffer !== 'function') {
            return Response.json({ error: 'Falta el archivo.' }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
            return Response.json({
                error: 'El archivo es demasiado grande. Parece el PRESENTISMO completo: '
                    + 'abrilo, hacé clic derecho en la pestaña AUSENTES → Mover o copiar → '
                    + 'Nuevo libro, y guardá esa hoja sola. Queda en menos de 1 MB.',
            }, { status: 400 });
        }
        if ((desde && !FECHA_RE.test(desde)) || (hasta && !FECHA_RE.test(hasta))) {
            return Response.json({ error: 'Rango de fechas inválido.' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const wb = XLSX.read(buffer, { cellStyles: false });
        const nombreHoja = wb.SheetNames.find(n => normText(n) === 'AUSENTES') || wb.SheetNames[0];
        if (!nombreHoja) {
            return Response.json({ error: 'El archivo no tiene ninguna hoja.' }, { status: 400 });
        }

        const filasCrudas = XLSX.utils
            .sheet_to_json(wb.Sheets[nombreHoja], { header: 1, defval: '', raw: false })
            .slice(1); // la primera fila son los encabezados

        // El año sale del nombre del archivo si está ("PRESENTISMO 2026"); si no,
        // del año en curso. La hoja no lo trae en cada fila.
        const delNombre = String(file.name || '').match(/(20\d{2})/);
        const anio = delNombre ? Number(delNombre[1]) : new Date().getFullYear();

        const registros = [];
        let fueraDeRango = 0;
        for (const r of filasCrudas) {
            const fecha = parseFecha(r[0], anio);
            const nombre = String(r[1] || '').trim();
            if (!fecha || !nombre) continue;
            if ((desde && fecha < desde) || (hasta && fecha > hasta)) { fueraDeRango++; continue; }

            // El motivo está disperso: a veces en la 4ta columna, a veces mezclado
            // con las horas en la 3ra ("4 HS ADICIONAL"). "ADICIONAL" quiere decir
            // que faltó al servicio adicional, no al principal.
            const c3 = String(r[2] || '').trim();
            const c4 = String(r[3] || '').trim();
            const horas = Number(c3.replace(',', '.'));
            const nota = [Number.isFinite(horas) ? '' : c3, c4].filter(Boolean).join(' · ') || null;

            registros.push({ fecha, nombre, horas: Number.isFinite(horas) ? horas : null, nota });
        }

        if (!registros.length) {
            return Response.json({
                error: `No encontré filas de ausencias en la hoja "${nombreHoja}". `
                    + 'Se esperan las columnas: fecha, nombre, horas.',
            }, { status: 400 });
        }

        // La planilla repite alguna fila (misma persona el mismo día).
        const vistos = new Set();
        const unicos = [];
        let repetidasEnPlanilla = 0;
        for (const r of registros) {
            const k = `${r.fecha}|${normText(r.nombre)}`;
            if (vistos.has(k)) { repetidasEnPlanilla++; continue; }
            vistos.add(k);
            unicos.push(r);
        }

        const fechas = unicos.map(r => r.fecha).sort();
        const rangoDesde = fechas[0];
        const rangoHasta = fechas[fechas.length - 1];

        const employees = await fetchAll(() =>
            supabase.from('employees').select('id, nombre, apellido, estado_empleado').order('id')
        );
        const match = buildEmployeeMatcher(employees);
        const cache = new Map();

        const conLegajo = [];
        const sinLegajo = new Map();
        for (const r of unicos) {
            if (!cache.has(r.nombre)) cache.set(r.nombre, match(r.nombre)?.id ?? null);
            const id = cache.get(r.nombre);
            if (!id) { sinLegajo.set(r.nombre, (sinLegajo.get(r.nombre) || 0) + 1); continue; }
            conLegajo.push({ ...r, employee_id: id });
        }

        // Lo que ya está cargado en el rango, vigente. Las anuladas no cuentan:
        // si Operaciones anuló una falta, no la resucitamos desde la planilla.
        const yaCargadas = await fetchAll(() =>
            supabase.from('faltas')
                .select('fecha, employee_id, origen')
                .gte('fecha', rangoDesde).lte('fecha', rangoHasta)
                .is('anulada_at', null)
                .order('id')
        );
        const enBase = new Map();
        for (const f of yaCargadas) enBase.set(`${f.fecha}|${f.employee_id}`, f.origen);

        // El anti-duplicado va acá y no en la base: el índice único de faltas es
        // (fecha, employee_id, puesto_id) y estas entran con puesto_id NULL, que
        // en Postgres nunca colisiona consigo mismo.
        const nuevas = [];
        let yaImportadas = 0;
        let yaCargadasPorOperaciones = 0;
        for (const r of conLegajo) {
            const origenExistente = enBase.get(`${r.fecha}|${r.employee_id}`);
            // Si Operaciones ya la cargó a mano, esa gana: tiene servicio y turno,
            // la de la planilla no. Cargar las dos sería contar la falta dos veces.
            if (origenExistente === 'app') { yaCargadasPorOperaciones++; continue; }
            if (origenExistente) { yaImportadas++; continue; }
            nuevas.push(r);
        }

        const porMes = {};
        for (const r of nuevas) porMes[r.fecha.slice(0, 7)] = (porMes[r.fecha.slice(0, 7)] || 0) + 1;

        const resumen = {
            archivo: file.name,
            hoja: nombreHoja,
            desde: rangoDesde,
            hasta: rangoHasta,
            filasLeidas: registros.length,
            fueraDeRango,
            repetidasEnPlanilla,
            sinLegajoFilas: [...sinLegajo.values()].reduce((a, b) => a + b, 0),
            sinLegajoNombres: [...sinLegajo.keys()].sort(),
            yaImportadas,
            yaCargadasPorOperaciones,
            aCargar: nuevas.length,
            horas: nuevas.reduce((a, r) => a + (r.horas || 0), 0),
            porMes,
            muestra: nuevas.slice(0, 8).map(r => ({ fecha: r.fecha, nombre: r.nombre, horas: r.horas })),
        };

        // Paso 1: contar qué pasaría. No se escribe nada hasta que confirmen.
        if (!confirmar) {
            return Response.json({ ...resumen, importado: false });
        }

        if (!nuevas.length) {
            return Response.json({ ...resumen, importado: true, creadas: 0 });
        }

        const quien = await quienEs(await getSessionFromRequest(request));
        const aInsertar = nuevas.map(r => ({
            fecha: r.fecha,
            employee_id: r.employee_id,
            nombre_excel: r.nombre,
            puesto_id: null,        // la planilla no dice en qué puesto faltó
            service_id: null,
            servicio_excel: null,
            horas: r.horas,
            aviso: true,
            motivo: 'sin_especificar',
            nota: r.nota,
            registrado_por: `Importado de la planilla por ${quien || 'sistema'}`,
            origen: 'historico',
        }));

        let creadas = 0;
        for (let i = 0; i < aInsertar.length; i += 500) {
            const { error } = await supabase.from('faltas').insert(aInsertar.slice(i, i + 500));
            if (error) throw new Error(error.message);
            creadas += Math.min(500, aInsertar.length - i);
        }

        return Response.json({ ...resumen, importado: true, creadas });
    } catch (error) {
        console.error('Error importando faltas de la planilla:', error);
        return Response.json({ error: 'No se pudo importar: ' + error.message }, { status: 500 });
    }
}
