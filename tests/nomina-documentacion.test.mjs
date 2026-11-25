import test from 'node:test';
import assert from 'node:assert/strict';
import { estaDeBaja, dniDeCelda, snapshotNomina, resumenNomina, nombreArchivoNomina } from '../src/lib/nomina-documentacion.js';

test('estaDeBaja', () => {
    assert.equal(estaDeBaja({ estado_empleado: 'Activo', fecha_baja: null }), false);
    assert.equal(estaDeBaja({ estado_empleado: 'Baja', fecha_baja: null }), true);
    assert.equal(estaDeBaja({ estado_empleado: 'Activo', fecha_baja: '2026-11-20' }), true);
});

test('dniDeCelda: DNI, CUIL en la columna DNI, basura', () => {
    assert.equal(dniDeCelda(21307696), '21307696');
    assert.equal(dniDeCelda('27411643609'), '41164360');   // CUIL de DUARTE KAREN
    assert.equal(dniDeCelda('20-26887835-2'), '26887835');
    assert.equal(dniDeCelda(' 5.123.456 '), '5123456');
    assert.equal(dniDeCelda(''), null);
    assert.equal(dniDeCelda('ZARA AVELLANEDA'), null);
    assert.equal(dniDeCelda(123), null);
});

test('snapshotNomina ordena y deja solo los 4 campos', () => {
    const s = snapshotNomina([
        { employee_id: 2, apellido: 'PEREZ', nombre: 'JUAN', dni: '1', enviado_at: null, extra: 1 },
        { employee_id: 1, apellido: 'GOMEZ', nombre: 'ANA', dni: '2' },
    ]);
    assert.deepEqual(s, [
        { employee_id: 1, apellido: 'GOMEZ', nombre: 'ANA', dni: '2' },
        { employee_id: 2, apellido: 'PEREZ', nombre: 'JUAN', dni: '1' },
    ]);
});

test('resumenNomina cuenta total y pendientes por documentación', () => {
    assert.deepEqual(resumenNomina([
        { vencimiento_id: 6, enviado_at: '2026-11-25T10:00:00Z' },
        { vencimiento_id: 6, enviado_at: null },
        { vencimiento_id: 7, enviado_at: null },
    ]), { 6: { total: 2, pendientes: 1 }, 7: { total: 1, pendientes: 1 } });
});

test('nombreArchivoNomina limpia caracteres que Windows no acepta', () => {
    assert.equal(nombreArchivoNomina('FAO ZARA TOM', '2026-12-04'), 'Nomina FAO ZARA TOM 2026-12.xlsx');
    assert.equal(
        nombreArchivoNomina('DOCU POSIBLES REEMPLAZOS WE WORK BUTTY / CORRIENTES', '2026-11-28'),
        'Nomina DOCU POSIBLES REEMPLAZOS WE WORK BUTTY - CORRIENTES 2026-11.xlsx'
    );
});
