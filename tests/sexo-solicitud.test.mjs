import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEXOS, limpiarSexo, palabraPersonas, textoPersonas } from '../src/lib/sexo-solicitud.js';

test('las tres opciones, en el orden en que las pidió el usuario', () => {
    assert.deepEqual(SEXOS.map((s) => s.key), ['hombre', 'mujer', 'indistinto']);
});

test('limpiarSexo: acepta las tres y lo demás queda indistinto', () => {
    assert.equal(limpiarSexo('hombre'), 'hombre');
    assert.equal(limpiarSexo('mujer'), 'mujer');
    assert.equal(limpiarSexo('indistinto'), 'indistinto');
    assert.equal(limpiarSexo(' Mujer '), 'mujer');
    assert.equal(limpiarSexo(undefined), 'indistinto');
    assert.equal(limpiarSexo(''), 'indistinto');
    assert.equal(limpiarSexo('otro'), 'indistinto');
});

test('textoPersonas: cantidad con el sexo pedido, en singular o plural', () => {
    assert.equal(textoPersonas(1, 'mujer'), '1 mujer');
    assert.equal(textoPersonas(2, 'mujer'), '2 mujeres');
    assert.equal(textoPersonas(1, 'hombre'), '1 hombre');
    assert.equal(textoPersonas(3, 'hombre'), '3 hombres');
    assert.equal(textoPersonas(1, 'indistinto'), '1 persona');
    assert.equal(textoPersonas(2, null), '2 personas');
});

test('palabraPersonas: solo la palabra, para ponerla debajo del número', () => {
    assert.equal(palabraPersonas(1, 'mujer'), 'mujer');
    assert.equal(palabraPersonas(4, 'hombre'), 'hombres');
    assert.equal(palabraPersonas(2, 'indistinto'), 'personas');
});
