import { supabase } from '@/lib/db';
import ExcelJS from 'exceljs';

export async function GET() {
    const { data, error } = await supabase
        .from('services')
        .select('name, address, encargado_nombre, encargado_telefono')
        .order('name', { ascending: true });

    if (error) return Response.json({ error: 'Error al obtener servicios' }, { status: 500 });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Servicios');

    sheet.columns = [
        { header: 'Servicio', key: 'name', width: 40 },
        { header: 'Dirección', key: 'address', width: 50 },
        { header: 'Encargado', key: 'encargado_nombre', width: 25 },
        { header: 'Teléfono encargado', key: 'encargado_telefono', width: 20 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A4A' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
    headerRow.height = 20;

    (data || []).forEach(s => sheet.addRow({
        name: s.name,
        address: s.address,
        encargado_nombre: s.encargado_nombre || '',
        encargado_telefono: s.encargado_telefono || '',
    }));

    const buffer = await workbook.xlsx.writeBuffer();

    return new Response(buffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="servicios.xlsx"',
        },
    });
}
