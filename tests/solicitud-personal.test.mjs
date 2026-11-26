import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    direccionCorta, resumenDias, limpiarPersonas, limpiarGrupo, filasPdf, tituloPdf,
} from '../src/lib/solicitud-personal.js';

test('direccionCorta: saca códigos postales y repetidos, y CABA va corto', () => {
    assert.equal(
        direccionCorta('Calle Quevedo 3365, Buenos Aires, Ciudad Autónoma de Buenos Aires, C1417, Ciudad Autónoma de Buenos Aires'),
        'Calle Quevedo 3365, CABA'
    );
    assert.equal(
        direccionCorta('Avenida del Libertador 1000, Vicente López, B1638, Provincia de Buenos Aires'),
        'Avenida del Libertador 1000, Vicente López, Provincia de Buenos Aires'
    );
    assert.equal(direccionCorta(null), '');
});

test('resumenDias: igual que antes en la pantalla', () => {
    assert.equal(resumenDias('lun,mar,mie,jue,vie,sab,dom'), 'Todos los días');
    assert.equal(resumenDias('lun,mar,mie,jue,vie'), 'Lunes a viernes');
    assert.equal(resumenDias(['sab', 'dom']), 'Fines de semana');
    assert.equal(resumenDias(''), '');
});

test('limpiarPersonas: DNI solo con números y nombre en mayúsculas', () => {
    assert.deepEqual(
        limpiarPersonas([{ dni: '40.123.456', nombre: ' perez juana ' }], 1),
        { personas: [{ dni: '40123456', nombre: 'PEREZ JUANA' }] }
    );
});

test('limpiarPersonas: pide todos los datos, un DNI válido y una por persona pedida', () => {
    assert.deepEqual(limpiarPersonas([{ dni: '40123456', nombre: '' }], 1), { error: 'Completá el DNI y el nombre de cada persona.' });
    assert.deepEqual(limpiarPersonas([{ dni: '123', nombre: 'PEREZ' }], 1), { error: 'El DNI tiene que tener 7 u 8 números.' });
    assert.deepEqual(limpiarPersonas([{ dni: '40123456', nombre: 'PEREZ' }], 2), { error: 'Faltan personas: se pidieron 2.' });
    assert.deepEqual(limpiarPersonas(null, 1), { error: 'Faltan personas: se pidieron 1.' });
});

test('limpiarGrupo: solo un uuid', () => {
    assert.equal(limpiarGrupo('5f0c1a52-6a3e-4c2b-9d43-2b7f0e6a2311'), '5f0c1a52-6a3e-4c2b-9d43-2b7f0e6a2311');
    assert.equal(limpiarGrupo('x'), null);
    assert.equal(limpiarGrupo(undefined), null);
});

const DENO = {
    service_name: 'DENO', urgencia: 'urgente', por_vacaciones: true, cantidad: 1, sexo: 'mujer',
    tipo_jornada: 'completa', hora_desde: '06:00', hora_hasta: '14:00', dias: 'lun,mar,mie,jue,vie,sab,dom',
    fecha_necesaria: '2026-11-27', motivo: null, notas: 'franquero', personas_tomadas: null,
};

test('filasPdf: servicio, qué se pide, para cuándo y comentarios', () => {
    assert.deepEqual(filasPdf([DENO]), [[
        'DENO\nUrgente\nVacaciones',
        '1 mujer · Completa\n06:00 a 14:00\nTodos los días',
        '27/11/2026',
        'franquero',
    ]]);
});

test('filasPdf: si ya entró alguien, va primero en los comentarios', () => {
    const [fila] = filasPdf([{ ...DENO, personas_tomadas: [{ dni: '40123456', nombre: 'PEREZ JUANA' }] }]);
    assert.ok(fila[3].startsWith('Entró: PEREZ JUANA · DNI 40123456'));
});

test('tituloPdf: dice qué se está bajando', () => {
    assert.equal(tituloPdf('todos', '27/11/2026'), 'Solicitudes de personal abiertas al 27/11/2026');
    assert.equal(tituloPdf('vacaciones', '27/11/2026'), 'Solicitudes de personal para cubrir vacaciones al 27/11/2026');
    assert.equal(tituloPdf('cubierta', '27/11/2026'), 'Solicitudes de personal cubiertas al 27/11/2026');
});
