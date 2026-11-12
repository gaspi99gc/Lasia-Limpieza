'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { diasEntre, hoyArgentina } from '@/lib/trabajos';
import { CANAL_VENCIMIENTOS } from '@/lib/vencimientos';

// Los vencimientos de RRHH de esta semana, en el dashboard: una línea por cada
// uno, para verlos de un vistazo. Chico a propósito (pedido del usuario,
// 2026-10-26): sin botones, tocar una línea abre /vencimientos.
//
// Entran los vencidos sin marcar y los de los próximos 7 días, y desde el
// 2026-11-02 también quiénes cobran vacaciones en los próximos 7 días (una
// línea por quincena de cobro, abre Aprobadas). Si no hay nada, no se muestra:
// no ocupa lugar.

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
// Tope de líneas: la tarjeta no puede crecer sin límite en una semana cargada.
const MAXIMO = 5;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// "mié 28 oct"
function fechaCorta(ymd) {
    const [a, m, d] = ymd.split('-').map(Number);
    return `${DIAS[new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay()]} ${d} ${MESES[m - 1]}`;
}

function cuando(dias) {
    if (dias < 0) return `venció hace ${-dias} ${dias === -1 ? 'día' : 'días'}`;
    if (dias === 0) return 'hoy';
    if (dias === 1) return 'mañana';
    return `en ${dias} días`;
}

export default function VencimientosSemana() {
    const [lista, setLista] = useState([]);

    useEffect(() => {
        let vivo = true;
        const cargar = () => {
            // Si el rol no tiene acceso, el servidor responde 403 y no se muestra.
            const pedir = (url) => fetch(url, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
            Promise.all([
                pedir('/api/vencimientos'),
                // Los cobros de vacaciones aprobados: una línea por quincena de
                // cobro desde la semana anterior (pedido del usuario, 2026-11-02).
                pedir('/api/vacaciones/movimientos?tipo=pagado&estado=aprobado'),
            ]).then(([venc, cobros]) => {
                if (!vivo) return;
                const hoy = hoyArgentina();
                const items = (venc?.vencimientos || [])
                    .map((v) => ({ key: `v${v.id}`, fecha: v.fecha, titulo: v.titulo, href: '/vencimientos', dias: diasEntre(hoy, v.fecha) }))
                    .filter((v) => v.dias <= 7);
                const porFecha = new Map();
                for (const c of Array.isArray(cobros) ? cobros : []) {
                    // Sin fecha todavía, o ya pagado: no va en "Esta semana".
                    if (!c.fecha_cobro || c.pago_at) continue;
                    const dias = diasEntre(hoy, c.fecha_cobro);
                    if (dias < 0 || dias > 7) continue;
                    (porFecha.get(c.fecha_cobro) || porFecha.set(c.fecha_cobro, []).get(c.fecha_cobro))
                        .push(String(c.nombre || '').split(' ')[0]);
                }
                for (const [fecha, apellidos] of porFecha) {
                    items.push({
                        key: `c${fecha}`, fecha, href: '/vacaciones?tab=aprobadas', dias: diasEntre(hoy, fecha),
                        titulo: `Cobran vacaciones (${apellidos.length}): ${apellidos.join(', ')}`,
                    });
                }
                setLista(items.sort((a, b) => a.dias - b.dias));
            });
        };
        cargar();

        // Se vuelve a pedir al volver a esta pestaña y cuando Vencimientos,
        // abierto en otra, avisa que algo cambió: si no, quedaba lo de cuando
        // se abrió el dashboard.
        const alVolver = () => { if (document.visibilityState === 'visible') cargar(); };
        document.addEventListener('visibilitychange', alVolver);
        let canal = null;
        try {
            canal = new BroadcastChannel(CANAL_VENCIMIENTOS);
            canal.onmessage = cargar;
        } catch { /* navegador sin BroadcastChannel: queda el de volver a la pestaña */ }

        return () => {
            vivo = false;
            document.removeEventListener('visibilitychange', alVolver);
            canal?.close();
        };
    }, []);

    if (!lista.length) return null;

    return (
        <div className="card agenda venc-semana">
            <div className="venc-semana__cabeza">
                <h3>Esta semana</h3>
                <Link href="/vencimientos">Ver vencimientos</Link>
            </div>
            {lista.slice(0, MAXIMO).map((v) => {
                const tono = v.dias <= 2 ? 'rojo' : 'ambar';
                return (
                    <Link key={v.key} href={v.href} className="venc-semana__fila">
                        <span className="venc-semana__dia" data-tono={tono}>{fechaCorta(v.fecha)}</span>
                        <span className="venc-semana__titulo" title={v.titulo}>{v.titulo}</span>
                        <span className="venc-semana__cuando" data-tono={tono}>{cuando(v.dias)}</span>
                    </Link>
                );
            })}
            {lista.length > MAXIMO && (
                <Link href="/vencimientos" className="venc-semana__mas">
                    y {lista.length - MAXIMO} más esta semana
                </Link>
            )}
        </div>
    );
}
