import { cuandoCobra, fmtFecha, salidaDelCobro } from '@/lib/quincenas-vacaciones';

// La hoja "Cobran" de los Excel de Vacaciones: a quién se le pagan días en vez
// de dárselos. Es la misma en los tres (Días y saldos, Para aprobar y
// Aprobadas) para que, se baje el que se baje, se vea quién cobra. Pedido del
// usuario (2026-11-13): bajó el de Para aprobar, la hoja de cobros estaba vacía
// porque solo traía los que esperaban aprobación, y no encontró a los 12.
//
// cobros:  movimientos 'pagado' (aprobados y, donde corresponda, sin aprobar).
// tomados: los 'tomado' del período, para saber con qué salida va un cobro "al
//          salir de vacaciones" y si en la misma carga también se toma días.

// El día en que se marcó el pago, en hora argentina: "16/11/2026".
export const diaPago = (iso) => (iso
    ? fmtFecha(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(iso)))
    : '');

export function hojaCobran(XLSX, cobros, tomados = []) {
    if (!cobros.length) {
        // Una hoja vacía se lee como un error; esta dice que no hay nadie.
        const ws = XLSX.utils.aoa_to_sheet([['Nadie cobra días de vacaciones en este período.']]);
        ws['!cols'] = [{ wch: 50 }];
        return ws;
    }
    // Lo que espera a la jefa va primero: es lo que todavía puede cambiar.
    const ordenados = [...cobros].sort((a, b) =>
        (a.estado === 'pendiente' ? 0 : 1) - (b.estado === 'pendiente' ? 0 : 1)
        || (a.nombre || '').localeCompare(b.nombre || '', 'es'));
    const ws = XLSX.utils.json_to_sheet(ordenados.map(c => {
        const salida = salidaDelCobro(c, tomados);
        // Mismo envío = misma persona y misma hora de carga. Un cobro "al salir
        // de vacaciones" va con su salida aunque se haya cargado en otro momento.
        const t = tomados.find(m => m.tipo === 'tomado' && m.employee_id === c.employee_id && m.created_at === c.created_at)
            || (c.fecha_cobro ? null : salida);
        return {
            Operario: c.nombre,
            Legajo: c.legajo || '',
            Servicio: c.servicio || '',
            'Días que cobra': c.cantidad,
            'Cobra en': cuandoCobra(c, salida),
            Estado: c.estado === 'pendiente' ? 'Sin aprobar' : 'Aprobado',
            Nota: c.nota || '',
            'Además se toma': t ? `${t.cantidad} días${t.estado === 'pendiente' ? ' (sin aprobar)' : ''}` : '',
            'Cargado el': fmtFecha(String(c.created_at).slice(0, 10)),
            'Pagado el': diaPago(c.pago_at),
            'Marcó el pago': c.pago_por || '',
        };
    }));
    ws['!cols'] = [34, 8, 32, 14, 26, 12, 40, 22, 11, 11, 24].map(w => ({ wch: w }));
    return ws;
}
