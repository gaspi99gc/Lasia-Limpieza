// Prueba de integración: Operaciones ve Personal en solo lectura.
//
// USO: node --test scripts/probar_personal_operaciones.mjs
//      (con `npm run dev` levantado en el puerto 3000)
//
// OJO: .env.local apunta a PRODUCCIÓN. Crea empleados de prueba (DNI
// 99999902 a 99999904) y los borra al final aunque algo falle.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const BASE = 'http://localhost:3000';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const DNIS = ['99999902', '99999903', '99999904'];

const cookies = {};
let emp = null;        // el que se intenta editar
let empBorrar = null;  // el que se intenta borrar

async function entrar(role) {
    const res = await fetch(`${BASE}/api/auth/quick-access`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }),
    });
    if (!res.ok) throw new Error(`quick-access ${role}: ${res.status}`);
    cookies[role] = res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
}

async function api(role, path, { method = 'GET', body, form } = {}) {
    const res = await fetch(BASE + path, {
        method,
        headers: { cookie: cookies[role], ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: form || (body ? JSON.stringify(body) : undefined),
    });
    return res.status;
}

const nuevo = async (nombre, dni) => {
    const { data, error } = await sb.from('employees')
        .insert({ apellido: 'PRUEBA', nombre, dni, estado_empleado: 'Activo' }).select('id').single();
    if (error) throw error;
    return data;
};

before(async () => {
    try { await fetch(`${BASE}/login`); } catch { throw new Error('El localhost no responde: levantá `npm run dev`.'); }
    for (const role of ['operaciones', 'rrhh']) await entrar(role);
    emp = await nuevo('PERSONAL', DNIS[0]);
    empBorrar = await nuevo('PERSONAL BORRAR', DNIS[2]);
});

after(async () => {
    await sb.from('employees').delete().in('dni', DNIS);
});

test('operaciones lee el legajo', async () => {
    assert.equal(await api('operaciones', '/api/employees'), 200);
});

test('operaciones no edita el legajo', async () => {
    assert.equal(await api('operaciones', `/api/employees/${emp.id}`, { method: 'PUT', body: { apellido: 'CAMBIADO' } }), 403);
    const { data } = await sb.from('employees').select('apellido').eq('id', emp.id).single();
    assert.equal(data.apellido, 'PRUEBA');
    assert.equal(await api('operaciones', `/api/employees/${empBorrar.id}`, { method: 'DELETE' }), 403);
    assert.equal(await api('operaciones', '/api/employees', { method: 'POST', body: { apellido: 'PRUEBA', nombre: 'POST OPERACIONES', dni: DNIS[1] } }), 403);
    const fd = new FormData();
    fd.append('employee_id', String(emp.id));
    assert.equal(await api('operaciones', '/api/employee-documents', { method: 'POST', form: fd }), 403);
});

test('rrhh sigue editando', async () => {
    assert.equal(await api('rrhh', `/api/employees/${emp.id}`, { method: 'PUT', body: { apellido: 'PRUEBA' } }), 200);
});
