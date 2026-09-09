// Completa el servicio en los legajos cruzando con el operativo cargado.
//
// El operativo dice, para cada dia, quien trabaja en que servicio. Los legajos
// tienen ese campo casi vacio (11 de 333 activos). Este script usa lo primero
// para completar lo segundo.
//
// Reglas, en orden de importancia:
//
//   1. NUNCA pisa un servicio ya cargado. Si el legajo ya tiene uno, se deja
//      como esta aunque el operativo diga otra cosa: lo que cargo una persona
//      vale mas que lo que deduce un script. Los desacuerdos se listan aparte.
//   2. Si la persona aparece en MAS DE UN servicio, no se elige ninguno. Hay
//      gente que cubre dos o tres consorcios; adivinar uno seria inventar.
//   3. Solo cuentan los puestos de tipo 'titular'. Un adicional o un extra es
//      un refuerzo puntual, no el servicio de base de la persona.
//   4. Solo empleados Activos.
//
// Por defecto NO escribe: muestra que haria y deja un Excel para revisar.
// Escribe solo con --aplicar.
//
// USO:
//   node scripts/completar_servicio_legajos.mjs            (simulacion + Excel)
//   node scripts/completar_servicio_legajos.mjs --aplicar  (escribe)

import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { normText } from '../src/lib/operativo-import.js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

config({ path: '.env.local', quiet: true });

const APLICAR = process.argv.includes('--aplicar');
const SALIDA = 'servicios_legajos.xlsx';

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function todo(query, pageSize = 1000) {
    const all = [];
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await query().range(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        all.push(...(data || []));
        if (!data || data.length < pageSize) break;
    }
    return all;
}

// El operativo y la tabla de servicios escriben el mismo cliente distinto:
// "CONSORCIO DE PROPIETARIOS CABRERA 3940" contra "CONS. PROPIETARIOS CABRERA
// 3940". Esta normalizacion empareja las dos formas sin inventar nada: expande
// abreviaturas, saca la forma juridica y corta las anotaciones que Operaciones
// agrega al nombre ("- INICIO 02-03", "- LIMPIEZA").
function normServicio(s) {
    let n = normText(s);
    n = n.replace(/\bCONS\b/g, 'CONSORCIO').replace(/\bPROP\b/g, 'PROPIETARIOS');
    n = n.replace(/\bCO PROPIETARIOS\b/g, 'PROPIETARIOS');
    // El Excel escribe "WE WORK" separado y la tabla "WEWORK" junto.
    n = n.replace(/\bWE WORK\b/g, 'WEWORK').replace(/\bSPORT CLUB\b/g, 'SPORTCLUB');
    n = n.replace(/\bDE\b|\bDEL\b|\bLA\b|\bEL\b/g, ' ');
    n = n.replace(/\bS\s*A\s*S\b|\bSA\b|\bSRL\b|\bS\s*R\s*L\b|\bSAS\b|\bCABA\b/g, ' ');
    n = n.replace(/\bINICIO\b.*$/, ' ').replace(/\bCAMBIO\b.*$/, ' ');
    n = n.replace(/\bLIMPIEZA\b|\bLAVADOR\b/g, ' ');
    return n.replace(/\s+/g, ' ').trim();
}

// Calle + altura de una direccion, para comparar el operativo con la tabla.
// Se ignora la parte administrativa (ciudad, CP, provincia) porque el operativo
// no la escribe.
function claveDireccion(dir) {
    if (!dir) return null;
    // Nota: las calles con numero en el nombre ("25 DE MAYO 279") no se
    // resuelven por direccion y quedan sin match a proposito. Intentarlo
    // confunde el numero de la calle con la altura y produce claves falsas.
    const t = normText(dir);
    const m = t.match(/([A-Z][A-Z0-9\s]*?)\s+(\d{2,5})\b/);
    if (!m) return null;
    let calle = m[1]
        .replace(/\b(AVENIDA|AVDA|AV|CALLE|PASAJE|PJE)\b/g, ' ')
        // El operativo escribe el nombre completo ("JOSE ANTONIO CABRERA") y la
        // tabla lo abrevia ("Jose A. Cabrera"): se descartan las iniciales y los
        // nombres de pila para quedarse con el apellido, que es lo que coincide.
        .replace(/\b[A-Z]\b/g, ' ')
        .replace(/\s+/g, ' ').trim();
    // De "JOSE ANTONIO CABRERA" y "JOSE CABRERA" queda "CABRERA" en los dos.
    const palabras = calle.split(' ').filter(Boolean);
    if (palabras.length > 1) calle = palabras[palabras.length - 1];
    return calle ? `${calle}|${m[2]}` : null;
}

// Ante la duda, null. Un match ambiguo mete a alguien en el servicio equivocado
// y eso es peor que dejar el campo vacio.
//
// La DIRECCION manda sobre el nombre, y no es un detalle: el operativo llama
// "SPORTCLUB PALERMO" al de Uriarte 2477, que en la tabla figura como "SPORTCLUB
// PALERMO (PLAZA ITALIA)", mientras que al de Cabrera 4848 lo llama "SPORTCLUB
// PLAZA ITALIA". Emparejando por nombre, esas dos sucursales quedan cruzadas.
function buildMatcher(services) {
    const lista = services.map(s => ({ s, n: normServicio(s.name) })).filter(x => x.n);

    // Direcciones que apuntan a un unico servicio. Las repetidas (dos servicios
    // en el mismo edificio) no sirven para decidir y quedan afuera.
    const porDireccion = new Map();
    for (const s of services) {
        const k = claveDireccion(s.address);
        if (!k) continue;
        if (!porDireccion.has(k)) porDireccion.set(k, []);
        porDireccion.get(k).push(s);
    }
    for (const [k, v] of porDireccion) if (v.length > 1) porDireccion.delete(k);

    // La direccion tambien resuelve casos que por nombre son imposibles: la
    // oficina propia figura como "LASIA SERVICIOS SRL" en el operativo y como
    // "OFICINA" en la tabla, pero las dos estan en Lacroze 2252.
    return function matchServicio(texto, direccion) {
        const kd = claveDireccion(direccion);
        if (kd && porDireccion.has(kd)) return porDireccion.get(kd)[0];

        const n = normServicio(texto);
        if (!n) return null;
        const exacto = lista.filter(x => x.n === n);
        if (exacto.length === 1) return exacto[0].s;
        if (exacto.length > 1) return null;
        let c = lista.filter(x => x.n.includes(n) || n.includes(x.n));
        if (c.length === 1) return c[0].s;
        const toks = n.split(' ').filter(t => t.length > 2);
        c = lista.filter(x => {
            const st = x.n.split(' ').filter(t => t.length > 2);
            return st.length >= 2 && st.every(t => toks.includes(t));
        });
        return c.length === 1 ? c[0].s : null;
    };
}

async function main() {
    const [services, employees, puestosTodos] = await Promise.all([
        todo(() => sb.from('services').select('id, name, address').order('id')),
        todo(() => sb.from('employees')
            .select('id, legajo, nombre, apellido, estado_empleado, servicio_id').order('id')),
        todo(() => sb.from('operativo_puestos')
            .select('employee_id, service_id, servicio_excel, direccion_excel, nombre_excel, tipo, activo').order('id')),
    ]);

    const svcPorId = new Map(services.map(s => [s.id, s]));
    const empPorId = new Map(employees.map(e => [e.id, e]));
    const match = buildMatcher(services);

    const puestos = puestosTodos.filter(p => p.activo && p.tipo === 'titular' && p.employee_id);

    // Servicios que el operativo nombra y no se pudieron identificar. No es un
    // error del cruce: son clientes que no estan en la tabla de servicios.
    const sinIdentificar = new Map();

    // employee_id -> Map(service_id -> cuantos puestos)
    const porPersona = new Map();
    for (const p of puestos) {
        // Se rematchea SIEMPRE, incluso si el puesto ya trae service_id: ese lo
        // puso el import con el matcher viejo, que solo miraba el nombre y por
        // eso cruzaba las dos sucursales de Palermo. La direccion desempata.
        const svc = match(p.servicio_excel, p.direccion_excel) || svcPorId.get(p.service_id);
        if (!svc) {
            const t = (p.servicio_excel || '').trim();
            if (t) sinIdentificar.set(t, (sinIdentificar.get(t) || 0) + 1);
            continue;
        }
        if (!porPersona.has(p.employee_id)) porPersona.set(p.employee_id, new Map());
        const m = porPersona.get(p.employee_id);
        m.set(svc.id, (m.get(svc.id) || 0) + 1);
    }

    const aCompletar = [];   // legajo vacio, un solo servicio: se escribe
    const enVarios = [];     // trabaja en 2+ servicios: no se toca
    const desacuerdos = [];  // ya tiene servicio y el operativo dice otro
    const yaEstaban = [];    // ya tiene el mismo
    let noActivos = 0;

    for (const [empId, m] of porPersona) {
        const e = empPorId.get(empId);
        if (!e || e.estado_empleado !== 'Activo') { noActivos++; continue; }

        const ids = [...m.keys()];
        const persona = `${e.apellido} ${e.nombre}`.trim();

        if (ids.length > 1) {
            enVarios.push({
                legajo: e.legajo, persona,
                servicios: ids.map(id => svcPorId.get(id)?.name).filter(Boolean).join(' + '),
            });
            continue;
        }

        const nuevo = svcPorId.get(ids[0]);
        if (e.servicio_id === nuevo.id) { yaEstaban.push({ legajo: e.legajo, persona }); continue; }
        if (e.servicio_id) {
            desacuerdos.push({
                legajo: e.legajo, persona,
                enElLegajo: svcPorId.get(e.servicio_id)?.name || `(id ${e.servicio_id})`,
                enElOperativo: nuevo.name,
            });
            continue;
        }
        aCompletar.push({ id: e.id, legajo: e.legajo, persona, servicio_id: nuevo.id, servicio: nuevo.name });
    }

    const activos = employees.filter(e => e.estado_empleado === 'Activo');
    const conServicioAntes = activos.filter(e => e.servicio_id).length;

    console.log('CRUCE OPERATIVO -> LEGAJOS');
    console.log(`  activos: ${activos.length} · con servicio hoy: ${conServicioAntes}`);
    console.log(`  identificados en el operativo: ${porPersona.size}`);
    console.log('');
    console.log(`  SE COMPLETAN:            ${aCompletar.length}`);
    console.log(`  ya tenian el mismo:      ${yaEstaban.length}`);
    console.log(`  trabajan en varios:      ${enVarios.length}  (no se tocan)`);
    console.log(`  no coinciden:            ${desacuerdos.length}  (no se tocan, se listan)`);
    console.log(`  descartados (no activos):${noActivos}`);
    console.log(`  quedarian con servicio:  ${conServicioAntes + aCompletar.length} de ${activos.length}`);
    if (sinIdentificar.size) {
        const filas = [...sinIdentificar.values()].reduce((a, b) => a + b, 0);
        console.log(`\n  ${sinIdentificar.size} nombres del operativo no existen en la tabla de servicios (${filas} puestos).`);
    }

    // El Excel es para revisar ANTES de aplicar, y para saber que quedo afuera.
    const wb = XLSX.utils.book_new();
    const hoja = (nombre, filas, cols) => {
        if (!filas.length) return;
        XLSX.utils.book_append_sheet(
            wb,
            XLSX.utils.json_to_sheet(filas.map(f => Object.fromEntries(cols.map(([k, t]) => [t, f[k] ?? ''])))),
            nombre
        );
    };
    hoja('A completar', aCompletar, [['legajo', 'Legajo'], ['persona', 'Persona'], ['servicio', 'Servicio']]);
    hoja('En varios servicios', enVarios, [['legajo', 'Legajo'], ['persona', 'Persona'], ['servicios', 'Servicios']]);
    hoja('No coinciden', desacuerdos, [['legajo', 'Legajo'], ['persona', 'Persona'], ['enElLegajo', 'En el legajo'], ['enElOperativo', 'En el operativo']]);
    hoja('Servicios sin identificar',
        [...sinIdentificar.entries()].sort((a, b) => b[1] - a[1]).map(([nombre, puestos]) => ({ nombre, puestos })),
        [['nombre', 'Nombre en el operativo'], ['puestos', 'Puestos']]);
    XLSX.writeFile(wb, SALIDA);
    console.log(`\n  Detalle en ${SALIDA}`);

    if (!APLICAR) {
        console.log('\n[SIMULACION] No se escribio nada.');
        console.log('Revisá el Excel y, si está bien, corré:  node scripts/completar_servicio_legajos.mjs --aplicar');
        return;
    }

    if (!aCompletar.length) {
        console.log('\nNo hay nada para completar.');
        return;
    }

    console.log('\nEscribiendo...');
    let ok = 0;
    for (const r of aCompletar) {
        // Uno por uno y con la condicion de que siga vacio: si alguien cargo el
        // servicio a mano mientras esto corria, no se lo pisamos.
        const { data, error } = await sb.from('employees')
            .update({ servicio_id: r.servicio_id })
            .eq('id', r.id)
            .is('servicio_id', null)
            .select('id');
        if (error) { console.error(`  ERROR legajo ${r.legajo}: ${error.message}`); continue; }
        if (data?.length) ok++;
    }
    console.log(`\nListo: ${ok} legajos completados.`);
}

main();
