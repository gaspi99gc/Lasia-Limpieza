// Datos del servicio para el detalle de la Solicitud de Personal: la dirección
// (corta) y el supervisor según el operativo, la misma fuente que usan los
// Trabajos programados (ver supervisores-servicio.js).
//
// Si el apodo del Excel no coincide con nadie de la app (NESTOR no tiene
// usuario), se muestra el apodo tal cual: mejor eso que nada.
import { supervisoresPorServicio } from './supervisores-servicio.js';
import { direccionCorta } from './solicitud-personal.js';

/**
 * @param db         cliente de Supabase (service role)
 * @param serviceIds ids de los servicios de la lista
 * @returns Map<service_id, { address: string, supervisor: string|null }>
 */
export async function datosServicios(db, serviceIds) {
    const ids = [...new Set((serviceIds || []).map(Number).filter(Boolean))];
    if (!ids.length) return new Map();

    const [servicios, resueltos, puestos] = await Promise.all([
        db.from('services').select('id, address').in('id', ids),
        supervisoresPorServicio(db, ids),
        db.from('operativo_puestos').select('service_id, supervisor_nombre')
            .eq('activo', true).in('service_id', ids).not('supervisor_nombre', 'is', null),
    ]);
    if (servicios.error) throw servicios.error;
    if (puestos.error) throw puestos.error;

    const crudo = new Map();
    for (const p of puestos.data || []) {
        const t = String(p.supervisor_nombre || '').trim();
        if (t && !crudo.has(p.service_id)) crudo.set(p.service_id, t);
    }

    const out = new Map();
    for (const s of servicios.data || []) {
        const nombres = (resueltos.get(s.id) || []).map((x) => x.nombre).filter(Boolean);
        out.set(s.id, {
            address: direccionCorta(s.address),
            supervisor: nombres.length ? nombres.join(' y ') : (crudo.get(s.id) || null),
        });
    }
    return out;
}
