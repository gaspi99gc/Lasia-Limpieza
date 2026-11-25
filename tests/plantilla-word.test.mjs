import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { llenarPlantillaWord } from '../src/lib/plantilla-word.js';
import { fechasSugeridas, fechaWord, nombreArchivoWord, plantillaDe } from '../src/lib/plantillas-documentacion.js';

// Un .docx mínimo con la misma forma que la plantilla de Zara: un párrafo con
// marcadores y una tabla con encabezado + una fila modelo.
async function docxDePrueba() {
    const fila = (a, b, c) => `<w:tr><w:trPr><w:trHeight w:val="360"/></w:trPr>${[a, b, c].map((t) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`;
    const xml = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
        + '<w:p><w:r><w:t>Fecha {{FECHA}} inicio {{INICIO}} fin {{FIN}}</w:t></w:r></w:p>'
        + `<w:tbl>${fila('DNI', 'APELLIDO', 'NOMBRE')}${fila('{{DNI}}', '{{APELLIDO}}', '{{NOMBRE}}')}</w:tbl>`
        + '</w:body></w:document>';
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
    zip.file('word/document.xml', xml);
    return zip.generateAsync({ type: 'nodebuffer' });
}
const documento = async (buf) => (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');
const filas = (xml) => xml.match(/<w:tr[ >]/g).length;

test('llenarPlantillaWord pone las fechas y una fila por persona, con los textos escapados', async () => {
    const xml = await documento(await llenarPlantillaWord(await docxDePrueba(), {
        campos: { FECHA: '19/12/2026', INICIO: '21/12/2026', FIN: '20/01/2027' },
        filas: [
            { DNI: '25676481', APELLIDO: 'ACOSTA', NOMBRE: 'CARINA' },
            { DNI: '94184172', APELLIDO: 'PÉREZ & HIJOS', NOMBRE: '<ANA>' },
        ],
    }));
    assert.ok(xml.includes('Fecha 19/12/2026 inicio 21/12/2026 fin 20/01/2027'));
    assert.equal(filas(xml), 3);                       // encabezado + 2 personas
    assert.ok(xml.includes('<w:t>ACOSTA</w:t>') && xml.includes('<w:t>25676481</w:t>'));
    assert.ok(xml.includes('PÉREZ &amp; HIJOS') && xml.includes('&lt;ANA&gt;'));
    assert.equal(/\{\{[A-Z]+\}\}/.test(xml), false, 'no tiene que quedar ningún marcador');
});

test('llenarPlantillaWord con la nómina vacía deja solo el encabezado', async () => {
    const xml = await documento(await llenarPlantillaWord(await docxDePrueba(), {
        campos: { FECHA: '1', INICIO: '2', FIN: '3' }, filas: [],
    }));
    assert.equal(filas(xml), 1);
    assert.equal(xml.includes('{{DNI}}'), false);
});

test('fechasSugeridas: período nuevo desde el día siguiente al vencimiento real', () => {
    // La app vence el 19/12 porque se puso un día antes del real (20/12).
    assert.deepEqual(fechasSugeridas('2026-12-19', 1, '2026-12-19'), { fecha: '2026-12-19', inicio: '2026-12-21', fin: '2027-01-20' });
    // Real 31/01: el mes siguiente no tiene 31, termina el 28/02.
    assert.deepEqual(fechasSugeridas('2027-01-30', 1, '2027-01-29'), { fecha: '2027-01-29', inicio: '2027-02-01', fin: '2027-02-28' });
});

test('fechaWord y nombreArchivoWord', () => {
    assert.equal(fechaWord('2026-12-21'), '21/12/2026');
    assert.equal(nombreArchivoWord('ZARA UNI - SOLICITUD DE AUT', '2026-12-19'), 'ZARA UNI - SOLICITUD DE AUT 19-12-2026.docx');
});

test('plantillaDe: solo FAO ZARA UNI tiene Word por ahora', () => {
    assert.equal(plantillaDe(8)?.archivo, 'zara-uni.docx');
    assert.equal(plantillaDe(6), null);
});
