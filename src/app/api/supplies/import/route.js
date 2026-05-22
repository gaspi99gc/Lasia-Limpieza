import { supabase } from '@/lib/db';
import * as XLSX from 'xlsx';

function parseRows(data) {
    const rows = [];
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const r = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v]));
        const nombre = (r.nombre || r.insumos || r.insumo || r.name || '').toString().trim();
        const proveedorName = (r.proveedor || r.supplier || '').toString().trim();
        const isHeaderRow = ['nombre', 'insumos', 'insumo', 'name'].includes(nombre.toLowerCase())
            && ['proveedor', 'supplier'].includes(proveedorName.toLowerCase());
        if (isHeaderRow) continue;
        rows.push({ fila: i + 2, nombre, proveedorName });
    }
    return rows;
}

async function loadLookups() {
    const [{ data: existingSupplies }, { data: allProviders }] = await Promise.all([
        supabase.from('supplies').select('nombre'),
        supabase.from('providers').select('id, name').eq('active', true),
    ]);
    const existingNames = new Set((existingSupplies || []).map(s => s.nombre.toLowerCase().trim()));
    const providersByName = new Map((allProviders || []).map(p => [p.name.toLowerCase().trim(), p.id]));
    return { existingNames, providersByName };
}

function validateRow(fila, nombre, proveedorName, existingNames, providersByName) {
    if (!nombre) return { ok: false, motivo: 'Falta el nombre del insumo' };
    if (!proveedorName) return { ok: false, motivo: 'Falta el proveedor' };
    if (existingNames.has(nombre.toLowerCase())) return { ok: false, motivo: 'Ya existe un insumo con este nombre' };
    const provider_id = providersByName.get(proveedorName.toLowerCase());
    if (!provider_id) return { ok: false, motivo: `Proveedor "${proveedorName}" no existe en la base de datos` };
    return { ok: true, provider_id };
}

function decodeCsvBytes(buffer) {
    const bytes = new Uint8Array(buffer);
    // BOM UTF-8 → confiar en UTF-8.
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }
    // Probar UTF-8 estricto: si el archivo es Latin-1 con caracteres como Ñ,
    // el decoder estricto lanza y caemos a windows-1252 (encoding típico de
    // Excel "Guardar como CSV" en Windows).
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return new TextDecoder('windows-1252').decode(bytes);
    }
}

async function parseFile(file) {
    const isCsv = file.name?.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
    let workbook;
    if (isCsv) {
        const buffer = await file.arrayBuffer();
        const text = decodeCsvBytes(buffer);
        workbook = XLSX.read(text, { type: 'string' });
    } else {
        const bytes = await file.arrayBuffer();
        workbook = XLSX.read(bytes, { type: 'array' });
    }
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(worksheet);
}

export async function POST(req) {
    try {
        const url = new URL(req.url);
        const preview = url.searchParams.get('preview') === 'true';

        const formData = await req.formData();
        const file = formData.get('file');
        if (!file) return Response.json({ error: 'No se proporcionó archivo' }, { status: 400 });

        const data = await parseFile(file);
        if (data.length === 0) return Response.json({ error: 'El archivo está vacío' }, { status: 400 });

        const rows = parseRows(data);
        const { existingNames, providersByName } = await loadLookups();

        const validRows = [];
        const failedRows = [];

        for (const { fila, nombre, proveedorName } of rows) {
            const result = validateRow(fila, nombre, proveedorName, existingNames, providersByName);
            if (result.ok) {
                validRows.push({ fila, nombre, proveedor: proveedorName, provider_id: result.provider_id });
                existingNames.add(nombre.toLowerCase());
            } else {
                failedRows.push({ fila, nombre, proveedor: proveedorName, motivo: result.motivo });
            }
        }

        if (preview) {
            return Response.json({ validRows, failedRows });
        }

        let imported = 0;
        const insertErrors = [];
        for (const row of validRows) {
            const { error } = await supabase
                .from('supplies')
                .insert([{ nombre: row.nombre, unidad: 'unidades', activo: true, provider_id: row.provider_id }]);
            if (error) {
                insertErrors.push({ ...row, motivo: error.message });
            } else {
                imported++;
            }
        }

        return Response.json({ imported, failedRows: [...failedRows, ...insertErrors] });
    } catch (error) {
        console.error('Error importing supplies:', error.message);
        return Response.json({ error: 'Error al importar: ' + error.message }, { status: 500 });
    }
}

export async function GET() {
    const templateData = [
        { insumo: 'Lavandina', proveedor: 'Nombre del proveedor existente' },
        { insumo: 'Detergente', proveedor: 'Otro proveedor existente' },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Insumos');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new Response(buf, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="plantilla-insumos.xlsx"',
        },
    });
}
