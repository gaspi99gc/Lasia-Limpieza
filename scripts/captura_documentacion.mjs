// Captura de una pantalla con Chrome headless, entrando con un rol.
//
// USO: node scripts/captura_documentacion.mjs <rol> <url> <carpeta-salida> [anchos] [temas]
//      node scripts/captura_documentacion.mjs operaciones /vencimientos ./capturas
//      node scripts/captura_documentacion.mjs rrhh /vencimientos/6 ./capturas 1280,375 light,dark
//
// Contra el localhost (npm run dev). Imprime la URL final (para ver si el
// middleware lo echó), el título, los botones y las entradas del menú que
// hay en pantalla, y los errores de JS. Saca una captura por ancho y tema.
// Solo mira: no toca nada.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const [rol, url, out = '.', anchosArg = '1280,375', temasArg = 'light,dark'] = process.argv.slice(2);
if (!rol || !url) { console.log('USO: node scripts/captura_documentacion.mjs <rol> <url> <carpeta-salida> [anchos] [temas]'); process.exit(1); }
const BASE = 'http://localhost:3000';
const PORT = 9333 + Math.floor(Math.random() * 500);
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
fs.mkdirSync(out, { recursive: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${perfil}`, '--no-first-run', 'about:blank',
], { stdio: 'ignore' });

const espera = (ms) => new Promise(r => setTimeout(r, ms));
let ws; let n = 0; const pend = new Map(); const errores = [];
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++n; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
const esperarA = async (expr, seg = 60) => { for (let i = 0; i < seg * 2; i++) { await espera(500); if (await evalJs(expr)) return true; } return false; };
const nombre = (s) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');

try {
    let target;
    for (let i = 0; i < 40 && !target; i++) { await espera(250); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page'); } catch { /* todavía no */ } }
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    ws.addEventListener('message', (e) => {
        const m = JSON.parse(e.data);
        if (m.id && pend.has(m.id)) { (m.error ? pend.get(m.id).rej : pend.get(m.id).res)(m.error || m.result); pend.delete(m.id); }
        if (m.method === 'Runtime.exceptionThrown') errores.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
    });
    await cdp('Page.enable'); await cdp('Runtime.enable');

    for (const ancho of anchosArg.split(',').map(Number)) {
        for (const tema of temasArg.split(',')) {
            await cdp('Emulation.setDeviceMetricsOverride', { width: ancho, height: ancho < 600 ? 812 : 900, deviceScaleFactor: 1, mobile: ancho < 600 });
            await cdp('Page.navigate', { url: `${BASE}/login` }); await espera(2500);
            const login = await evalJs(`(async () => {
                const r = await fetch('/api/auth/quick-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: '${rol}' }), credentials: 'include' });
                const j = await r.json();
                if (!r.ok) return 'ERROR ' + JSON.stringify(j);
                localStorage.setItem('currentUser', JSON.stringify({ ...j.user, loggedInAt: new Date().toISOString() }));
                localStorage.setItem('themeMode', '${tema}');
                return 'ok';
            })()`);
            if (login !== 'ok') throw new Error(`login ${rol}: ${login}`);
            await cdp('Page.navigate', { url: BASE + url });
            await esperarA(`document.readyState === 'complete' && !/Cargando/.test(document.body.innerText) && document.body.innerText.length > 100`, 90);
            await espera(1500);
            const info = await evalJs(`({
                url: location.pathname + location.search,
                titulo: document.querySelector('h1')?.textContent.trim() || null,
                botones: [...new Set([...document.querySelectorAll('main button, main a.btn, .agenda button')].map(b => b.textContent.trim()).filter(Boolean))],
                menu: [...document.querySelectorAll('nav a, aside a')].map(a => a.textContent.trim()).filter(t => /Documentaci|Vencimiento/.test(t)),
                textos: [...document.querySelectorAll('.agenda-nomina, .agenda-estado')].map(e => e.textContent.trim()).slice(0, 12),
            })`);
            console.log(`[${rol} ${ancho} ${tema}]`, JSON.stringify(info));
            const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
            fs.writeFileSync(path.join(out, `${nombre(rol)}_${nombre(url) || 'inicio'}_${ancho}_${tema}.png`), Buffer.from(shot.data, 'base64'));
        }
    }
    console.log('errores JS:', errores.length, errores.slice(0, 3));
} finally {
    ws?.close();
    chrome.kill();
}
