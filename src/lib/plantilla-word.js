import JSZip from 'jszip';

// Llena una plantilla de Word (.docx) con marcadores {{ASI}}.
//
// - `campos`: cada {{CLAVE}} del documento se cambia por su valor (las fechas).
// - `filas`: la fila de tabla que tiene {{DNI}} es la fila modelo; se repite
//   una vez por persona, con {{DNI}}, {{APELLIDO}} y {{NOMBRE}} cambiados.
//   Sin personas, la fila modelo se saca y queda solo el encabezado.
//
// Las plantillas se arman desde el Word del cliente, reemplazando con Word las
// fechas por los marcadores: así cada marcador queda entero en un solo texto.
// Viven en Supabase Storage (bucket privado "plantillas"), no en el repo,
// porque tienen datos personales y el repo es público.

const escapar = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const reemplazar = (xml, valores) => Object.entries(valores)
    .reduce((s, [clave, valor]) => s.split(`{{${clave}}}`).join(escapar(valor)), xml);

export async function llenarPlantillaWord(plantilla, { campos = {}, filas = [] }) {
    const zip = await JSZip.loadAsync(plantilla);
    const archivo = zip.file('word/document.xml');
    if (!archivo) throw new Error('La plantilla no es un Word (.docx).');
    let xml = await archivo.async('string');

    const marca = xml.indexOf('{{DNI}}');
    if (marca < 0) throw new Error('La plantilla no tiene la fila modelo con {{DNI}}.');
    // La fila que contiene la marca: desde su <w:tr ...> (no <w:trPr>) hasta su </w:tr>.
    const inicios = [...xml.slice(0, marca).matchAll(/<w:tr[ >]/g)];
    const desde = inicios[inicios.length - 1].index;
    const hasta = xml.indexOf('</w:tr>', marca) + '</w:tr>'.length;
    const modelo = xml.slice(desde, hasta);
    const nuevas = filas.map((f) => reemplazar(modelo, f)).join('');
    xml = xml.slice(0, desde) + nuevas + xml.slice(hasta);

    zip.file('word/document.xml', reemplazar(xml, campos));
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
