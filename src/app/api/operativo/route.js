import { supabase } from '@/lib/db';

// El operativo completo son ~450 puestos x N dias: la grilla de un mes pasa
// las 1000 filas que Supabase devuelve por consulta, asi que se pagina igual
// que en /api/supply-requests (fetchAllItems).
async function fetchAll(buildQuery, pageSize = 1000) {
    const all = [];
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await buildQuery().range(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        all.push(...(data || []));
        if (!data || data.length < pageSize) break;
    }
    return all;
}

const todayAR = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

function addDays(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const hoy = todayAR();
        const from = searchParams.get('from') || addDays(hoy, -2);
        const to = searchParams.get('to') || addDays(hoy, 11);

        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
            return Response.json({ error: 'Rango de fechas inválido' }, { status: 400 });
        }

        const puestos = await fetchAll(() =>
            supabase
                .from('operativo_puestos')
                .select(`
                    id, servicio_excel, direccion_excel, service_id, nombre_excel,
                    apodo_excel, employee_id, celular, supervisor_nombre, tipo, orden,
                    employees:employee_id (nombre, apellido, legajo),
                    services:service_id (name)
                `)
                .eq('activo', true)
                .order('orden', { ascending: true })
        );

        const dias = await fetchAll(() =>
            supabase
                .from('operativo_dias')
                .select('puesto_id, fecha, hi, he, estado, minutos_tarde, nota')
                .gte('fecha', from)
                .lte('fecha', to)
                .order('id', { ascending: true })
        );

        // "Actualizado al": cuando se importo el ultimo archivo.
        const { data: ultima } = await supabase
            .from('operativo_dias')
            .select('updated_at')
            .eq('fuente', 'import')
            .order('updated_at', { ascending: false })
            .limit(1);

        return Response.json({
            from,
            to,
            puestos,
            dias: dias.map(d => ({ ...d, fecha: d.fecha?.slice(0, 10) })),
            ultimaImportacion: ultima?.[0]?.updated_at || null,
        });
    } catch (error) {
        console.error('Error fetching operativo:', error.message);
        return Response.json({ error: 'No se pudo cargar el operativo: ' + error.message }, { status: 500 });
    }
}
