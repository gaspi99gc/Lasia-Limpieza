// Actualiza todo lo que sale del operativo, en un solo paso:
//   1. servicio principal del legajo de quien cambió de servicio (o no tenía);
//   2. employee_servicios (todos los servicios de cada uno, con horas);
//   3. operativo_puestos / operativo_dias (lo que usa "Registrar falta").
//
// La tabla de servicios (nombre del Excel -> service_id) se reconstruye de lo
// que dejó grabado la importación anterior en operativo_puestos (revisada a mano
// el 21/10); los nombres que no estaban se informan y NO se asignan solos.
//
// Uso (desde la raíz del proyecto):
//   node --env-file=.env.local scripts/actualizar_operativo.mjs <operativo.xlsx>            simulación
//   node --env-file=.env.local scripts/actualizar_operativo.mjs <operativo.xlsx> --aplicar
//
// Siempre simular primero: si el Excel trae un servicio con una anotación nueva
// en el nombre ("DENO- refuerzo hasta..."), aparece en "Servicios NUEVOS" y hay
// que sumarlo a EXTRA antes de aplicar. Si no, la gente de esa fila parece que
// cambió de servicio.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const PROY = process.cwd();
const require = createRequire(path.join(PROY, 'package.json'));
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { parseOperativoSheet, buildEmployeeMatcher, normText, nombreParaMatch } = await import(pathToFileURL(path.join(PROY, 'src/lib/operativo-import.js')).href);
// Los respaldos quedan al lado del Excel que se importa.
const SCR = path.dirname(path.resolve(process.argv[2] || '.'));
const ARCHIVO = process.argv[2];
const APLICAR = process.argv.includes('--aplicar');
async function all(q) { let r = [], f = 0; for (;;) { const { data, error } = await q().range(f, f + 999); if (error) throw error; r = r.concat(data); if (data.length < 1000) break; f += 1000; } return r; }
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const horas = (hi, he) => { if (typeof hi !== 'number' || typeof he !== 'number') return 0; let h = he - hi; if (h <= 0) h += 24; return h > 16 ? 0 : h; };
const clave = (s) => String(s || '').trim().replace(/\s+/g, ' ');

// ---------- Tabla de servicios reconstruida
const puestosDB = await all(() => sb.from('operativo_puestos').select('id,servicio_excel,service_id,employee_id,tipo,activo,updated_at,clave_import').order('id'));
const RULES = new Map();      // nombre del Excel -> service_id | null (null = sin servicio a propósito)
for (const p of [...puestosDB].sort((a, b) => (a.activo - b.activo) || String(a.updated_at).localeCompare(String(b.updated_at)))) {
    RULES.set(clave(p.servicio_excel), p.service_id ?? null);   // gana el activo más nuevo
}
// Operativo del 29/10: el mismo servicio con una anotación en el nombre, y
// filas que no son un servicio (revisado a mano contra las direcciones).
const EXTRA = {
    'BAIC- ADACHI MOTORS, S.A- BAJA 31-10': 140,
    'DENO- refuerzo hasta el 31-10': 210,
    'ESTISOL - pasa a 8 hs desde el 02-11': 214,                 // Iguazú 921
    'INDUSTRIAS ERPLA S.A -refuerzo hasta el 05-11': 223,
    'LUXCAR S.A ( MORON ) - Lavadordesde el 26-10-': 232,
    'SOLUTIONS 2 GO SRL': 309,
    'SPORTCLUB JUMBO - cambio de horario': 258,
    'CONSORCIO DE PROPIETARIOS AUSTRIA 2566': null,               // suplencia 26/10-03/11, no es cliente cargado
    'CONSORCIO DE PROPIETARIOS AV.GARAY 2235': null,              // suplencia 26/10-30/10
    'ANDRADA LUIS GUILLERMO': null, '54 9 11 31882000': null, '10/8/26': null,   // anotaciones, sin nadie
};
for (const [k, v] of Object.entries(EXTRA)) RULES.set(clave(k), v);
const conocido = (t) => RULES.has(clave(t));
const mapSvc = (t) => RULES.get(clave(t)) ?? null;

const emps = await all(() => sb.from('employees').select('id,legajo,apellido,nombre,servicio_id,estado_empleado').order('id'));
const svcs = await all(() => sb.from('services').select('id,name').order('id'));
const nm = new Map(svcs.map((s) => [s.id, s.name]));
const n = (sid) => (sid ? nm.get(sid) : '—');
const match = buildEmployeeMatcher(emps);

// Nombres que el operativo escribe distinto al legajo (21/10) y el plan B
// tolerante (mismo apellido + otra palabra; un solo candidato activo).
const CORRECCIONES = { 'PEÑALOSA MUÑOS MAIKEL ERIC': '1041', 'PALACIOS LOURDES AYELEN': '1540', 'SHINKEL MONICA GRACIELA': '1573', 'RABBIA EZEQUIEL': '1738', 'HERRERA ISAIAS GUSTAVO': '1820' };
const porCorreccion = (nom) => { const leg = CORRECCIONES[clave(nombreParaMatch(nom)).replace(/\s+/g, ' ')]; return leg ? emps.find((e) => String(e.legajo) === leg) : null; };
function matchTolerante(nombreExcel) {
    const toks = normText(nombreParaMatch(nombreExcel)).split(' ').filter((t) => t.length > 1);
    if (toks.length < 2) return null;
    const cands = emps.filter((e) => e.estado_empleado === 'Activo').filter((e) => {
        const et = normText(`${e.apellido} ${e.nombre}`).split(' ');
        if (et[0] !== toks[0]) return false;
        const resto = toks.slice(1);
        const puntos = resto.reduce((acc, t) => acc + (et.slice(1).includes(t) ? 2 : et.slice(1).some((x) => x.slice(0, 4) === t.slice(0, 4)) ? 1 : 0), 0);
        return puntos >= (resto.length >= 2 ? 2 : 1);
    });
    return cands.length === 1 ? cands[0] : null;
}
const tolerados = [];
const quien = (f) => {
    if (f.tipo === 'vacante' || !f.nombre) return null;
    let e = match(f.nombre) || porCorreccion(f.nombre);
    if (!e && f.tipo === 'titular') { e = matchTolerante(f.nombre); if (e) tolerados.push(`${f.nombre} -> ${e.apellido} ${e.nombre} (leg ${e.legajo})`); }
    return e || null;
};

// ---------- Excel nuevo
const wb = XLSX.read(fs.readFileSync(ARCHIVO), { cellStyles: false });
const { fechas, filas } = parseOperativoSheet(XLSX, wb.Sheets[wb.SheetNames.find((x) => normText(x) === 'OPERATIVO')]);
const desde = fechas[0], hasta = fechas[fechas.length - 1];
const filasConEmp = filas.map((f) => ({ ...f, emp: quien(f) }));
const nuevosNombres = [...new Set(filas.map((f) => clave(f.servicio)).filter((s) => s && !conocido(s)))];
const sinLegajo = [...new Set(filasConEmp.filter((f) => f.tipo === 'titular' && f.nombre && !f.emp).map((f) => `${f.nombre} [${clave(f.servicio)}]`))];
console.log(`Archivo ${path.basename(ARCHIVO)}: ${desde} a ${hasta} | filas ${filas.length}`);
console.log(`\nServicios NUEVOS en el Excel, sin servicio asignado (${nuevosNombres.length}):`, nuevosNombres);
console.log(`\nNombres resueltos por apellido (${tolerados.length}):`, [...new Set(tolerados)]);
console.log(`\nTitulares que no están en el legajo (${sinLegajo.length}):`, sinLegajo);

// ---------- 1. Servicio principal: primero donde es titular, después por horas
function principal(puestos) {
    const porEmp = new Map(); const titularEn = new Map();
    for (const p of puestos) {
        if (!p.employee_id || p.tipo === 'vacante' || !p.sid) continue;
        const peso = (p.tipo === 'titular' ? 1e6 : 0) + p.horas;
        const cur = porEmp.get(p.employee_id); if (!cur || peso > cur.peso) porEmp.set(p.employee_id, { sid: p.sid, peso });
        if (p.tipo === 'titular') (titularEn.get(p.employee_id) || titularEn.set(p.employee_id, new Set()).get(p.employee_id)).add(p.sid);
    }
    return { porEmp, titularEn };
}
const activosDB = puestosDB.filter((p) => p.activo);
const diasViejos = await all(() => sb.from('operativo_dias').select('puesto_id,hi,he').gte('fecha', desde).lte('fecha', hasta).order('id'));
const hv = new Map(); for (const d of diasViejos) hv.set(d.puesto_id, (hv.get(d.puesto_id) || 0) + horas(d.hi, d.he));
const viejo = principal(activosDB.map((p) => ({ sid: p.service_id, employee_id: p.employee_id, tipo: p.tipo, horas: hv.get(p.id) || 0 })));
const nuevo = principal(filasConEmp.map((f) => ({ sid: mapSvc(f.servicio), employee_id: f.emp?.id || null, tipo: f.tipo, horas: Object.values(f.celdas).reduce((a, c) => a + horas(c.hi, c.he), 0) })));

const act = emps.filter((e) => e.estado_empleado === 'Activo');
const cambian = [], completar = [], salieron = [];
for (const e of act) {
    const v = viejo.porEmp.get(e.id)?.sid || null, w = nuevo.porEmp.get(e.id)?.sid || null;
    if (String(e.legajo) === '1144') continue;   // Toledo: GLOBAL 66 + TALLER D'ARC, confirmado a mano
    if (w && v && v !== w) {
        if (e.servicio_id && nuevo.titularEn.get(e.id)?.has(e.servicio_id)) continue;   // sigue donde dice el legajo
        cambian.push({ e, v, w });
    } else if (w && !e.servicio_id) completar.push({ e, w });
    else if (v && !w) salieron.push({ e, v });
}
console.log(`\n1) CAMBIAN DE SERVICIO en el legajo (${cambian.length}):`);
for (const c of cambian) console.log(`   ${c.e.legajo} ${c.e.apellido} ${c.e.nombre}: ${n(c.v)} -> ${n(c.w)} (legajo hoy: ${n(c.e.servicio_id)})`);
console.log(`\n   SIN SERVICIO en el legajo, se completa (${completar.length}):`);
for (const c of completar) console.log(`   ${c.e.legajo} ${c.e.apellido} ${c.e.nombre} -> ${n(c.w)}`);
console.log(`\n   Estaban en el operativo anterior y NO en el nuevo (${salieron.length}, no se tocan):`);
for (const c of salieron) console.log(`   ${c.e.legajo} ${c.e.apellido} ${c.e.nombre} (era ${n(c.v)})`);

// ---------- 2. employee_servicios
const porEmp = new Map();
for (const f of filasConEmp) {
    if (f.tipo !== 'titular' || !f.emp || f.emp.estado_empleado !== 'Activo') continue;
    const sid = mapSvc(f.servicio); if (!sid) continue;
    let h = 0, d = 0;
    for (const c of Object.values(f.celdas)) { const x = horas(c.hi, c.he); if (x > 0) { h += x; d++; } }
    if (!porEmp.has(f.emp.id)) porEmp.set(f.emp.id, new Map());
    const acc = porEmp.get(f.emp.id).get(sid) || { horas: 0, dias: 0 };
    acc.horas += h; acc.dias += d; porEmp.get(f.emp.id).set(sid, acc);
}
const toledo = emps.find((x) => String(x.legajo) === '1144');
if (toledo) porEmp.set(toledo.id, new Map([[283, { horas: 4, dias: 1 }], [206, { horas: 4, dias: 1 }]]));
// Un cambio de servicio cargado en la app (informe) vale más que un operativo
// que todavía no lo refleja: a esas personas no se les pisan los servicios.
const esActuales = await all(() => sb.from('employee_servicios').select('employee_id,service_id,fuente').order('id'));
const respetados = [];
for (const r of esActuales.filter((x) => String(x.fuente || '').startsWith('cambio de servicio'))) {
    if (porEmp.has(r.employee_id) && !porEmp.get(r.employee_id).has(r.service_id)) { porEmp.delete(r.employee_id); respetados.push(r.employee_id); }
}
const filasES = [];
for (const [empId, mapa] of porEmp) for (const [sid, a] of mapa) filasES.push({ employee_id: empId, service_id: sid, horas_dia: a.dias ? Math.round((a.horas / a.dias) * 10) / 10 : null, fuente: path.basename(ARCHIVO) });
const antes = new Map(); for (const r of esActuales) (antes.get(r.employee_id) || antes.set(r.employee_id, new Set()).get(r.employee_id)).add(r.service_id);
const cambiaES = [...porEmp.keys()].filter((id) => { const a = antes.get(id) || new Set(); const b = new Set(porEmp.get(id).keys()); return a.size !== b.size || [...b].some((x) => !a.has(x)); });
console.log(`\n2) Servicios por persona: ${porEmp.size} personas, ${filasES.length} filas | cambian respecto de hoy: ${cambiaES.length} | respetados por un cambio de servicio cargado en la app: ${respetados.length}`);
for (const id of cambiaES.slice(0, 40)) { const e = emps.find((x) => x.id === id); console.log(`   ${e.legajo} ${e.apellido} ${e.nombre}: ${[...(antes.get(id) || [])].map(n).join(' + ') || '—'} -> ${[...porEmp.get(id).keys()].map(n).join(' + ')}`); }

// ---------- 3. operativo_puestos / dias
const ahora = new Date().toISOString();
const rows = filasConEmp.map((f) => ({
    servicio_excel: f.servicio, direccion_excel: f.direccion, service_id: mapSvc(f.servicio),
    nombre_excel: f.nombre, apodo_excel: f.apodo, employee_id: f.emp?.id ?? null,
    celular: f.celular, supervisor_nombre: f.supervisor, tipo: f.tipo, orden: f.orden,
    activo: true, clave_import: f.claveImport, updated_at: ahora,
}));
const claves = new Set(rows.map((r) => r.clave_import));
const aDesactivar = activosDB.filter((p) => !claves.has(p.clave_import)).map((p) => p.id);
const nuevosPuestos = rows.filter((r) => !puestosDB.some((p) => p.clave_import === r.clave_import)).length;
console.log(`\n3) Operativo: ${rows.length} puestos (nuevos ${nuevosPuestos}, se desactivan ${aDesactivar.length}) | con operario ${rows.filter((r) => r.employee_id).length} | celdas del ${desde} al ${hasta}`);

if (!APLICAR) { console.log('\n(SIMULACIÓN: no se grabó nada)'); process.exit(0); }

// 1
const backup = [...cambian.map((c) => ({ id: c.e.id, legajo: c.e.legajo, de: c.e.servicio_id, a: c.w })), ...completar.map((c) => ({ id: c.e.id, legajo: c.e.legajo, de: null, a: c.w }))];
fs.writeFileSync(path.join(SCR, `backup_legajos_${path.basename(ARCHIVO, '.xlsx')}.json`), JSON.stringify({ legajos: backup, servicios: esActuales }, null, 1));
for (const t of backup) { const { error } = await sb.from('employees').update({ servicio_id: t.a }).eq('id', t.id); if (error) throw error; }
console.log(`APLICADO 1: ${backup.length} legajos`);
// 2
for (const g of chunk([...porEmp.keys()], 200)) { const { error } = await sb.from('employee_servicios').delete().in('employee_id', g); if (error) throw error; }
for (const g of chunk(filasES, 500)) { const { error } = await sb.from('employee_servicios').insert(g); if (error) throw error; }
console.log(`APLICADO 2: ${filasES.length} filas de servicios`);
// 3
const porClave = new Map();
for (const g of chunk(rows, 500)) {
    const { data, error } = await sb.from('operativo_puestos').upsert(g, { onConflict: 'clave_import' }).select('id,clave_import');
    if (error) throw error;
    for (const p of data) porClave.set(p.clave_import, p.id);
}
for (const g of chunk(aDesactivar, 200)) { const { error } = await sb.from('operativo_puestos').update({ activo: false, updated_at: ahora }).in('id', g); if (error) throw error; }
const { error: eDel } = await sb.from('operativo_dias').delete().gte('fecha', desde).lte('fecha', hasta).eq('fuente', 'import');
if (eDel) throw eDel;
const editadas = await all(() => sb.from('operativo_dias').select('puesto_id,fecha').gte('fecha', desde).lte('fecha', hasta).order('id'));
const ed = new Set(editadas.map((d) => `${d.puesto_id}|${String(d.fecha).slice(0, 10)}`));
const celdas = [];
for (const f of filas) {
    const pid = porClave.get(f.claveImport); if (!pid) continue;
    for (const [fecha, c] of Object.entries(f.celdas)) {
        if (ed.has(`${pid}|${fecha}`)) continue;
        celdas.push({ puesto_id: pid, fecha, hi: c.hi, he: c.he, nota: c.nota, fuente: 'import', updated_at: ahora });
    }
}
for (const g of chunk(celdas, 500)) { const { error } = await sb.from('operativo_dias').insert(g); if (error) throw error; }
console.log(`APLICADO 3: ${porClave.size} puestos, ${aDesactivar.length} desactivados, ${celdas.length} celdas (${desde} a ${hasta})`);
