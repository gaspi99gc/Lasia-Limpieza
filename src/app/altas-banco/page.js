'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { notify } from '@/lib/toast';
import { downloadWorkbook } from '@/lib/xlsx-download';
import { normalizeText } from '@/lib/search';

// Altas de cuenta bancaria.
//
// Genera el Excel que se le manda al banco con los operarios nuevos, en el
// mismo formato que se venia armando a mano, y despues marca a quienes se
// incluyeron para que no vuelvan a aparecer el mes que viene.
//
// El trabajo que ahorra no es llenar el archivo: es acordarse de a quien ya se
// mando. El criterio no es "los que entraron este mes" sino "los que siguen
// trabajando y todavia no tienen cuenta" — en el envio de agosto, de 63
// ingresos de julio se mandaron 21 porque los otros 42 ya se habian ido.

// Las columnas del archivo del banco, en su orden exacto. Las que van vacias
// las completa el banco (numero de cuenta, CBU, asesor, paquete).
const COLUMNAS = ['Nº', 'CUIL', 'Apellido y Nombre', 'Fecha de Ingreso', 'TELEFONO',
    'Direccion', 'Fecha de nacimiento', 'CUENTA', 'CBU', 'ASESOR', 'PAQUETE', 'NACIONALIDAD'];

// Datos fijos de la empresa que van en cada fila.
const DOMICILIO_EMPRESA = 'LACROZE 2252 9 A';
const NACIONALIDAD_POR_DEFECTO = 'Argentina';

// 'YYYY-MM-DD' -> 'DD/MM/YYYY', que es como lo espera el banco. Se parte el
// string en vez de usar Date: con new Date('2026-09-05') el navegador
// interpreta UTC y en Argentina muestra el dia anterior.
function fmtFecha(ymd) {
    if (!ymd) return '';
    const [a, m, d] = String(ymd).slice(0, 10).split('-');
    return a && m && d ? `${d}/${m}/${a}` : '';
}

// "APELLIDO NOMBRE", como en los envios anteriores (sin coma).
function nombreBanco(e) {
    return `${e.apellido || ''} ${e.nombre || ''}`.replace(/\s+/g, ' ').trim().toUpperCase();
}

const hoyISO = () => new Date().toISOString().slice(0, 10);

export default function AltasBancoPage() {
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [busqueda, setBusqueda] = useState('');
    // A quiénes incluir. Arranca con todos tildados: el caso normal es mandarlos
    // a todos y destildar alguna excepción.
    const [excluidos, setExcluidos] = useState(new Set());
    const [marcando, setMarcando] = useState(false);
    // Se habilita recién después de bajar el archivo: marcar antes de mandarlo
    // dejaría gente sin alta y sin aparecer como pendiente.
    const [yaDescargado, setYaDescargado] = useState(false);

    const cargar = useCallback(async () => {
        setCargando(true);
        setError('');
        try {
            const res = await fetch('/api/altas-banco', { credentials: 'include' });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'No se pudo cargar.');
            setDatos(json);
            setExcluidos(new Set());
            setYaDescargado(false);
        } catch (e) {
            setError(e.message || 'Error de red.');
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    // En useMemo y no suelto: `datos?.pendientes || []` crea un array nuevo en
    // cada render y eso invalidaría los cálculos de abajo todo el tiempo.
    const pendientes = useMemo(() => datos?.pendientes || [], [datos]);

    const visibles = useMemo(() => {
        const q = normalizeText(busqueda);
        if (!q) return pendientes;
        return pendientes.filter((e) =>
            normalizeText(`${e.apellido} ${e.nombre} ${e.legajo} ${e.cuil || ''}`).includes(q));
    }, [pendientes, busqueda]);

    const incluidos = useMemo(
        () => pendientes.filter((e) => !excluidos.has(e.id)),
        [pendientes, excluidos]
    );

    const alternar = (id) => {
        setExcluidos((prev) => {
            const s = new Set(prev);
            if (s.has(id)) s.delete(id); else s.add(id);
            return s;
        });
    };

    const generarExcel = async () => {
        if (!incluidos.length) { notify.error('No hay nadie seleccionado.'); return; }
        const XLSX = await import('xlsx');

        const filas = incluidos.map((e) => ([
            '',                                        // Nº: lo pone el banco
            e.cuil || '',
            nombreBanco(e),
            fmtFecha(e.fecha_ingreso),
            e.celular || '',
            DOMICILIO_EMPRESA,
            // Sin fecha de nacimiento va "-", que es lo que se venía mandando
            // a mano en esos casos.
            fmtFecha(e.fecha_nacimiento) || '-',
            '', '', '', '',                            // CUENTA, CBU, ASESOR, PAQUETE
            NACIONALIDAD_POR_DEFECTO,
        ]));

        const ws = XLSX.utils.aoa_to_sheet([COLUMNAS, ...filas]);
        ws['!cols'] = [{ width: 5 }, { width: 14 }, { width: 34 }, { width: 14 }, { width: 13 },
            { width: 20 }, { width: 16 }, { width: 10 }, { width: 10 }, { width: 10 },
            { width: 10 }, { width: 13 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');

        const mes = new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })
            .format(new Date()).toUpperCase();
        downloadWorkbook(XLSX, wb, `ALTAS BBVA ${mes}.xlsx`);

        setYaDescargado(true);
        notify.success(`Excel generado con ${filas.length} ${filas.length === 1 ? 'alta' : 'altas'}.`);
    };

    const marcarEnviados = async () => {
        if (!incluidos.length) return;
        if (!confirm(`¿Marcar ${incluidos.length} como enviados al banco?\n\nNo van a volver a aparecer en esta lista.`)) return;
        setMarcando(true);
        try {
            const res = await fetch('/api/altas-banco', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ ids: incluidos.map((e) => e.id), fecha: hoyISO() }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'No se pudo marcar.');
            notify.success(`${json.marcados} marcados como enviados.`);
            cargar();
        } catch (e) {
            notify.error(e.message || 'Error de red.');
        } finally {
            setMarcando(false);
        }
    };

    if (cargando) {
        return <MainLayout><div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div></MainLayout>;
    }
    if (error) {
        return <MainLayout><div className="card" style={{ padding: '2rem', color: 'var(--error)' }}>{error}</div></MainLayout>;
    }

    const conDatosIncompletos = incluidos.filter((e) => e.faltan.length);

    return (
        <MainLayout>
            <div className="config-view">
                <header className="page-header" style={{ marginBottom: '1.5rem' }}>
                    <div>
                        <h1>Altas de banco</h1>
                        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            Operarios que todavía no se mandaron al banco para que les abran la cuenta.
                            {datos?.ultimoEnvio && <> Último envío: <strong>{fmtFecha(datos.ultimoEnvio)}</strong>.</>}
                        </p>
                    </div>
                </header>

                {pendientes.length === 0 ? (
                    <div className="card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>No hay altas pendientes</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '0.3rem' }}>
                            Todos los operarios activos ya fueron enviados al banco.
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 }}>{incluidos.length}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {incluidos.length === 1 ? 'alta a generar' : 'altas a generar'}
                                    {excluidos.size > 0 && ` · ${excluidos.size} sin incluir`}
                                </div>
                            </div>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                                <button className="btn btn-primary" onClick={generarExcel} disabled={!incluidos.length}>
                                    📄 Generar Excel
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={marcarEnviados}
                                    disabled={marcando || !incluidos.length || !yaDescargado}
                                    title={yaDescargado ? '' : 'Generá el Excel primero'}
                                >
                                    {marcando ? 'Marcando…' : '✓ Marcar como enviados'}
                                </button>
                            </div>
                        </div>

                        {/* El banco rechaza el alta si falta el CUIL o el teléfono: mejor
                            verlo antes de mandar el archivo que después. */}
                        {conDatosIncompletos.length > 0 && (
                            <div className="card" style={{ padding: '0.85rem 1.1rem', marginBottom: '1.25rem', background: '#FFFBEB', border: '1px solid #FCD34D', color: '#92400E', fontSize: '0.86rem' }}>
                                <strong>{conDatosIncompletos.length}</strong> {conDatosIncompletos.length === 1 ? 'tiene datos incompletos' : 'tienen datos incompletos'}:
                                se van a incluir igual, pero el banco puede rechazarlos. Completalos en el legajo.
                            </div>
                        )}

                        <input
                            type="text"
                            className="card"
                            style={{ width: '100%', margin: '0 0 1rem', fontWeight: 'normal' }}
                            placeholder="🔍 Buscar por nombre, legajo o CUIL…"
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                        />

                        <div className="card" style={{ padding: 0 }}>
                            <div className="table-container">
                                <table className="table mobile-cards-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '3rem' }}>Va</th>
                                            <th>Operario</th>
                                            <th>CUIL</th>
                                            <th>Ingreso</th>
                                            <th>Teléfono</th>
                                            <th>Nacimiento</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibles.map((e) => {
                                            const va = !excluidos.has(e.id);
                                            return (
                                                <tr key={e.id} style={{ opacity: va ? 1 : 0.45 }}>
                                                    <td data-label="Va">
                                                        <input type="checkbox" checked={va} onChange={() => alternar(e.id)} />
                                                    </td>
                                                    <td data-label="Operario">
                                                        <span style={{ fontWeight: 600 }}>{nombreBanco(e)}</span>
                                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> · leg {e.legajo}</span>
                                                        {e.faltan.length > 0 && (
                                                            <div style={{ fontSize: '0.75rem', color: '#B45309', fontWeight: 600 }}>
                                                                falta {e.faltan.join(' y ')}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td data-label="CUIL" style={{ fontVariantNumeric: 'tabular-nums' }}>{e.cuil || '—'}</td>
                                                    <td data-label="Ingreso" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtFecha(e.fecha_ingreso)}</td>
                                                    <td data-label="Teléfono" style={{ fontVariantNumeric: 'tabular-nums' }}>{e.celular || '—'}</td>
                                                    <td data-label="Nacimiento" style={{ fontVariantNumeric: 'tabular-nums', color: e.fecha_nacimiento ? undefined : 'var(--text-muted)' }}>
                                                        {fmtFecha(e.fecha_nacimiento) || '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {!visibles.length && (
                                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                                Nadie coincide con la búsqueda.
                                            </td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </MainLayout>
    );
}
