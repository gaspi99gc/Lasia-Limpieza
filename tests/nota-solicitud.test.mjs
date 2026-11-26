import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notaNueva, notaCambio } from '../src/lib/nota-solicitud.js';

test('notaNueva: hay nota, RRHH no la abrió y la solicitud sigue abierta', () => {
    assert.equal(notaNueva({ notas: 'franquero 5x2', nota_vista_at: null, estado: 'pendiente' }), true);
    assert.equal(notaNueva({ notas: 'franquero 5x2', nota_vista_at: null, estado: 'en_proceso' }), true);
});

test('notaNueva: no se marca si ya la leyó, si no hay nota o si está cubierta', () => {
    assert.equal(notaNueva({ notas: 'x', nota_vista_at: '2026-11-27T10:00:00Z', estado: 'pendiente' }), false);
    assert.equal(notaNueva({ notas: null, nota_vista_at: null, estado: 'pendiente' }), false);
    assert.equal(notaNueva({ notas: '   ', nota_vista_at: null, estado: 'pendiente' }), false);
    assert.equal(notaNueva({ notas: 'x', nota_vista_at: null, estado: 'cubierta' }), false);
});

test('notaCambio: solo cuenta si cambió el texto, no los espacios de los bordes', () => {
    assert.equal(notaCambio('franquero', 'franquero 5x2'), true);
    assert.equal(notaCambio(null, 'nueva'), true);
    assert.equal(notaCambio('algo', null), true);
    assert.equal(notaCambio('franquero', ' franquero '), false);
    assert.equal(notaCambio(null, ''), false);
});
