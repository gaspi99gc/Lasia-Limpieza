'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import ActivarNotificaciones from '@/components/ActivarNotificaciones';
import DocumentacionModal, { iniciales } from '@/components/DocumentacionModal';
import HojaFecha from '@/components/HojaFecha';
import { getSessionUser } from '@/lib/session';
import { notify } from '@/lib/toast';
import { diasEntre, fmtFecha, hoyArgentina } from '@/lib/trabajos';
import {
    AVISOS_VENCIMIENTO, avisarCambioVencimientos, cuandoVence, textoPendientes, textoRepeticion, tonoVencimiento,
} from '@/lib/vencimientos';

// Documentación mensual (ex Vencimientos de RRHH): lo que se presenta a los
// clientes en una fecha, una sola vez o cada N meses, cada una con su nómina
// (quiénes van documentados). Avisa al celular de los responsables 7 días
// antes, 2 días antes y el mismo día, hasta que alguien la marca como hecha.
//
// La ven también Operaciones y la jefa operativa, que arman las nóminas desde
// el detalle (/vencimientos/[id]). Crear, editar, "Hecho" y borrar es solo de
// admin y RRHH: la API lo dice con `puede_gestionar`.

const GRUPOS = [
    { id: 'vencidos', titulo: 'Vencidas', tono: 'rojo' },
    { id: 'semana', titulo: 'Esta semana', tono: 'ambar' },
    { id: 'despues', titulo: 'Más adelante' },
];
const grupoDe = (dias) => (dias < 0 ? 'vencidos' : dias <= 7 ? 'semana' : 'despues');

// Qué avisos ya salieron. Solo se muestra lo que pasó: lo que falta se sabe.
function lineaAvisos(v) {
    return AVISOS_VENCIMIENTO
        .map((d) => {
            const a = v.avisos.find((x) => x.dias_antes === d);
            if (!a || a.estado === 'omitido') return null;
            const etiqueta = d === 0 ? 'el día' : `${d} días antes`;
            if (a.estado === 'enviado') return { texto: `${etiqueta}: avisado`, mal: false };
            return { texto: `${etiqueta}: no llegó (${a.ultimo_error || 'error'})`, mal: true };
        })
        .filter(Boolean);
}

export default function DocumentacionMensualPage() {
    const [vencimientos, setVencimientos] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [puedeGestionar, setPuedeGestionar] = useState(false);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [modal, setModal] = useState(null);     // null | 'nuevo' | la documentación a editar
    const [miId, setMiId] = useState(null);

    // Para tildar por defecto a quien carga. La sesión vive en el navegador:
    // no se puede leer en el primer render.
    useEffect(() => { setMiId(getSessionUser()?.app_user_id || null); }, []);

    const cargar = useCallback(async () => {
        setError('');
        try {
            const res = await fetch('/api/vencimientos', { credentials: 'include' });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'No se pudo cargar.');
            setVencimientos(json.vencimientos || []);
            setUsuarios(json.usuarios || []);
            setPuedeGestionar(Boolean(json.puede_gestionar));
        } catch (e) {
            setError(e.message || 'Error de red.');
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    const nombreDe = useMemo(() => new Map(usuarios.map((u) => [u.id, u.nombre])), [usuarios]);

    const porGrupo = useMemo(() => {
        const hoy = hoyArgentina();
        const g = { vencidos: [], semana: [], despues: [] };
        for (const v of vencimientos) {
            const dias = diasEntre(hoy, v.fecha);
            g[grupoDe(dias)].push({ ...v, dias });
        }
        return g;
    }, [vencimientos]);

    const marcarHecho = async (v) => {
        const sigue = v.cada_meses ? '\n\nPasa sola al próximo vencimiento.' : '\n\nSale de la lista y ya no avisa.';
        if (!confirm(`¿Marcar "${v.titulo}" como hecha?\n\nLa nómina completa queda como enviada.${sigue}`)) return;
        try {
            const res = await fetch('/api/vencimientos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: v.id, accion: 'hecho' }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'No se pudo marcar.');
            notify.success(v.cada_meses ? `Hecho. La próxima vence el ${fmtFecha(json.fecha)}.` : 'Hecho.');
            cargar();
            avisarCambioVencimientos();
        } catch (e) {
            notify.error(e.message || 'Error de red.');
        }
    };

    const borrar = async (v) => {
        if (!confirm(`¿Borrar "${v.titulo}"?\n\nDeja de aparecer y de avisar${v.cada_meses ? ', también los meses que vienen' : ''}.`)) return;
        try {
            const res = await fetch(`/api/vencimientos?id=${v.id}`, { method: 'DELETE', credentials: 'include' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || 'No se pudo borrar.');
            notify.success('Borrada.');
            cargar();
            avisarCambioVencimientos();
        } catch (e) {
            notify.error(e.message || 'Error de red.');
        }
    };

    return (
        <MainLayout>
            <div className="config-view agenda">
                <header className="page-header" style={{ marginBottom: '1rem', alignItems: 'center' }}>
                    <h1 style={{ margin: 0, flex: '1 1 0', minWidth: 'min-content' }}>Documentación mensual</h1>
                    {puedeGestionar && (
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginLeft: 'auto' }}>
                            <button className="btn btn-primary" onClick={() => setModal('nuevo')} disabled={!usuarios.length}>
                                + Nuevo
                            </button>
                            <ActivarNotificaciones />
                        </div>
                    )}
                </header>

                {cargando ? (
                    <div className="agenda-vacia">Cargando…</div>
                ) : error ? (
                    <div className="agenda-vacia" style={{ color: 'var(--error)' }}>{error}</div>
                ) : vencimientos.length === 0 ? (
                    <div className="agenda-vacia">
                        <strong>Todavía no hay documentación cargada</strong>
                        {puedeGestionar
                            ? 'Cargala con “+ Nuevo”: una vez o todos los meses.'
                            : 'Cuando RRHH la cargue, aparece acá.'}
                    </div>
                ) : (
                    GRUPOS.filter((g) => porGrupo[g.id].length).map((g) => (
                        <section key={g.id} className="agenda-grupo" data-tono={g.tono}>
                            <h2 className="agenda-grupo__titulo">
                                {g.titulo} <small>{porGrupo[g.id].length}</small>
                            </h2>
                            <div className="agenda-lista">
                                {porGrupo[g.id].map((v) => {
                                    const tono = tonoVencimiento(v.dias);
                                    const avisos = lineaAvisos(v);
                                    const nombres = (v.responsables || []).map((id) => nombreDe.get(id) || 'Usuario deshabilitado');
                                    const detalle = `/vencimientos/${v.id}`;
                                    return (
                                        <article key={v.id} className="agenda-fila">
                                            <HojaFecha fecha={v.fecha} tono={tono} />
                                            <div className="agenda-cuerpo">
                                                <div className="agenda-cabeza">
                                                    <h3 className="agenda-titulo">
                                                        <Link href={detalle} className="agenda-titulo__link">{v.titulo}</Link>
                                                    </h3>
                                                    <span className="agenda-cuando" data-tono={tono}>{cuandoVence(v.dias)}</span>
                                                </div>
                                                {/* A quién le avisa solo le importa a quien recibe
                                                    los avisos (admin y RRHH). Al resto le basta
                                                    saber cada cuánto se manda. */}
                                                {puedeGestionar ? (
                                                    <div className="agenda-detalle">
                                                        <span className="avatares" aria-hidden="true">
                                                            {nombres.map((n, i) => <span key={i} className="avatar-mini">{iniciales(n)}</span>)}
                                                        </span>
                                                        Avisa a <strong>{nombres.join(', ')}</strong>
                                                        {v.cada_meses ? <> · {textoRepeticion(v.cada_meses).toLowerCase()}</> : null}
                                                    </div>
                                                ) : (
                                                    <div className="agenda-detalle">{textoRepeticion(v.cada_meses)}</div>
                                                )}
                                                <Link href={detalle} className="agenda-nomina">
                                                    <span><strong>{v.nomina_total}</strong> en la nómina</span>
                                                    {v.pendientes > 0 && (
                                                        <span className="agenda-estado" data-tono="ambar">{textoPendientes(v.pendientes)}</span>
                                                    )}
                                                </Link>
                                                {v.nota && <div className="agenda-nota">{v.nota}</div>}
                                                {puedeGestionar && avisos.length > 0 && (
                                                    <div className="agenda-avisos">
                                                        {avisos.map((a, i) => (
                                                            <span key={a.texto} data-mal={a.mal}>{i > 0 && ' · '}{a.texto}</span>
                                                        ))}
                                                    </div>
                                                )}
                                                {puedeGestionar && (
                                                    <div className="agenda-acciones">
                                                        <button className="btn btn-primary" onClick={() => marcarHecho(v)}>✓ Hecho</button>
                                                        <button className="agenda-accion" onClick={() => setModal(v)}>Editar</button>
                                                        <button className="agenda-accion agenda-accion--borrar" onClick={() => borrar(v)}>Borrar</button>
                                                    </div>
                                                )}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </section>
                    ))
                )}

                {modal && (
                    <DocumentacionModal
                        vencimiento={modal === 'nuevo' ? null : modal}
                        usuarios={usuarios}
                        miId={miId}
                        onClose={() => setModal(null)}
                        onGuardado={() => { setModal(null); cargar(); avisarCambioVencimientos(); }}
                    />
                )}
            </div>
        </MainLayout>
    );
}
