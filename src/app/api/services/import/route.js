import { supabase } from '@/lib/db';
import * as XLSX from 'xlsx';
import { searchAmbaAddresses } from '@/lib/geocoding';

export async function POST(req) {
    try {
        const formData = await req.formData();
        const file = formData.get('file');

        if (!file) {
            return Response.json({ error: 'No se proporcionó archivo' }, { status: 400 });
        }

        const isCsv = file.name?.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
        let workbook;
        if (isCsv) {
            const text = await file.text();
            workbook = XLSX.read(text, { type: 'string' });
        } else {
            const bytes = await file.arrayBuffer();
            workbook = XLSX.read(bytes, { type: 'array' });
        }
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(worksheet);

        if (data.length === 0) {
            return Response.json({ error: 'El archivo está vacío' }, { status: 400 });
        }

        // Fetch existing service names for duplicate detection
        const { data: existingServices } = await supabase.from('services').select('name');
        const existingNames = new Set(
            (existingServices || []).map(s => s.name.toLowerCase().trim())
        );

        let imported = 0;
        const failedRows = [];

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rowNum = i + 2;

            const name = (row.nombre || row.Nombre || row.name || '').toString().trim();
            const address = (row.direccion || row.Direccion || row['dirección'] || row['Dirección'] || row.address || '').toString().trim();
            const rawLat = row.lat ?? row.Lat ?? row.latitude ?? row.Latitud;
            const rawLng = row.lng ?? row.Lng ?? row.longitude ?? row.Longitud;

            if (!name) {
                failedRows.push({ fila: rowNum, nombre: name || '', direccion: address, lat: rawLat ?? '', lng: rawLng ?? '', motivo: 'Falta el nombre del servicio' });
                continue;
            }

            if (!address) {
                failedRows.push({ fila: rowNum, nombre: name, direccion: '', lat: rawLat ?? '', lng: rawLng ?? '', motivo: 'Falta la dirección' });
                continue;
            }

            if (existingNames.has(name.toLowerCase())) {
                failedRows.push({ fila: rowNum, nombre: name, direccion: address, lat: rawLat ?? '', lng: rawLng ?? '', motivo: 'Ya existe un servicio con este nombre' });
                continue;
            }

            let lat = parseFloat(rawLat);
            let lng = parseFloat(rawLng);
            let resolvedAddress = address;

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                try {
                    const { candidates } = await searchAmbaAddresses(address);
                    if (candidates.length === 0) {
                        failedRows.push({ fila: rowNum, nombre: name, direccion: address, lat: '', lng: '', motivo: `No se encontró "${address}" dentro de AMBA` });
                        continue;
                    }
                    const best = candidates[0];
                    lat = best.lat;
                    lng = best.lng;
                    resolvedAddress = best.address;
                } catch (geoError) {
                    failedRows.push({ fila: rowNum, nombre: name, direccion: address, lat: '', lng: '', motivo: geoError.message || 'No se pudo geocodificar la dirección' });
                    continue;
                }
            }

            try {
                const { error: insertError } = await supabase
                    .from('services')
                    .insert([{ name, address: resolvedAddress, lat, lng }]);

                if (insertError) {
                    failedRows.push({ fila: rowNum, nombre: name, direccion: address, lat, lng, motivo: insertError.message });
                } else {
                    existingNames.add(name.toLowerCase());
                    imported++;
                }
            } catch (e) {
                failedRows.push({ fila: rowNum, nombre: name, direccion: address, lat, lng, motivo: e.message });
            }
        }

        return Response.json({ imported, failedRows: failedRows.length > 0 ? failedRows : undefined });
    } catch (error) {
        console.error('Error importing services:', error.message);
        return Response.json({ error: 'Error al importar: ' + error.message }, { status: 500 });
    }
}

export async function GET() {
    const templateData = [
        { nombre: 'Hospital Rivadavia', direccion: 'Av. Las Heras 2670, Buenos Aires', lat: '', lng: '' },
        { nombre: 'Ejemplo con coordenadas', direccion: 'Av. Corrientes 1234, Buenos Aires', lat: -34.6037, lng: -58.3816 },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Servicios');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new Response(buf, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="plantilla-servicios.xlsx"',
        },
    });
}
