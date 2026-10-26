'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { diasEntre, hoyArgentina } from '@/lib/trabajos';

// Los vencimientos de RRHH de esta semana, en el dashboard: una línea por cada
// uno, para verlos de un vistazo. Chico a propósito (pedido del usuario,
// 2026-10-26): sin botones, tocar una línea abre /vencimientos.
//
// Entran los vencidos sin marcar y los de los próximos 7 días. Si no hay
// ninguno, no se muestra nada: no ocupa lugar.

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
        // Si el rol no tiene acceso, el servidor responde 403 y no se muestra.
        fetch('/api/vencimientos', { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => {
                if (!vivo || !j) return;
                const hoy = hoyArgentina();
                setLista((j.vencimientos || [])
                    .map((v) => ({ ...v, dias: diasEntre(hoy, v.fecha) }))
                    .filter((v) => v.dias <= 7)
                    .sort((a, b) => a.dias - b.dias));
            })
            .catch(() => {});
        return () => { vivo = false; };
    }, []);

    if (!lista.length) return null;

    return (
        <div className="card agenda venc-semana">
            <div className="venc-semana__cabeza">
                <h3>Vencen esta semana</h3>
                <Link href="/vencimientos">Ver todos</Link>
            </div>
            {lista.slice(0, MAXIMO).map((v) => {
                const tono = v.dias <= 2 ? 'rojo' : 'ambar';
                return (
                    <Link key={v.id} href="/vencimientos" className="venc-semana__fila">
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
