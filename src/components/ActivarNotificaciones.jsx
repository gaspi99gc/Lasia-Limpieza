'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { notify } from '@/lib/toast';
import {
    activarNotificaciones,
    desactivarNotificaciones,
    estadoPush,
    esIOS,
} from '@/lib/push';

// Activar las notificaciones de este dispositivo: una campana chica en el
// encabezado que abre un panel con Activar / Probar / Desactivar.
//
// La parte difícil no es el código: es que en iPhone hay que agregar la app a la
// pantalla de inicio ANTES de poder activarlas, y si no se explica, la persona
// toca el botón, no pasa nada y concluye que la app está rota.
//
// Por eso cada situación tiene su propio mensaje: qué pasa, por qué, y qué hacer.

export default function ActivarNotificaciones() {
    // El estado del permiso se lee de una, sin await: `Notification.permission`
    // es sincrónico. Antes esto arrancaba en 'cargando' y devolvía null hasta
    // que respondía el service worker, así que el cartel aparecía medio segundo
    // después y empujaba toda la pantalla para abajo. Se leía como lentitud.
    //
    // Arranca en 'cargando' igual porque en el servidor no existe `navigator`:
    // si el primer render del cliente no coincidiera con el del servidor, React
    // tira error de hidratación.
    const [estado, setEstado] = useState({ estado: 'cargando' });
    const [trabajando, setTrabajando] = useState(false);
    const [suscripto, setSuscripto] = useState(false);
    const [revisado, setRevisado] = useState(false);
    const [abierto, setAbierto] = useState(false);
    const cajaRef = useRef(null);

    const revisar = useCallback(async () => {
        setEstado(estadoPush());
        // ¿Este navegador ya está suscripto? Es distinto de tener el permiso:
        // se puede haber dado permiso y después borrado la suscripción.
        // Esto sí es lento (espera al service worker), pero no bloquea nada:
        // mientras tanto el cartel ya se ve.
        try {
            if (!('serviceWorker' in navigator)) return;
            const reg = await navigator.serviceWorker.getRegistration();
            const sub = await reg?.pushManager.getSubscription();
            if (!sub) { setSuscripto(false); return; }

            // No alcanza con que el navegador tenga una suscripción: lo que
            // importa es que el SERVIDOR la tenga, porque es el que manda los
            // avisos. Las dos se desincronizan más fácil de lo que parece — si
            // el guardado falló, el navegador queda suscripto igual y la
            // pantalla decía "activadas" mientras el servidor no tenía a quién
            // mandarle nada. Pasó en producción el 2026-10-01.
            const res = await fetch('/api/push/suscribir', { credentials: 'include' });
            if (!res.ok) { setSuscripto(false); return; }
            const { dispositivos = [] } = await res.json().catch(() => ({}));
            setSuscripto(dispositivos.some((d) => d.endpoint === sub.endpoint));
        } catch { /* si falla, se muestra como no suscripto */ }
        finally { setRevisado(true); }
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
                sin_configurar: 'El servidor no tiene cargadas las claves de notificación. Hay que cargarlas en Vercel y volver a publicar.',
                sw_no_arranco: 'El navegador no pudo arrancar el servicio de notificaciones. Probá recargando la página.',
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

    const enviarPrueba = async () => {
        const res = await fetch('/api/push/probar', { method: 'POST', credentials: 'include' });
        const j = await res.json().catch(() => ({}));
        return { ok: res.ok, ...j };
    };

    const probar = async () => {
        setTrabajando(true);
        try {
            let r = await enviarPrueba();

            // La suscripción guardada venció (pasó en el celular de una
            // supervisora el 2026-10-21): el navegador la sigue teniendo y la
            // pantalla decía "activadas", pero no le llegaba nada. Se tira la
            // vieja, se crea una nueva (el permiso ya está dado, no pregunta
            // nada) y se prueba otra vez, sin que la persona tenga que hacer nada.
            if (!r.ok && (r.codigo === 'vencida' || r.codigo === 'sin_dispositivo')) {
                try {
                    const reg = await navigator.serviceWorker.getRegistration();
                    const vieja = await reg?.pushManager.getSubscription();
                    await vieja?.unsubscribe();
                } catch { /* si no se puede borrar, se intenta igual */ }
                const nueva = await activarNotificaciones();
                if (nueva.ok) r = await enviarPrueba();
            }

            await revisar();
            if (!r.ok) {
                notify.error(r.codigo === 'vencida' || r.codigo === 'sin_dispositivo'
                    ? 'No se pudo renovar la suscripción de este dispositivo. Tocá Desactivar y después Activar.'
                    : (r.error || 'No se pudo enviar la prueba.'));
                return;
            }
            notify.success('Prueba enviada. Debería llegarte en unos segundos.');
        } finally {
            setTrabajando(false);
        }
    };

    // Afuera del panel o con Escape se cierra, como cualquier menú.
    useEffect(() => {
        if (!abierto) return;
        const afuera = (e) => { if (!cajaRef.current?.contains(e.target)) setAbierto(false); };
        const tecla = (e) => { if (e.key === 'Escape') setAbierto(false); };
        document.addEventListener('pointerdown', afuera);
        document.addEventListener('keydown', tecla);
        return () => {
            document.removeEventListener('pointerdown', afuera);
            document.removeEventListener('keydown', tecla);
        };
    }, [abierto]);

    const campana = {
        width: '2.4rem',
        height: '2.4rem',
        borderRadius: '50%',
        border: '1px solid var(--border-color)',
        background: 'var(--color-surface)',
        fontSize: '1.15rem',
        lineHeight: 1,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
    };

    // Durante el primer render (el del servidor) no se sabe el estado todavía:
    // se deja el hueco del mismo tamaño para que el encabezado no se mueva.
    if (estado.estado === 'cargando') {
        return <div style={{ ...campana, visibility: 'hidden' }} aria-hidden="true" />;
    }

    const activo = estado.estado === 'permitido' && suscripto;
    // Hasta que el servidor confirma, la campana se muestra neutra: si no,
    // arranca tachada y medio segundo después cambia.
    const icono = revisado && !activo ? '🔕' : '🔔';

    const texto = { fontSize: '0.85rem', lineHeight: 1.5 };

    let contenido;
    if (estado.estado === 'requiere_instalar') {
        // iPhone sin instalar: no hay botón que sirva, hay que explicar el paso previo.
        contenido = (
            <div style={{ ...texto, color: '#1E3A8A' }}>
                En iPhone primero hay que agregar la app a la pantalla de inicio:
                <ol style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem' }}>
                    <li>Tocá <strong>Compartir</strong> (el cuadradito con la flecha, abajo).</li>
                    <li>Elegí <strong>Agregar a inicio</strong>.</li>
                    <li>Abrí LASIA desde el ícono nuevo y volvé acá.</li>
                </ol>
            </div>
        );
    } else if (estado.estado === 'sin_soporte') {
        contenido = (
            <div style={{ ...texto, color: 'var(--text-muted)' }}>
                Este navegador no soporta notificaciones. Probá con Chrome o con el celular.
            </div>
        );
    } else if (estado.estado === 'bloqueado') {
        // Permiso denegado: no se puede volver a pedir por código, hay que ir a
        // la configuración del navegador. Decirlo ahorra el "no me anda".
        contenido = (
            <div style={{ ...texto, color: '#92400E' }}>
                Están bloqueadas en la configuración del navegador. Habilitalas desde el
                candado al lado de la dirección y volvé a intentar.
            </div>
        );
    } else {
        contenido = (
            <>
                <div style={{ ...texto, color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    {activo ? 'Activadas en este dispositivo.' : 'Desactivadas en este dispositivo.'}
                </div>
                {activo ? (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={probar} disabled={trabajando}>
                            Probar
                        </button>
                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={desactivar} disabled={trabajando}>
                            Desactivar
                        </button>
                    </div>
                ) : (
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={activar} disabled={trabajando}>
                        {trabajando ? 'Activando…' : 'Activar'}
                    </button>
                )}
                {/* En iPhone el permiso lo pide el sistema con un cartel encima,
                    y sorprende si no se avisa. */}
                {!activo && esIOS() && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                        El iPhone te va a pedir permiso. Hay que aceptar.
                    </div>
                )}
            </>
        );
    }

    return (
        <div ref={cajaRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
                type="button"
                style={campana}
                onClick={() => setAbierto((a) => !a)}
                aria-label="Notificaciones"
                aria-expanded={abierto}
                title="Notificaciones"
            >
                {icono}
            </button>
            {abierto && (
                <div
                    className="card"
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 0.4rem)',
                        right: 0,
                        width: '17rem',
                        maxWidth: 'calc(100vw - 2rem)',
                        padding: '0.9rem 1rem',
                        zIndex: 25,
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                    }}
                >
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.4rem' }}>
                        Notificaciones
                    </div>
                    {contenido}
                </div>
            )}
        </div>
    );
}
