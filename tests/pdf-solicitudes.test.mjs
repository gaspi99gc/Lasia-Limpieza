import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { armarPdfSolicitudes } from '../src/lib/pdf-solicitudes.js';
import { filasPdf } from '../src/lib/solicitud-personal.js';

const DENO = {
    service_name: 'DENO', urgencia: 'normal', por_vacaciones: false, cantidad: 1, sexo: 'hombre',
    tipo_jornada: 'completa', dias: 'lun,mar,mie,jue,vie,sab,dom', fecha_necesaria: '2026-11-27',
    notas: 'franquero 5 por dos', personas_tomadas: null,
};

test('armarPdfSolicitudes: una hoja con el título y la tabla', () => {
    const titulo = 'Solicitudes de personal abiertas al 27/11/2026';
    const doc = armarPdfSolicitudes(jsPDF, autoTable, { filas: filasPdf([DENO]), titulo });
    assert.equal(doc.getNumberOfPages(), 1);
    const crudo = doc.output();
    assert.ok(crudo.includes('DENO'));
    assert.ok(crudo.includes(titulo));
    assert.ok(crudo.includes('Comentarios'));
});
