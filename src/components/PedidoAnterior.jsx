'use client';

import { parseAppDate } from '@/lib/datetime';

// Aviso de pedido repetido en la carga de un pedido nuevo (supervisor y
// compras). La regla y el porqué están en src/lib/pedidos-servicio.js.

/** El último pedido del servicio (o null). Tira error si no se pudo consultar. */
export async function consultarUltimoPedido(serviceId) {
    const res = await fetch(`/api/supply-requests/ultimo?service_id=${encodeURIComponent(serviceId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo buscar el pedido anterior.');
    return data.pedido || null;
}

const ESTADOS = { pendiente: 'Pendiente', revisado: 'Enviado al proveedor', cerrado: 'Entregado' };

/** "23/10 a las 12:05" */
export function cuandoFue(valor) {
    const fecha = parseAppDate(valor);
    if (Number.isNaN(fecha.getTime())) return '';
    const p = Object.fromEntries(new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(fecha).map(x => [x.type, x.value]));
    const dos = (x) => String(x).padStart(2, '0');
    return `${dos(p.day)}/${dos(p.month)} a las ${dos(p.hour)}:${dos(p.minute)}`;
}

/**
 * Va en el paso 1, en lugar del botón "Elegir insumos", cuando el servicio
 * elegido ya tiene un pedido de los últimos 15 días.
 */
export function AvisoPedidoRepetido({ servicio, pedido, esPropio, puedeAgregar, motivo, onAgregar, onCrearOtro, onElegirOtro }) {
    const insumos = pedido.items?.length || 0;
    const quien = esPropio ? 'Lo cargaste vos' : pedido.supervisor ? `De ${pedido.supervisor}` : null;
    const detalle = [quien, `${insumos} insumo${insumos === 1 ? '' : 's'}`, ESTADOS[pedido.status]].filter(Boolean).join(' · ');
    const boton = { width: '100%', minHeight: '46px', fontWeight: 700 };

    return (
        <div role="alert" style={{
            marginTop: '1.25rem', padding: '1rem 1.1rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(245, 158, 11, 0.45)',
            background: 'rgba(245, 158, 11, 0.10)',
        }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.35 }}>
                {servicio} ya tiene un pedido
            </div>
            <div style={{ fontSize: '0.88rem', marginTop: '0.3rem', lineHeight: 1.5 }}>
                N° {pedido.id}, del {cuandoFue(pedido.created_at)}
            </div>
            <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{detalle}</div>
            <p style={{ fontSize: '0.84rem', margin: '0.65rem 0 0', lineHeight: 1.5 }}>
                {puedeAgregar
                    ? 'Si te olvidaste algo, agregalo a ese pedido en vez de hacer uno nuevo.'
                    : motivo}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                {puedeAgregar && (
                    <button type="button" className="btn btn-primary" style={boton} onClick={onAgregar}>
                        Agregar a ese pedido
                    </button>
                )}
                <button type="button" className={`btn ${puedeAgregar ? 'btn-secondary' : 'btn-primary'}`} style={boton} onClick={onCrearOtro}>
                    No, crear otro pedido
                </button>
                <button
                    type="button"
                    onClick={onElegirOtro}
                    style={{
                        minHeight: '40px', background: 'transparent', border: 'none',
                        color: 'var(--text-muted)', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer',
                    }}
                >
                    Elegir otro servicio
                </button>
            </div>
        </div>
    );
}

/**
 * El servidor frenó el envío porque el servicio ya tiene un pedido reciente
 * (la pantalla venía de un borrador o quedó abierta). true = mandarlo igual.
 */
export async function confirmarPedidoRepetido(mensaje) {
    const { default: Swal } = await import('sweetalert2');
    const r = await Swal.fire({
        title: 'Este servicio ya tiene un pedido',
        text: `${mensaje} ¿Lo mandás igual como otro pedido?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, crear otro pedido',
        cancelButtonText: 'No, cancelar',
        confirmButtonColor: 'var(--color-primary)',
        cancelButtonColor: '#6b7280',
    });
    return r.isConfirmed;
}
