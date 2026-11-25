// Recorrido de punta a punta de Documentación mensual, manejando la pantalla
// con Chrome headless como lo haría una persona.
//
// USO: node scripts/recorrido_documentacion.mjs <carpeta-salida>
//      TEMA=dark ANCHO=375 node scripts/recorrido_documentacion.mjs <carpeta>   (celular, oscuro)
//      (con `npm run dev` levantado en el puerto 3000)
//
// 1. La jefa operativa abre el detalle, agrega a una persona por DNI y a otra
//    por apellido, y saca a una.
// 2. RRHH ve "1 pendiente de enviar", toca "Ya la mandé" (la fecha no se mueve)
//    y después "✓ Hecho" (la fecha pasa al mes siguiente).
// 3. Baja el Excel y se fija que el archivo esté, con el nombre que corresponde.
// 4. Desde la lista toca la documentación, va al detalle y "← Volver" vuelve.
//
// OJO: .env.local apunta a PRODUCCIÓN. Crea una documentación "(prueba)" con
// fecha a +60 días y dos empleados de prueba, y los borra al final.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { nombreArchivoNomina } from '../src/lib/nomina-documentacion.js';

const out = path.resolve(process.argv[2] || '.');
fs.mkdirSync(out, { recursive: true });
const descargas = fs.mkdtempSync(path.join(os.tmpdir(), 'descargas-'));
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const BASE = 'http://localhost:3000';
const PORT = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'))}`, '--no-first-run', 'about:blank',
], { stdio: 'ignore' });

const espera = (ms) => new Promise(r => setTimeout(r, ms));
let ws; let n = 0; const pend = new Map(); const errores = [];
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++n; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
const esperarA = async (expr, seg = 60) => { for (let i = 0; i < seg * 4; i++) { await espera(250); if (await evalJs(expr)) return true; } return false; };
const foto = async (nombre) => { const s = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, nombre), Buffer.from(s.data, 'base64')); };
const texto = () => evalJs('document.body.innerText');
let fallas = 0;
const chequear = (ok, que) => { console.log(`${ok ? '✔' : '✖'} ${que}`); if (!ok) fallas += 1; };

async function entrar(role) {
    await cdp('Page.navigate', { url: `${BASE}/login` }); await espera(2000);
    const r = await evalJs(`(async () => {
        const r = await fetch('/api/auth/quick-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: '${role}' }), credentials: 'include' });
        const j = await r.json();
        if (!r.ok) return 'ERROR';
        localStorage.setItem('currentUser', JSON.stringify({ ...j.user, loggedInAt: new Date().toISOString() }));
        localStorage.setItem('themeMode', '${process.env.TEMA || 'light'}');
        return j.user.id;
    })()`);
    if (r === 'ERROR') throw new Error('login ' + role);
    return r;
}

const abrirDetalle = async (id) => {
    await cdp('Page.navigate', { url: `${BASE}/vencimientos/${id}` });
    return esperarA(`!!document.querySelector('.nomina__cabeza')`, 90);
};

// Escribe en el buscador de "+ Agregar" y elige el resultado que contiene `quien`.
async function agregarDesdeBuscador(busqueda, quien) {
    if (!(await evalJs(`!!document.querySelector('.nomina__agregar input')`))) {
        await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '+ Agregar').click()`);
        await esperarA(`!!document.querySelector('.nomina__agregar input')`, 10);
    }
    await evalJs(`document.querySelector('.nomina__agregar input').focus()`);
    await cdp('Input.insertText', { text: busqueda });
    const hay = await esperarA(`[...document.querySelectorAll('.nomina__agregar button')].some(b => b.textContent.includes(${JSON.stringify(quien)}))`, 20);
    if (!hay) return false;
    await evalJs(`[...document.querySelectorAll('.nomina__agregar button')].find(b => b.textContent.includes(${JSON.stringify(quien)})).click()`);
    return esperarA(`[...document.querySelectorAll('.nomina-fila__nombre')].some(s => s.textContent.includes(${JSON.stringify(quien)}))`, 20);
}

let venc = null;
const emps = [];
try {
    let target;
    for (let i = 0; i < 40 && !target; i++) { await espera(250); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page'); } catch { /* todavía no */ } }
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    ws.addEventListener('message', (e) => {
        const m = JSON.parse(e.data);
        if (m.id && pend.has(m.id)) { (m.error ? pend.get(m.id).rej : pend.get(m.id).res)(m.error || m.result); pend.delete(m.id); }
        if (m.method === 'Runtime.exceptionThrown') errores.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
        // Los confirm() de la pantalla se aceptan solos.
        if (m.method === 'Page.javascriptDialogOpening') cdp('Page.handleJavaScriptDialog', { accept: true });
    });
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: descargas });
    const ANCHO = Number(process.env.ANCHO || 1280);
    await cdp('Emulation.setDeviceMetricsOverride', { width: ANCHO, height: ANCHO < 600 ? 812 : 900, deviceScaleFactor: 1, mobile: ANCHO < 600 });

    // --- Datos de prueba ---
    const adminId = await entrar('admin');
    const fecha = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
    const { data: v, error: ev } = await sb.from('rrhh_vencimientos').insert({
        titulo: '(prueba) Recorrido', fecha, cada_meses: 1, dia_mes: Number(fecha.slice(8, 10)), responsables: [adminId], creado_por: 'prueba automática',
    }).select().single();
    if (ev) throw ev;
    venc = v;
    for (const [nombre, dni] of [['RECORRIDO UNO', '99999907'], ['RECORRIDO DOS', '99999908']]) {
        const { data, error } = await sb.from('employees').insert({ apellido: 'PRUEBA', nombre, dni, estado_empleado: 'Activo' }).select('id').single();
        if (error) throw error;
        emps.push(data.id);
    }

    // --- 1. La jefa operativa arma la nómina ---
    await entrar('jefe_operativo');
    chequear(await abrirDetalle(venc.id), 'jefa: abre el detalle');
    chequear(await evalJs(`document.body.innerText.includes('Todavía no hay nadie en la nómina')`), 'jefa: nómina vacía con su texto');
    chequear(await agregarDesdeBuscador('99999907', 'RECORRIDO UNO'), 'jefa: agrega por DNI');
    chequear(await agregarDesdeBuscador('prueba recorrido', 'RECORRIDO DOS'), 'jefa: agrega por apellido');
    await evalJs(`document.querySelector('.nomina__agregar input').focus()`);
    await cdp('Input.insertText', { text: 'prueba recorrido' });
    chequear(await esperarA(`[...document.querySelectorAll('.nomina__agregar button[disabled]')].filter(b => b.textContent.includes('ya está')).length === 2`, 20), 'jefa: el buscador marca "ya está" a los dos');
    await foto('recorrido_1_jefa_agrega.png');
    await evalJs(`[...document.querySelectorAll('.nomina-fila')].find(f => f.textContent.includes('RECORRIDO DOS')).querySelector('.nomina-fila__sacar').click()`);
    chequear(await esperarA(`document.querySelectorAll('.nomina-fila').length === 1`, 20), 'jefa: saca a una (queda 1)');
    const t1 = await texto();
    chequear(t1.includes('Pendiente') && t1.includes('1 pendiente de enviar'), 'jefa: queda "Pendiente" y "1 pendiente de enviar"');
    chequear(!t1.includes('Ya la mandé') && !t1.includes('✓ Hecho') && !t1.includes('Editar'), 'jefa: no ve "Ya la mandé", "✓ Hecho" ni "Editar"');

    // --- 2. RRHH manda ---
    await entrar('rrhh');
    await abrirDetalle(venc.id);
    const venceAntes = await evalJs(`document.querySelector('.doc-cabecera .agenda-detalle').textContent`);
    chequear((await texto()).includes('1 pendiente de enviar'), 'rrhh: ve "1 pendiente de enviar"');
    await foto('recorrido_2_rrhh_pendiente.png');
    await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Ya la mandé').click()`);
    chequear(await esperarA(`!document.querySelector('.nomina__pendientes') && !document.body.innerText.includes('Pendiente')`, 20), 'rrhh: "Ya la mandé" saca el pendiente');
    chequear(await evalJs(`document.querySelector('.doc-cabecera .agenda-detalle').textContent`) === venceAntes, 'rrhh: "Ya la mandé" no mueve la fecha');
    await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '✓ Hecho').click()`);
    chequear(await esperarA(`document.querySelector('.doc-cabecera .agenda-detalle').textContent !== ${JSON.stringify(venceAntes)}`, 20), 'rrhh: "✓ Hecho" pasa la fecha al mes siguiente');

    // --- 3. Excel ---
    const { data: ahora } = await sb.from('rrhh_vencimientos').select('titulo, fecha').eq('id', venc.id).single();
    const esperado = nombreArchivoNomina(ahora.titulo, ahora.fecha);
    await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Bajar Excel').click()`);
    let bajado = false;
    for (let i = 0; i < 40 && !bajado; i++) { await espera(250); bajado = fs.existsSync(path.join(descargas, esperado)); }
    chequear(bajado, `Excel bajado como "${esperado}"`);
    await foto('recorrido_3_rrhh_hecho.png');

    // --- 4. Lista (una línea por documentación) -> detalle -> Volver ---
    await cdp('Page.navigate', { url: `${BASE}/vencimientos` });
    await esperarA(`!!document.querySelector('a.doc-fila__link[href="/vencimientos/${venc.id}"]')`, 60);
    // Pedido del usuario (2026-11-25): carteles chicos, solo el nombre. En
    // compu, una línea. En el celular, el nombre (que puede ocupar varias
    // líneas si es largo) y una sola línea abajo: lo que sobra del título
    // tiene que ser poco.
    const movil = ANCHO < 600;
    const medidas = await evalJs(`[...document.querySelectorAll('.doc-fila')].map(f => ${movil}
        ? Math.round(f.getBoundingClientRect().height - f.querySelector('.doc-fila__titulo').getBoundingClientRect().height)
        : Math.round(f.getBoundingClientRect().height))`);
    const tope = movil ? 60 : 64;
    chequear(medidas.length > 0 && medidas.every((h) => h <= tope), `lista: filas compactas (${movil ? 'fuera del título' : 'alto de la fila'}: máximo ${Math.max(...medidas)}px, tope ${tope}px)`);
    chequear(await evalJs(`[...document.querySelectorAll('.agenda-lista button')].length > 0 && [...document.querySelectorAll('.agenda-lista button')].every(b => b.textContent.trim() === '✓ Hecho')`), 'lista: cada fila tiene solo "✓ Hecho" (Editar y Borrar van en el detalle)');
    await foto('recorrido_4_lista_compacta.png');
    await evalJs(`document.querySelector('a.doc-fila__link[href="/vencimientos/${venc.id}"]').click()`);
    chequear(await esperarA(`location.pathname === '/vencimientos/${venc.id}' && !!document.querySelector('.nomina__cabeza')`, 30), 'lista: tocar la fila abre el detalle');
    await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Volver')).click()`);
    chequear(await esperarA(`location.pathname === '/vencimientos'`, 20), '"← Volver" vuelve a la lista');

    // --- 5. Borrar ahora está en el detalle ---
    await abrirDetalle(venc.id);
    await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Borrar').click()`);
    chequear(await esperarA(`location.pathname === '/vencimientos' && !!document.querySelector('a.doc-fila__link') && !document.querySelector('a.doc-fila__link[href="/vencimientos/${venc.id}"]')`, 30), 'rrhh: "Borrar" desde el detalle vuelve a la lista sin esa documentación');

    chequear(errores.length === 0, `sin errores de JS (${errores.length})`);
    if (errores.length) console.log(errores.slice(0, 3));
} finally {
    ws?.close();
    chrome.kill();
    if (venc) await sb.from('rrhh_vencimientos').delete().eq('id', venc.id);
    if (emps.length) await sb.from('employees').delete().in('id', emps);
    fs.rmSync(descargas, { recursive: true, force: true });
}
console.log(fallas ? `\n${fallas} chequeo(s) fallaron` : '\nTodo OK');
process.exit(fallas ? 1 : 0);
