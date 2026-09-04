// Parseo del Excel "operativo" de Operaciones y match de nombres contra la DB.
//
// El archivo diario tiene la hoja OPERATIVO: fila 1 con encabezados fijos
// (SERVICIO, DIRECCION, CELULARES, OPERARIOS, APELLIDO Y NOMBRE) seguidos de
// dos columnas por fecha (hora ingreso / hora egreso en decimal, >24 cuando el
// turno cruza medianoche). La columna A no tiene encabezado y trae el nombre
// del supervisor. Este modulo no importa nada de Next para poder usarse tanto
// desde las rutas de API como desde scripts sueltos (node scripts/*.mjs).

export function normText(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Filas del operativo que no son un operario titular: adicionales facturados
// aparte, extras y puestos sin persona asignada.
export function detectarTipo(nombreExcel) {
    const n = String(nombreExcel || '').trim();
    if (!n) return 'vacante';
    if (/ADICIONAL/i.test(n)) return 'adicional_fijo';
    if (/^\s*EXTRA\b/i.test(n)) return 'extra';
    return 'titular';
}

// El nombre "limpio" para matchear: sin el prefijo ADICIONAL/EXTRA y sin
// sufijos tipo "/ V" que Operaciones anota sobre la celda.
export function nombreParaMatch(nombreExcel) {
    return String(nombreExcel || '')
        .replace(/^.*?(ADICIONAL(\s+FIJO)?|EXTRA)\s*[-:]?\s*/i, '')
        .replace(/\/.*$/, '')
        .trim();
}

// Matcher de empleados: primero igualdad normalizada (apellido+nombre en
// cualquier orden), despues subconjunto de tokens con candidato UNICO (si hay
// dos posibles no se adivina: queda sin match para revision manual). Se
// prefieren los activos sobre los dados de baja cuando el nombre se repite.
export function buildEmployeeMatcher(employees) {
    const activos = employees.filter(e => e.estado_empleado === 'Activo');
    const grupos = [activos, employees];

    const mapas = grupos.map(grupo => {
        const map = new Map();
        for (const e of grupo) {
            const a = normText(`${e.apellido} ${e.nombre}`);
            const b = normText(`${e.nombre} ${e.apellido}`);
            if (!map.has(a)) map.set(a, e);
            if (!map.has(b)) map.set(b, e);
        }
        return map;
    });
    const tokenLists = grupos.map(grupo =>
        grupo.map(e => ({ e, toks: normText(`${e.apellido} ${e.nombre}`).split(' ') }))
    );

    return function matchEmployee(nombreExcel) {
        const limpio = nombreParaMatch(nombreExcel);
        const n = normText(limpio);
        if (!n) return null;
        for (let g = 0; g < 2; g++) {
            const exacto = mapas[g].get(n);
            if (exacto) return exacto;
            const toks = n.split(' ').filter(t => t.length > 1);
            if (!toks.length) continue;
            const candidatos = tokenLists[g].filter(({ toks: dt }) =>
                toks.every(t => dt.includes(t)) || dt.every(t => toks.includes(t))
            );
            if (candidatos.length === 1) return candidatos[0].e;
        }
        return null;
    };
}

// Matcher de servicios contra services.name: igualdad normalizada, despues
// contencion (un nombre incluye al otro) con candidato unico.
export function buildServiceMatcher(services) {
    const porNorm = new Map();
    const lista = services.map(s => ({ s, n: normText(s.name) })).filter(x => x.n);
    for (const { s, n } of lista) if (!porNorm.has(n)) porNorm.set(n, s);

    return function matchService(servicioExcel) {
        const n = normText(servicioExcel);
        if (!n) return null;
        const exacto = porNorm.get(n);
        if (exacto) return exacto;
        const candidatos = lista.filter(({ n: sn }) => sn.includes(n) || n.includes(sn));
        if (candidatos.length === 1) return candidatos[0].s;
        return null;
    };
}

function fechaDesdeCelda(cell) {
    if (!cell) return null;
    const v = cell.v;
    if (typeof v === 'number' && v > 20000) {
        // Serial de fecha de Excel (dias desde 1900; 25569 = 1970-01-01).
        const d = new Date(Math.round((v - 25569) * 86400 * 1000));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
    if (v instanceof Date) {
        return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
    }
    // Solo aceptar strings que parseen a un año plausible: V8 es tan permisivo
    // que "CELULARES 1" parsea como el año 2001.
    const parsed = new Date(String(cell.w || v));
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2020 && parsed.getFullYear() <= 2100) {
        return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }
    return null;
}

function horaDesdeCelda(cell) {
    if (!cell || cell.v === undefined || cell.v === null) return { hora: null, texto: null };
    if (typeof cell.v === 'number') return { hora: cell.v, texto: null };
    const s = String(cell.v).trim();
    if (!s) return { hora: null, texto: null };
    const num = Number(s.replace(',', '.'));
    if (!isNaN(num)) return { hora: num, texto: null };
    return { hora: null, texto: s };
}

/**
 * Parsea la hoja OPERATIVO de un workbook ya abierto con XLSX.
 * Devuelve { fechas: ['YYYY-MM-DD', ...], filas: [...] } donde cada fila es
 * { supervisor, servicio, direccion, celular, apodo, nombre, tipo,
 *   claveImport, orden, celdas: { 'YYYY-MM-DD': { hi, he, nota } } }.
 */
export function parseOperativoSheet(XLSX, worksheet) {
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    const cell = (r, c) => worksheet[XLSX.utils.encode_cell({ r, c })];

    // Encabezados fijos por nombre (el Excel trae "SERViCIO" con typo y
    // espacios finales; normText absorbe todo eso).
    const colPorHeader = {};
    const columnasFecha = new Map(); // 'YYYY-MM-DD' -> [colHi, colHe]
    for (let c = 0; c <= range.e.c; c++) {
        const h = cell(0, c);
        if (!h) continue;
        const fecha = fechaDesdeCelda(h);
        if (fecha) {
            if (!columnasFecha.has(fecha)) columnasFecha.set(fecha, []);
            columnasFecha.get(fecha).push(c);
            continue;
        }
        const n = normText(h.w !== undefined ? h.w : h.v);
        if (n && !(n in colPorHeader)) colPorHeader[n] = c;
    }

    const col = {
        servicio: colPorHeader['SERVICIO'] ?? 1,
        direccion: colPorHeader['DIRECCION'] ?? 2,
        celular: colPorHeader['CELULARES'] ?? colPorHeader['CELULARES 1'] ?? 4,
        apodo: colPorHeader['OPERARIOS'] ?? 5,
        nombre: colPorHeader['APELLIDO Y NOMBRE'] ?? 6,
    };
    // La columna A no tiene encabezado: es el supervisor.
    const colSupervisor = 0;

    const fechas = [...columnasFecha.keys()].sort();
    const filas = [];
    const ocurrencias = new Map();

    for (let r = 1; r <= range.e.r; r++) {
        const texto = (c) => {
            const x = cell(r, c);
            return x && x.v !== undefined ? String(x.w !== undefined ? x.w : x.v).trim() : '';
        };
        const servicio = texto(col.servicio);
        const nombre = texto(col.nombre);
        if (!servicio && !nombre) continue;

        const claveBase = `${normText(servicio)}|${normText(nombre)}`;
        const occ = ocurrencias.get(claveBase) || 0;
        ocurrencias.set(claveBase, occ + 1);

        const celdas = {};
        for (const fecha of fechas) {
            const cols = columnasFecha.get(fecha);
            const { hora: hi, texto: t1 } = horaDesdeCelda(cell(r, cols[0]));
            const { hora: he, texto: t2 } = horaDesdeCelda(cols.length > 1 ? cell(r, cols[1]) : null);
            const nota = [t1, t2].filter(Boolean).join(' / ') || null;
            if (hi !== null || he !== null || nota) celdas[fecha] = { hi, he, nota };
        }

        filas.push({
            supervisor: texto(colSupervisor) || null,
            servicio,
            direccion: texto(col.direccion) || null,
            celular: texto(col.celular) || null,
            apodo: texto(col.apodo) || null,
            nombre: nombre || null,
            tipo: detectarTipo(nombre),
            claveImport: `${claveBase}|${occ}`,
            orden: filas.length,
            celdas,
        });
    }

    return { fechas, filas };
}
