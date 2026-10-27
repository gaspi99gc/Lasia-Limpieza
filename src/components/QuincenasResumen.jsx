'use client';

import { useMemo } from 'react';
import { hoyAR, quincenasConFin } from '@/lib/quincenas-vacaciones';

// Cuántos anotados hay en cada quincena del período, de un vistazo: la jefa
// operativa lo mira antes de aprobar o mover (pedido del usuario, 2026-10-27).
//
// Cuenta las vacaciones vigentes (aprobadas y sin aprobar; las rechazadas y
// anuladas no) que tocan la quincena. Quien se toma 28 días ocupa dos
// quincenas y cuenta en las dos, igual que en Aprobadas.
//
// La barra compara las quincenas entre sí: la más cargada llena el ancho.

/**
 * @param {number} periodo      año del período de vacaciones
 * @param {Array}  movimientos  'tomado' vigentes con fecha_desde, fecha_hasta y estado
 */
export default function QuincenasResumen({ periodo, movimientos }) {
    const quincenas = useMemo(() => {
        const lista = quincenasConFin(periodo).map((q) => {
            const tocan = movimientos.filter((m) => m.fecha_desde && m.fecha_hasta
                && m.fecha_desde <= q.hasta && m.fecha_hasta >= q.desde);
            const pendientes = tocan.filter((m) => m.estado === 'pendiente').length;
            return { ...q, total: tocan.length, pendientes, aprobadas: tocan.length - pendientes };
        });
        const maximo = Math.max(1, ...lista.map((q) => q.total));
        return lista.map((q) => ({ ...q, ancho: (q.total / maximo) * 100 }));
    }, [periodo, movimientos]);

    if (!quincenas.length) return null;
    const hoy = hoyAR();

    return (
        <div className="card agenda quincenas-resumen">
            <h3>Anotados por quincena</h3>
            <div className="quincenas-resumen__grilla">
                {quincenas.map((q) => (
                    <div key={q.desde} className="quincenas-resumen__q" data-paso={q.hasta < hoy}>
                        <span className="quincenas-resumen__nombre">{q.nombre}</span>
                        <span className="quincenas-resumen__total">{q.total}</span>
                        <span className="quincenas-resumen__barra" aria-hidden="true">
                            {q.total > 0 && (
                                <span style={{ width: `${q.ancho}%` }}>
                                    <span className="quincenas-resumen__aprob" style={{ flexGrow: q.aprobadas }} />
                                    <span className="quincenas-resumen__pend" style={{ flexGrow: q.pendientes }} />
                                </span>
                            )}
                        </span>
                        <span className="quincenas-resumen__detalle">
                            {/* Solo lo que hay: "0 aprobados" no dice nada. */}
                            {q.total === 0 ? 'nadie' : (
                                <>
                                    {q.aprobadas > 0 && `${q.aprobadas} ${q.aprobadas === 1 ? 'aprobado' : 'aprobados'}`}
                                    {q.aprobadas > 0 && q.pendientes > 0 && ' · '}
                                    {q.pendientes > 0 && <b>{q.pendientes} sin aprobar</b>}
                                </>
                            )}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
