'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import BuscadorOperario from '@/components/BuscadorOperario';
import DocumentacionModal from '@/components/DocumentacionModal';
import HojaFecha from '@/components/HojaFecha';
import { getSessionUser } from '@/lib/session';
import { notify } from '@/lib/toast';
import { diasEntre, hoyArgentina } from '@/lib/trabajos';
import { downloadWorkbook } from '@/lib/xlsx-download';
import { nombreArchivoNomina } from '@/lib/nomina-documentacion';
import { fechasSugeridas, nombreArchivoWord, plantillaDe } from '@/lib/plantillas-documentacion';
import {
    avisarCambioVencimientos, cuandoVence, textoPendientes, textoRepeticion, tonoVencimiento,
} from '@/lib/vencimientos';

// El detalle de una documentación mensual: su fecha y su nómina (quiénes van
// documentados para ese cliente, con DNI).
//
// - Operaciones, la jefa operativa, admin y RRHH arman la nómina: "+ Agregar"
//   y la ✕. Quien se agrega queda "Pendiente" hasta el próximo envío.
// - Admin y RRHH mandan la documentación: "Ya la mandé" (los pendientes que se
//   mandaron sueltos, sin mover la fecha) y "✓ Hecho" (la nómina completa,
//   pasa al mes siguiente). Cada envío queda en un registro que no se muestra.

const fmtDiaMesAR = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit',
});
const diaMes = (iso) => fmtDiaMesAR.format(new Date(iso));
const diaMesDeFecha = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

async function pedir(url, opciones = {}) {
    const res = await fetch(url, {
        credentials: 'include',
        ...opciones,
        headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Error de red.');
    return json;
}

export default function DocumentacionDetallePage() {
    const { id } = useParams();
    const router = useRouter();
    const [datos, setDatos] = useState(null);     // { vencimiento, nomina, usuarios, puede_gestionar }
    const [error, setError] = useState('');
    const [agregando, setAgregando] = useState(false);
    // Cambiar la key vuelve a montar el buscador: queda vacío y con el foco,
    // listo para agregar al siguiente.
    const [buscadorKey, setBuscadorKey] = useState(0);
    const [ocupado, setOcupado] = useState(false);
    const [editando, setEditando] = useState(false);
    const [bajandoWord, setBajandoWord] = useState(false);   // el panel de fechas del Word
    const [miId, setMiId] = useState(null);

    useEffect(() => { setMiId(getSessionUser()?.app_user_id || null); }, []);

    const cargar = useCallback(async () => {
        try {
            setDatos(await pedir(`/api/vencimientos?id=${encodeURIComponent(id)}`));
            setError('');
        } catch (e) {
            setError(e.message);
        }
    }, [id]);

    useEffect(() => { cargar(); }, [cargar]);

    const nomina = useMemo(() => datos?.nomina || [], [datos]);
    // En pantalla los pendientes van arriba de todo, para que no se olviden
    // (pedido del usuario, 2026-11-25). Dentro de cada grupo, por apellido. El
    // Excel sigue en orden alfabético.
    const nominaEnPantalla = useMemo(
        () => [...nomina.filter((p) => !p.enviado_at), ...nomina.filter((p) => p.enviado_at)],
        [nomina]
    );
    const ids = useMemo(() => new Set(nomina.map((p) => p.employee_id)), [nomina]);
    const pendientes = nomina.filter((p) => !p.enviado_at).length;
    const v = datos?.vencimiento;
    const puedeGestionar = Boolean(datos?.puede_gestionar);

    // Volver = deshacer el último paso (se puede llegar desde la lista, el
    // inicio o un aviso). Si se abrió el link directo, va a la lista.
    const volver = () => (window.history.length > 1 ? router.back() : router.push('/vencimientos'));

    const agregar = async (op) => {
        if (!op) return;
        try {
            await pedir('/api/vencimientos/nomina', { method: 'POST', body: JSON.stringify({ vencimiento_id: v.id, employee_id: op.id }) });
            notify.success('Agregado.');
            setBuscadorKey((k) => k + 1);
            await cargar();
            avisarCambioVencimientos();
        } catch (e) {
            notify.error(e.message);
        }
    };

    const sacar = async (p) => {
        if (!confirm(`¿Sacar a ${p.apellido}, ${p.nombre} de la nómina?`)) return;
        try {
            await pedir(`/api/vencimientos/nomina?id=${p.id}`, { method: 'DELETE' });
            notify.success('Sacado de la nómina.');
            await cargar();
            avisarCambioVencimientos();
        } catch (e) {
            notify.error(e.message);
        }
    };

    const yaLaMande = async () => {
        if (!confirm(`¿Marcar ${pendientes === 1 ? 'al pendiente' : `a los ${pendientes} pendientes`} como enviados?\n\nNo cambia la fecha de la documentación.`)) return;
        setOcupado(true);
        try {
            const r = await pedir('/api/vencimientos', { method: 'PATCH', body: JSON.stringify({ id: v.id, accion: 'enviados' }) });
            notify.success(r.enviados === 1 ? 'Listo: 1 marcado como enviado.' : `Listo: ${r.enviados} marcados como enviados.`);
            await cargar();
            avisarCambioVencimientos();
        } catch (e) {
            notify.error(e.message);
        } finally {
            setOcupado(false);
        }
    };

    const marcarHecho = async () => {
        const sigue = v.cada_meses ? '\n\nPasa sola al próximo vencimiento.' : '\n\nSale de la lista y ya no avisa.';
        if (!confirm(`¿Marcar "${v.titulo}" como hecha?\n\nLa nómina completa queda como enviada.${sigue}`)) return;
        setOcupado(true);
        try {
            const r = await pedir('/api/vencimientos', { method: 'PATCH', body: JSON.stringify({ id: v.id, accion: 'hecho' }) });
            notify.success(v.cada_meses ? `Hecho. La próxima vence el ${diaMesDeFecha(r.fecha)}.` : 'Hecho.');
            await cargar();
            avisarCambioVencimientos();
        } catch (e) {
            notify.error(e.message);
        } finally {
            setOcupado(false);
        }
    };

    const bajarExcel = async () => {
        try {
            const XLSX = await import('xlsx');
            const filas = nomina.map((p) => ({
                Apellido: p.apellido,
                Nombre: p.nombre,
                // Como número, igual que en las planillas de los clientes.
                DNI: /^\d+$/.test(p.dni || '') ? Number(p.dni) : (p.dni || ''),
            }));
            const ws = XLSX.utils.json_to_sheet(filas, { header: ['Apellido', 'Nombre', 'DNI'] });
            ws['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 12 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Nómina');
            downloadWorkbook(XLSX, wb, nombreArchivoNomina(v.titulo, v.fecha));
        } catch (e) {
            notify.error(e.message || 'No se pudo armar el Excel.');
        }
    };

    let contenido;
    if (error) {
        contenido = <div className="agenda-vacia" style={{ color: 'var(--error)' }}>{error}</div>;
    } else if (!datos) {
        contenido = <div className="agenda-vacia">Cargando…</div>;
    } else {
        const dias = diasEntre(hoyArgentina(), v.fecha);
        const tono = tonoVencimiento(dias);
        contenido = (
            <>
                <article className="agenda-lista agenda-fila doc-cabecera">
                    <HojaFecha fecha={v.fecha} tono={tono} />
                    <div className="agenda-cuerpo">
                        <div className="agenda-cabeza">
                            <h1 className="agenda-titulo doc-cabecera__titulo">{v.titulo}</h1>
                            <span className="agenda-cuando" data-tono={tono}>{cuandoVence(dias)}</span>
                        </div>
                        <div className="agenda-detalle">
                            Vence el <strong>{diaMesDeFecha(v.fecha)}</strong> · {textoRepeticion(v.cada_meses).toLowerCase()}
                        </div>
                        {v.nota && <div className="agenda-nota">{v.nota}</div>}
                        {puedeGestionar && (
                            <div className="agenda-acciones">
                                <button className="btn btn-primary" onClick={marcarHecho} disabled={ocupado}>✓ Hecho</button>
                                <button className="agenda-accion" onClick={() => setEditando(true)}>Editar</button>
                            </div>
                        )}
                    </div>
                </article>

                <section className="nomina">
                    <header className="nomina__cabeza">
                        <h2 className="agenda-grupo__titulo nomina__titulo">Nómina <small>{nomina.length}</small></h2>
                        <div className="nomina__botones">
                            {plantillaDe(v.id) && (
                                <button className="btn btn-secondary" onClick={() => setBajandoWord(true)} disabled={!nomina.length}>Bajar Word</button>
                            )}
                            <button className="btn btn-secondary" onClick={bajarExcel} disabled={!nomina.length}>Bajar Excel</button>
                            <button className="btn btn-primary" onClick={() => setAgregando((a) => !a)} aria-expanded={agregando}>
                                {agregando ? 'Listo' : '+ Agregar'}
                            </button>
                        </div>
                    </header>

                    {agregando && (
                        <div className="nomina__agregar">
                            <BuscadorOperario
                                key={buscadorKey}
                                value={null}
                                onChange={agregar}
                                url="/api/vencimientos/operarios"
                                placeholder="Apellido, nombre, legajo o DNI…"
                                autoFocus
                                yaElegidos={ids}
                            />
                        </div>
                    )}

                    {pendientes > 0 && (
                        <div className="nomina__pendientes">
                            <span>{textoPendientes(pendientes)} de enviar</span>
                            {puedeGestionar && (
                                <button className="btn btn-secondary" onClick={yaLaMande} disabled={ocupado}>Ya la mandé</button>
                            )}
                        </div>
                    )}

                    {nomina.length === 0 ? (
                        <div className="agenda-vacia nomina__vacia">
                            Todavía no hay nadie en la nómina. Agregá a quienes van en esta documentación con “+ Agregar”.
                        </div>
                    ) : (
                        <ul className="agenda-lista nomina__lista">
                            {nominaEnPantalla.map((p) => (
                                <li key={p.id} className="nomina-fila" data-pendiente={!p.enviado_at}>
                                    <span className="nomina-fila__nombre">{p.apellido}, {p.nombre}</span>
                                    {/* Sin puntos, como lo piden los clientes (2026-11-25). */}
                                    <span className="nomina-fila__dni">{p.dni ? `DNI ${p.dni}` : 'sin DNI'}</span>
                                    <span className="nomina-fila__estado">
                                        {!p.enviado_at && (
                                            <>
                                                <span className="agenda-estado" data-tono="ambar">Pendiente</span>
                                                <small>agregó {p.agregado_por || 'alguien'} el {diaMes(p.agregado_at)}</small>
                                            </>
                                        )}
                                    </span>
                                    <button
                                        type="button"
                                        className="nomina-fila__sacar"
                                        onClick={() => sacar(p)}
                                        title="Sacar de la nómina"
                                        aria-label={`Sacar a ${p.apellido}, ${p.nombre} de la nómina`}
                                    >
                                        ✕
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </>
        );
    }

    return (
        <MainLayout>
            <div className="config-view agenda doc-detalle">
                <div style={{ marginBottom: '1rem' }}>
                    <button className="btn btn-secondary" onClick={volver}>← Volver</button>
                </div>
                {contenido}
                {bajandoWord && v && plantillaDe(v.id) && (
                    <WordModal vencimiento={v} onClose={() => setBajandoWord(false)} />
                )}
                {editando && v && (
                    <DocumentacionModal
                        vencimiento={v}
                        usuarios={datos.usuarios || []}
                        miId={miId}
                        onClose={() => setEditando(false)}
                        onGuardado={() => { setEditando(false); cargar(); avisarCambioVencimientos(); }}
                    />
                )}
            </div>
        </MainLayout>
    );
}

// Las fechas del Word del cliente, ya propuestas (la de hoy y el período nuevo:
// del día siguiente al vencimiento real hasta un mes después). Se pueden
// corregir antes de bajarlo, por si se manda otro día.
function WordModal({ vencimiento, onClose }) {
    const plantilla = plantillaDe(vencimiento.id);
    const [fechas, setFechas] = useState(() => fechasSugeridas(vencimiento.fecha, plantilla.diasAntes, hoyArgentina()));
    const [bajando, setBajando] = useState(false);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !bajando) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, bajando]);

    const bajar = async () => {
        if (!fechas.fecha || !fechas.inicio || !fechas.fin) { notify.error('Completá las tres fechas.'); return; }
        if (fechas.fin < fechas.inicio) { notify.error('La finalización no puede ser antes del inicio.'); return; }
        setBajando(true);
        try {
            const res = await fetch(`/api/vencimientos/word?${new URLSearchParams({ id: vencimiento.id, ...fechas })}`, { credentials: 'include' });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo armar el Word.');
            const url = URL.createObjectURL(await res.blob());
            const a = document.createElement('a');
            a.href = url;
            a.download = nombreArchivoWord(plantilla.nombre, fechas.fecha);
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 0);
            onClose();
        } catch (e) {
            notify.error(e.message);
        } finally {
            setBajando(false);
        }
    };

    const campo = (clave, etiqueta) => (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, flex: '1 1 140px' }}>
            {etiqueta}
            <input
                type="date"
                className="card"
                style={{ margin: 0, fontWeight: 'normal', width: '100%' }}
                value={fechas[clave]}
                onChange={(e) => setFechas((f) => ({ ...f, [clave]: e.target.value }))}
            />
        </label>
    );

    return (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !bajando) onClose(); }}>
            <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Bajar Word</h2>
                    <button className="btn btn-secondary" onClick={onClose} disabled={bajando} style={{ padding: '0.3rem 0.6rem' }}>✕</button>
                </div>
                <p style={{ margin: '0.6rem 0 1rem', fontSize: '0.87rem', color: 'var(--text-muted)' }}>
                    {plantilla.nombre}, con la nómina de hoy. Revisá las fechas antes de bajarlo.
                </p>
                <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
                    {campo('fecha', 'Fecha')}
                    {campo('inicio', 'Fecha de inicio')}
                    {campo('fin', 'Fecha de finalización')}
                </div>
                <div className="config-modal-actions" style={{ marginTop: '1.4rem' }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={bajando}>Cancelar</button>
                    <button type="button" className="btn btn-primary" onClick={bajar} disabled={bajando}>
                        {bajando ? 'Armando…' : 'Bajar Word'}
                    </button>
                </div>
            </div>
        </div>
    );
}
