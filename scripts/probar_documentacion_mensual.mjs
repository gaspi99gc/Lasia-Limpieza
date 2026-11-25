// Prueba de integración de Documentación mensual contra el localhost.
//
// USO: node --test scripts/probar_documentacion_mensual.mjs
//      (con `npm run dev` levantado en el puerto 3000)
//
// OJO: .env.local apunta a PRODUCCIÓN. La prueba crea una documentación
// "(prueba)" con fecha a +60 días (así el cron de las 8 no manda avisos
// reales) y un empleado de prueba, y los borra al final aunque algo falle.
// Nunca llama al cron.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const BASE = 'http://localhost:3000';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const cookies = {};
const usuarios = {};
let venc = null;   // la documentación de prueba
let emp = null;    // el empleado de prueba
let emp2 = null;   // dos más, para los envíos
let emp3 = null;
let vencVacia = null; // una documentación sin nómina, para "Hecho" vacío

const hoyMas = (dias) => {
    const d = new Date(); d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
};

async function entrar(role) {
    const res = await fetch(`${BASE}/api/auth/quick-access`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`quick-access ${role}: ${res.status} ${JSON.stringify(j)}`);
    cookies[role] = res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    usuarios[role] = j.user;
}

// fetch con la sesión del rol. Devuelve { status, body }.
async function api(role, path, { method = 'GET', body } = {}) {
    const res = await fetch(BASE + path, {
        method,
        headers: { cookie: cookies[role], ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    let j = null;
    try { j = await res.json(); } catch { /* sin cuerpo */ }
    return { status: res.status, body: j };
}

const deLaLista = async (role = 'admin') => {
    const r = await api(role, '/api/vencimientos');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.vencimientos.find(v => v.id === venc.id);
};

const filasVigentes = async () => {
    const { data, error } = await sb.from('rrhh_vencimientos_nomina')
        .select('id, employee_id, enviado_at').eq('vencimiento_id', venc.id).is('quitado_at', null);
    if (error) throw error;
    return data;
};

const vaciarNomina = async () => {
    const { error } = await sb.from('rrhh_vencimientos_nomina').delete().eq('vencimiento_id', venc.id);
    if (error) throw error;
};

before(async () => {
    try { await fetch(`${BASE}/login`); } catch { throw new Error('El localhost no responde: levantá `npm run dev`.'); }
    for (const role of ['admin', 'rrhh', 'operaciones', 'jefe_operativo', 'supervisor']) await entrar(role);

    const { data: v, error: ev } = await sb.from('rrhh_vencimientos').insert({
        titulo: '(prueba) Documentación', fecha: hoyMas(60), cada_meses: 1, dia_mes: Number(hoyMas(60).slice(8, 10)),
        responsables: [usuarios.admin.id], creado_por: 'prueba automática',
    }).select().single();
    if (ev) throw ev;
    venc = v;

    const { data: e, error: ee } = await sb.from('employees').insert({
        apellido: 'PRUEBA', nombre: 'DOCUMENTACION', dni: '99999901', estado_empleado: 'Activo',
    }).select('id').single();
    if (ee) throw ee;
    emp = e;

    const otro = async (apellido, dni) => {
        const { data, error } = await sb.from('employees')
            .insert({ apellido, nombre: 'DOCUMENTACION', dni, estado_empleado: 'Activo' }).select('id').single();
        if (error) throw error;
        return data;
    };
    emp2 = await otro('PRUEBAB', '99999905');
    emp3 = await otro('PRUEBAA', '99999906');
});

after(async () => {
    const vencs = [venc, vencVacia].filter(Boolean).map(v => v.id);
    if (vencs.length) await sb.from('rrhh_vencimientos').delete().in('id', vencs);
    const emps = [emp, emp2, emp3].filter(Boolean).map(x => x.id);
    if (emps.length) await sb.from('employees').delete().in('id', emps);
});

test('operaciones puede ver la lista y el detalle', async () => {
    const lista = await api('operaciones', '/api/vencimientos');
    assert.equal(lista.status, 200, JSON.stringify(lista.body));
    assert.equal(lista.body.puede_gestionar, false);
    assert.deepEqual(lista.body.usuarios, []);
    const detalle = await api('operaciones', `/api/vencimientos?id=${venc.id}`);
    assert.equal(detalle.status, 200, JSON.stringify(detalle.body));
    assert.equal(detalle.body.vencimiento.id, venc.id);
    assert.ok(Array.isArray(detalle.body.nomina));
});

test('operaciones no gestiona (foco 2)', async () => {
    assert.equal((await api('operaciones', '/api/vencimientos', { method: 'POST', body: { titulo: 'x', fecha: hoyMas(60) } })).status, 403);
    assert.equal((await api('operaciones', '/api/vencimientos', { method: 'PATCH', body: { id: venc.id, titulo: 'x', fecha: hoyMas(60) } })).status, 403);
    assert.equal((await api('operaciones', `/api/vencimientos?id=${venc.id}`, { method: 'DELETE' })).status, 403);
});

test('supervisor no entra', async () => {
    assert.equal((await api('supervisor', '/api/vencimientos')).status, 403);
});

test('jefa operativa agrega y saca', async () => {
    const alta = await api('jefe_operativo', '/api/vencimientos/nomina', { method: 'POST', body: { vencimiento_id: venc.id, employee_id: emp.id } });
    assert.equal(alta.status, 201, JSON.stringify(alta.body));

    const detalle = await api('jefe_operativo', `/api/vencimientos?id=${venc.id}`);
    const fila = detalle.body.nomina.find(f => f.employee_id === emp.id);
    assert.ok(fila, 'el detalle tiene que traer al agregado');
    assert.equal(fila.enviado_at, null);
    assert.equal(fila.dni, '99999901');

    const enLista = await deLaLista('jefe_operativo');
    assert.equal(enLista.nomina_total, 1);
    assert.equal(enLista.pendientes, 1);

    const baja = await api('jefe_operativo', `/api/vencimientos/nomina?id=${fila.id}`, { method: 'DELETE' });
    assert.equal(baja.status, 200, JSON.stringify(baja.body));
    assert.equal((await deLaLista()).nomina_total, 0);
    await vaciarNomina();
});

test('no se agrega dos veces, ni con dos pedidos a la vez (foco 3)', async () => {
    const body = { vencimiento_id: venc.id, employee_id: emp.id };
    const [a, b] = await Promise.all([
        api('operaciones', '/api/vencimientos/nomina', { method: 'POST', body }),
        api('operaciones', '/api/vencimientos/nomina', { method: 'POST', body }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
    assert.equal([a, b].find(r => r.status === 409).body.error, 'Ya está en la nómina.');
    assert.equal((await filasVigentes()).length, 1);
    await vaciarNomina();
});

test('la baja saca de la nómina sin abrir el detalle (foco 4)', async () => {
    assert.equal((await api('rrhh', '/api/vencimientos/nomina', { method: 'POST', body: { vencimiento_id: venc.id, employee_id: emp.id } })).status, 201);
    await sb.from('employees').update({ estado_empleado: 'Baja', fecha_baja: hoyMas(0) }).eq('id', emp.id);
    try {
        assert.equal((await deLaLista()).nomina_total, 0);
    } finally {
        await sb.from('employees').update({ estado_empleado: 'Activo', fecha_baja: null }).eq('id', emp.id);
    }
    const detalle = await api('admin', `/api/vencimientos?id=${venc.id}`);
    assert.equal(detalle.body.nomina.some(f => f.employee_id === emp.id), false, 'si reingresa no vuelve solo');
    await vaciarNomina();
});

test('no se puede agregar a alguien dado de baja', async () => {
    await sb.from('employees').update({ estado_empleado: 'Baja', fecha_baja: hoyMas(0) }).eq('id', emp.id);
    try {
        const r = await api('operaciones', '/api/vencimientos/nomina', { method: 'POST', body: { vencimiento_id: venc.id, employee_id: emp.id } });
        assert.equal(r.status, 400);
        assert.equal(r.body.error, 'Esa persona está dada de baja.');
    } finally {
        await sb.from('employees').update({ estado_empleado: 'Activo', fecha_baja: null }).eq('id', emp.id);
    }
});

test('buscar por DNI', async () => {
    const r = await api('operaciones', '/api/vencimientos/operarios?q=9999990');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.some(o => o.dni === '99999901'), JSON.stringify(r.body));
});
