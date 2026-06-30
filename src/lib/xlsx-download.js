// Descarga robusta de archivos .xlsx en el navegador.
//
// xlsx@0.18.5 con Next 16 / Node 24 tiene un bug donde XLSX.writeFile genera
// un archivo vacio o corrupto a partir de la segunda descarga (la primera sale
// bien). En vez de delegar la descarga en writeFile, generamos el buffer con
// XLSX.write y disparamos la descarga nosotros con un Blob + anchor temporal.
//
// Uso:
//   const XLSX = await import('xlsx');
//   const ws = XLSX.utils.json_to_sheet(rows);
//   const wb = XLSX.utils.book_new();
//   XLSX.utils.book_append_sheet(wb, ws, 'Hoja');
//   downloadWorkbook(XLSX, wb, 'Reporte.xlsx');

const XLSX_MIME =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// El import dinamico de un modulo CJS puede dejar la API bajo `.default`
// segun como el bundler haga el interop. Normalizamos para tomar siempre
// el objeto que expone `write`.
function resolveXLSX(mod) {
    if (mod && typeof mod.write === 'function') return mod;
    if (mod?.default && typeof mod.default.write === 'function') return mod.default;
    return mod;
}

export function downloadWorkbook(xlsxModule, workbook, filename) {
    const XLSX = resolveXLSX(xlsxModule);
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([buffer], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Liberamos el object URL en el siguiente tick para no cortar la descarga.
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
