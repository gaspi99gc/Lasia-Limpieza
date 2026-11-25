'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import ActivarNotificaciones from '@/components/ActivarNotificaciones';
import DocumentacionModal from '@/components/DocumentacionModal';
import { getSessionUser } from '@/lib/session';
import { notify } from '@/lib/toast';
import { diasEntre, fmtFecha, hoyArgentina } from '@/lib/trabajos';
import { avisarCambioVencimientos, cuandoVence, textoPendientes, textoRepeticion, tonoVencimiento } from '@/lib/vencimientos';

// Documentación mensual (ex Vencimientos de RRHH): lo que se presenta a los
// clientes en una fecha, cada una con su nómina (quiénes van documentados).
// Avisa al celular de los responsables 7 días antes, 2 días antes y el mismo
// día, hasta que alguien la marca como hecha.
//
// La lista es chica a propósito (pedido del usuario, 2026-11-25): una línea por
// documentación, con la fecha, el nombre, los pendientes y "✓ Hecho" (admin y
// RRHH). Editar, Borrar y la nómina están en el detalle, /vencimientos/[id].
// La ven también Operaciones y la jefa operativa, que arman las nóminas ahí.

const GRUPOS = [
    { id: 'vencidos', titulo: 'Vencidas', tono: 'rojo' },
    { id: 'semana', titulo: 'Esta semana', tono: 'ambar' },
    { id: 'despues', titulo: 'Más adelante' },
];
const grupoDe = (dias) => (dias < 0 ? 'vencidos' : dias <= 7 ? 'semana' : 'despues');
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export default function DocumentacionMensualPage() {
    const [vencimientos, setVencimientos] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [puedeGestionar, setPuedeGestionar] = useState(false);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [nueva, setNueva] = useState(false);
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

    const [marcando, setMarcando] = useState(null);   // id de la que se está marcando
    const marcarHecho = async (v) => {
        const sigue = v.cada_meses ? '\n\nPasa sola al próximo vencimiento.' : '\n\nSale de la lista y ya no avisa.';
        if (!confirm(`¿Marcar "${v.titulo}" como hecha?\n\nLa nómina completa queda como enviada.${sigue}`)) return;
        setMarcando(v.id);
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
        } finally {
            setMarcando(null);
        }
    };

    const porGrupo = useMemo(() => {
        const hoy = hoyArgentina();
        const g = { vencidos: [], semana: [], despues: [] };
        for (const v of vencimientos) {
            const dias = diasEntre(hoy, v.fecha);
            g[grupoDe(dias)].push({ ...v, dias });
        }
        return g;
    }, [vencimientos]);

    return (
        <MainLayout>
            <div className="config-view agenda">
                <header className="page-header" style={{ marginBottom: '1rem', alignItems: 'center' }}>
                    <h1 style={{ margin: 0, flex: '1 1 0', minWidth: 'min-content' }}>Documentación mensual</h1>
                    {puedeGestionar && (
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginLeft: 'auto' }}>
                            <button className="btn btn-primary" onClick={() => setNueva(true)} disabled={!usuarios.length}>
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
                            ? 'Cargala con “+ Nuevo”.'
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
                                    // Lo normal es mensual: solo se aclara cuando no lo es.
                                    const otraRepeticion = Number(v.cada_meses) !== 1 ? textoRepeticion(v.cada_meses) : null;
                                    return (
                                        <div key={v.id} className="doc-fila" data-hecho={puedeGestionar || undefined}>
                                            <Link href={`/vencimientos/${v.id}`} className="doc-fila__link">
                                                <span className="doc-fila__fecha" data-tono={tono}>
                                                    <b>{Number(v.fecha.slice(8, 10))}</b>
                                                    <small>{MESES[Number(v.fecha.slice(5, 7)) - 1]}</small>
                                                </span>
                                                <span className="doc-fila__titulo">
                                                    {v.titulo}
                                                    {otraRepeticion && <small> · {otraRepeticion.toLowerCase()}</small>}
                                                </span>
                                                <span className="doc-fila__meta">
                                                    {v.pendientes > 0 && (
                                                        <span className="agenda-estado" data-tono="ambar">{textoPendientes(v.pendientes)}</span>
                                                    )}
                                                    <span className="agenda-cuando" data-tono={tono}>{cuandoVence(v.dias)}</span>
                                                </span>
                                            </Link>
                                            {/* "✓ Hecho" queda a mano en la lista, debajo del
                                                nombre como estaba antes (pedido del usuario): es
                                                lo que se usa todos los meses. */}
                                            {puedeGestionar && (
                                                <div className="doc-fila__acciones">
                                                    <button className="btn btn-primary doc-fila__hecho" onClick={() => marcarHecho(v)} disabled={marcando === v.id}>
                                                        ✓ Hecho
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ))
                )}

                {nueva && (
                    <DocumentacionModal
                        vencimiento={null}
                        usuarios={usuarios}
                        miId={miId}
                        onClose={() => setNueva(false)}
                        onGuardado={() => { setNueva(false); cargar(); avisarCambioVencimientos(); }}
                    />
                )}
            </div>
        </MainLayout>
    );
}
