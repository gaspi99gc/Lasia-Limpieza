import { supabase } from '@/lib/db';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';

const fmtYMD = (ymd) => { const [y, m, d] = ymd.split('-'); return `${d}/${m}/${y}`; };

function argentinaRangeToUTC(dateFrom, dateTo) {
    const [fy, fm, fd] = dateFrom.split('-').map(Number);
    const [ty, tm, td] = dateTo.split('-').map(Number);
    const start = new Date(Date.UTC(fy, fm - 1, fd, 3, 0, 0));
    const end = new Date(Date.UTC(ty, tm - 1, td + 1, 3, 0, 0));
    return { start: start.toISOString(), end: end.toISOString() };
}

// Excel sheet names: max 31 chars, can't contain : \ / ? * [ ], must be unique.
function sanitizeSheetName(name, used) {
    const base = (name || 'Servicio')
        .replace(/[:\\/?*[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 31) || 'Servicio';
    let candidate = base;
    let i = 2;
    while (used.has(candidate.toLowerCase())) {
        const suffix = ` (${i++})`;
        candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const dateFrom = searchParams.get('date_from');
        const dateTo = searchParams.get('date_to');

        const dateRe = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateFrom || !dateTo || !dateRe.test(dateFrom) || !dateRe.test(dateTo)) {
            return Response.json({ error: 'Parámetros date_from y date_to (YYYY-MM-DD) son requeridos.' }, { status: 400 });
        }
        if (dateFrom > dateTo) {
            return Response.json({ error: 'La fecha de inicio no puede ser posterior a la de fin.' }, { status: 400 });
        }

        const { start, end } = argentinaRangeToUTC(dateFrom, dateTo);

        const { data: requests, error: reqErr } = await supabase
            .from('supply_requests')
            .select('id, service_id, supervisor_id, notas')
            .gte('created_at', start)
            .lt('created_at', end);
        if (reqErr) throw reqErr;

        const rows = requests || [];
        if (rows.length === 0) {
            return Response.json({ error: 'No hay pedidos en el período seleccionado.' }, { status: 404 });
        }

        const requestIds = rows.map(r => r.id);
        const reqMap = new Map(rows.map(r => [r.id, r]));

        // Items joined with supply + provider, only Limpos kept.
        const pageSize = 1000;
        const items = [];
        for (let from = 0; ; from += pageSize) {
            const { data: chunk, error: itemErr } = await supabase
                .from('supply_request_items')
                .select('request_id, supply_id, cantidad, supplies:supply_id(nombre, unidad, providers(name))')
                .in('request_id', requestIds)
                .range(from, from + pageSize - 1);
            if (itemErr) throw itemErr;
            if (!chunk || chunk.length === 0) break;
            items.push(...chunk);
            if (chunk.length < pageSize) break;
        }

        const serviceIds = [...new Set(rows.map(r => r.service_id).filter(Boolean))];
        const supervisorIds = [...new Set(rows.map(r => r.supervisor_id).filter(Boolean))];

        const [servicesRes, supervisorsRes] = await Promise.all([
            serviceIds.length
                ? supabase.from('services').select('id, name').in('id', serviceIds)
                : Promise.resolve({ data: [] }),
            supervisorIds.length
                ? supabase.from('supervisors').select('id, app_users:app_user_id(name, surname)').in('id', supervisorIds)
                : Promise.resolve({ data: [] }),
        ]);

        const serviceMap = new Map((servicesRes.data || []).map(s => [s.id, s]));
        const supervisorMap = new Map((supervisorsRes.data || []).map(s => [s.id, s.app_users]));

        // Group Limpos items per service, summing duplicates.
        const byService = new Map();
        for (const it of items) {
            const isLimpos = (it.supplies?.providers?.name || '').toLowerCase().includes('limpos');
            const cantidad = Number(it.cantidad) || 0;
            if (!isLimpos || !it.supply_id || cantidad <= 0) continue;
            const reqInfo = reqMap.get(it.request_id);
            if (!reqInfo) continue;
            const serviceId = reqInfo.service_id;

            if (!byService.has(serviceId)) {
                const svc = serviceMap.get(serviceId);
                const sup = supervisorMap.get(reqInfo.supervisor_id);
                byService.set(serviceId, {
                    service_name: svc?.name || 'Servicio sin nombre',
                    supervisor_name: sup?.name || '',
                    supervisor_surname: sup?.surname || '',
                    bySupply: new Map(),
                    // Notas de los pedidos (dentro del filtro) que tienen insumos Limpos.
                    notasSet: new Set(),
                    notasReqs: new Set(),
                });
            }
            const svcEntry = byService.get(serviceId);
            // Registramos la nota una vez por pedido (evita repetir si el pedido
            // tiene varios insumos Limpos).
            if (!svcEntry.notasReqs.has(it.request_id)) {
                svcEntry.notasReqs.add(it.request_id);
                const nota = (reqInfo.notas || '').trim();
                if (nota) svcEntry.notasSet.add(nota);
            }
            const existing = svcEntry.bySupply.get(it.supply_id);
            if (existing) {
                existing.cantidad_total += cantidad;
            } else {
                svcEntry.bySupply.set(it.supply_id, {
                    nombre: it.supplies?.nombre || 'Insumo sin nombre',
                    unidad: it.supplies?.unidad || 'unidades',
                    cantidad_total: cantidad,
                });
            }
        }

        const servicios = Array.from(byService.values())
            .map(s => ({
                ...s,
                lineas: Array.from(s.bySupply.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)),
                notas: Array.from(s.notasSet),
            }))
            .filter(s => s.lineas.length)
            .sort((a, b) => a.service_name.localeCompare(b.service_name));

        if (servicios.length === 0) {
            return Response.json({ error: 'No hay insumos de Limpos en el período seleccionado.' }, { status: 404 });
        }

        const wb = new ExcelJS.Workbook();
        const used = new Set();

        for (const s of servicios) {
            const ws = wb.addWorksheet(sanitizeSheetName(s.service_name, used));
            ws.columns = [{ width: 46 }, { width: 12 }, { width: 12 }];

            ws.mergeCells('A1:C1');
            const titleCell = ws.getCell('A1');
            titleCell.value = s.service_name;
            titleCell.font = { bold: true, size: 16 };
            titleCell.alignment = { vertical: 'middle' };
            ws.getRow(1).height = 26;

            const supervisor = s.supervisor_surname ? `${s.supervisor_surname}, ${s.supervisor_name}` : s.supervisor_name;
            ws.mergeCells('A2:C2');
            const supCell = ws.getCell('A2');
            supCell.value = supervisor ? `Supervisor: ${supervisor}` : '';
            supCell.font = { size: 10, color: { argb: 'FF6B7280' } };

            const headerRow = ws.getRow(4);
            headerRow.values = ['Insumo', 'Cantidad', 'Unidad'];
            headerRow.eachCell((c, col) => {
                c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A4A' } };
                c.alignment = { horizontal: col === 1 ? 'left' : 'center' };
            });

            let r = 5;
            for (const l of s.lineas) {
                const row = ws.getRow(r++);
                row.values = [l.nombre, l.cantidad_total, l.unidad];
                row.getCell(2).alignment = { horizontal: 'center' };
                row.getCell(3).alignment = { horizontal: 'center' };
            }

            // Observaciones del/los pedido(s) del servicio (dentro del filtro).
            if (s.notas.length) {
                r += 1; // fila en blanco de separacion
                ws.mergeCells(`A${r}:C${r}`);
                const obsTitle = ws.getCell(`A${r}`);
                obsTitle.value = 'Observaciones';
                obsTitle.font = { bold: true, size: 11 };
                r++;
                for (const nota of s.notas) {
                    ws.mergeCells(`A${r}:C${r}`);
                    const obsCell = ws.getCell(`A${r}`);
                    obsCell.value = nota;
                    obsCell.font = { size: 10 };
                    obsCell.alignment = { wrapText: true, vertical: 'top' };
                    r++;
                }
            }
        }

        const buffer = await wb.xlsx.writeBuffer();
        const stamp = dateFrom === dateTo ? dateFrom : `${dateFrom}_a_${dateTo}`;
        const filename = `Remito_Limpos_por_servicio_${stamp}.xlsx`;

        return new Response(buffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'X-Period': `${fmtYMD(dateFrom)} al ${fmtYMD(dateTo)}`,
            },
        });
    } catch (error) {
        console.error('Error generando Excel Limpos:', error);
        return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
}
