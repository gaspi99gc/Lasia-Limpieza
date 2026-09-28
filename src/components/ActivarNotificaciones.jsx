'use client';

import { useCallback, useEffect, useState } from 'react';
import { notify } from '@/lib/toast';
import {
    activarNotificaciones,
    desactivarNotificaciones,
    estadoPush,
    esIOS,
} from '@/lib/push';

// Activar las notificaciones de este dispositivo.
//
// La parte difícil no es el código: es que en iPhone hay que agregar la app a la
// pantalla de inicio ANTES de poder activarlas, y si no se explica, la persona
// toca el botón, no pasa nada y concluye que la app está rota.
//
// Por eso cada situación tiene su propio mensaje: qué pasa, por qué, y qué hacer.

export default function ActivarNotificaciones() {
    const [estado, setEstado] = useState({ estado: 'cargando' });
    const [trabajando, setTrabajando] = useState(false);
    const [suscripto, setSuscripto] = useState(false);

    const revisar = useCallback(async () => {
        setEstado(estadoPush());
        // ¿Este navegador ya está suscripto? Es distinto de tener el permiso:
        // se puede haber dado permiso y después borrado la suscripción.
        try {
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.getRegistration();
                const sub = await reg?.pushManager.getSubscription();
                setSuscripto(Boolean(sub));
            }
        } catch { /* si falla, se muestra como no suscripto */ }
    }, []);

    useEffect(() => { revisar(); }, [revisar]);

    const activar = async () => {
        setTrabajando(true);
        try {
            const r = await activarNotificaciones();
            if (r.ok) {
                notify.success('Notificaciones activadas en este dispositivo.');
                await revisar();
                return;
            }
            const mensajes = {
                requiere_instalar: 'En iPhone primero hay que agregar la app a la pantalla de inicio.',
                sin_soporte: 'Este navegador no soporta notificaciones.',
                bloqueado: 'Las notificaciones están bloqueadas en la configuración del navegador.',
                rechazado: 'No se dio permiso para notificar.',
                sin_configurar: 'Faltan las claves en el servidor. Avisale a sistemas.',
                servidor: r.detalle || 'No se pudo guardar la suscripción.',
            };
            notify.error(mensajes[r.motivo] || 'No se pudieron activar.');
            await revisar();
        } finally {
            setTrabajando(false);
        }
    };

    const desactivar = async () => {
        setTrabajando(true);
        try {
            await desactivarNotificaciones();
            notify.success('Este dispositivo ya no va a recibir notificaciones.');
            await revisar();
        } finally {
            setTrabajando(false);
        }
    };

    const probar = async () => {
        setTrabajando(true);
        try {
            const res = await fetch('/api/push/probar', { method: 'POST', credentials: 'include' });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(j.error || 'No se pudo enviar la prueba.'); return; }
            notify.success('Prueba enviada. Debería llegarte en unos segundos.');
        } finally {
            setTrabajando(false);
        }
    };

    if (estado.estado === 'cargando') return null;

    const caja = {
        padding: '1rem 1.15rem',
        marginBottom: '1.25rem',
    };

    // iPhone sin instalar: no hay botón que sirva, hay que explicar el paso previo.
    if (estado.estado === 'requiere_instalar') {
        return (
            <div className="card" style={{ ...caja, background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1E40AF', marginBottom: '0.35rem' }}>
                    📲 Para recibir avisos en el iPhone
                </div>
                <div style={{ fontSize: '0.87rem', color: '#1E3A8A', lineHeight: 1.6 }}>
                    Apple solo deja mandar notificaciones si la app está agregada a la pantalla de inicio.
                    Se hace una sola vez:
                    <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem' }}>
                        <li>Tocá <strong>Compartir</strong> (el cuadradito con la flecha, abajo).</li>
                        <li>Elegí <strong>Agregar a inicio</strong>.</li>
                        <li>Abrí LASIA desde el ícono nuevo y volvé acá.</li>
                    </ol>
                </div>
            </div>
        );
    }

    if (estado.estado === 'sin_soporte') {
        return (
            <div className="card" style={{ ...caja, fontSize: '0.87rem', color: 'var(--text-muted)' }}>
                Este navegador no soporta notificaciones. Probá con Chrome en la computadora,
                o con el celular.
            </div>
        );
    }

    // Permiso denegado: no se puede volver a pedir por código, hay que ir a la
    // configuración del navegador. Decirlo ahorra el "no me anda el botón".
    if (estado.estado === 'bloqueado') {
        return (
            <div className="card" style={{ ...caja, background: '#FFFBEB', border: '1px solid #FCD34D' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#92400E', marginBottom: '0.3rem' }}>
                    🔕 Notificaciones bloqueadas
                </div>
                <div style={{ fontSize: '0.87rem', color: '#92400E' }}>
                    Están bloqueadas para este sitio en la configuración del navegador. Hay que
                    habilitarlas desde ahí (el candado al lado de la dirección) y volver a intentar.
                </div>
            </div>
        );
    }

    const activo = estado.estado === 'permitido' && suscripto;

    return (
        <div className="card" style={{ ...caja, display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    {activo ? '🔔 Notificaciones activadas' : '🔕 Notificaciones desactivadas'}
                </div>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    {activo
                        ? 'Este dispositivo va a recibir los avisos aunque tengas la app cerrada.'
                        : 'Activalas para que te lleguen los avisos de trabajos y recordatorios.'}
                </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {activo ? (
                    <>
                        <button className="btn btn-secondary" onClick={probar} disabled={trabajando}>
                            Probar
                        </button>
                        <button className="btn btn-secondary" onClick={desactivar} disabled={trabajando}>
                            Desactivar
                        </button>
                    </>
                ) : (
                    <button className="btn btn-primary" onClick={activar} disabled={trabajando}>
                        {trabajando ? 'Activando…' : 'Activar notificaciones'}
                    </button>
                )}
            </div>
            {/* En iPhone ya instalado conviene aclarar que el permiso lo pide
                el sistema, porque el cartel aparece encima y sorprende. */}
            {!activo && esIOS() && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', flexBasis: '100%' }}>
                    Al tocar el botón, el iPhone va a pedirte permiso. Hay que aceptar.
                </div>
            )}
        </div>
    );
}
