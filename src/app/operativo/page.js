'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import FaltaModal from '@/components/FaltaModal';
import { getSessionUser } from '@/lib/session';
import { notify } from '@/lib/toast';
import { downloadWorkbook } from '@/lib/xlsx-download';

// Espejo del Excel "operativo" de Operaciones: filas por operario-puesto
// agrupadas por servicio, dos valores por dia (hora ingreso - hora egreso, en
// decimal como lo escriben ellas: 6 = 06:00, 8.5 = 08:30, 22-30 = turno noche).
// El Excel sigue siendo la fuente de verdad: aca se sube el archivo del dia y
// la app lo refleja para toda la empresa.

const todayAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const addDaysStr = (ymd, n) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};
const fmtDM = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const diaSemana = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const esFinde = (ymd) => { const d = diaSemana(ymd); return d === 0 || d === 6; };
const listaFechas = (from, to) => {
    const out = [];
    for (let f = from; f <= to && out.length < 62; f = addDaysStr(f, 1)) out.push(f);
    return out;
};
// Las horas se muestran tal cual las escriben en el Excel (decimales).
const fmtHora = (h) => (h === null || h === undefined ? '' : String(Number(h)).replace('.', ','));

const LICENCIA_LABEL = {
    vacaciones: 'VAC', enfermedad: 'ENF', maternidad: 'MAT',
    paternidad: 'PAT', psiquiatrica: 'PSI', sin_goce: 'S/G',
};

const IMPORT_ROLES = ['operaciones', 'admin'];
const FALTAS_ROLES = ['operaciones', 'admin', 'jefe_operativo'];

const MOTIVO_LABEL = {
    enfermedad: 'Enfermedad', personal: 'Tema personal', accidente: 'Accidente',
    sin_aviso: 'No avisó', sin_especificar: 'Sin motivo',
};

export default function OperativoPage() {
    const [role, setRole] = useState(null);
    const [dateFrom, setDateFrom] = useState(() => addDaysStr(todayAR(), -2));
    const [dateTo, setDateTo] = useState(() => addDaysStr(todayAR(), 11));
    const [activePreset, setActivePreset] = useState('2sem');
    const [data, setData] = useState(null);
    const [licencias, setLicencias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busqueda, setBusqueda] = useState('');
    const [supervisorFiltro, setSupervisorFiltro] = useState('');
    const [colapsados, setColapsados] = useState(() => new Set());
    const [importando, setImportando] = useState(false);
    const [resumenImport, setResumenImport] = useState(null);
    const fileRef = useRef(null);
    // Faltas del rango que se está mirando.
    const [faltas, setFaltas] = useState([]);
    const [showFaltaModal, setShowFaltaModal] = useState(false);
    const hoyStr = todayAR();

    useEffect(() => { setRole(getSessionUser()?.role || null); }, []);

    const cargarFaltas = async (from, to) => {
        const f = await fetch(`/api/operativo/faltas?desde=${from}&hasta=${to}`, { credentials: 'include' })
            .then(r => (r.ok ? r.json() : []))
            .catch(() => []);
        setFaltas(Array.isArray(f) ? f : []);
    };

    const cargar = async (from, to) => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/operativo?from=${from}&to=${to}`, { credentials: 'include' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setError(json.error || 'No se pudo cargar el operativo.'); setData(null); return; }
            setData(json);
            // Licencias del periodo para pintarlas sobre la grilla.
            const lic = await fetch(`/api/licenses?period_from=${from}&period_to=${to}`, { credentials: 'include' })
                .then(r => (r.ok ? r.json() : []))
                .catch(() => []);
            setLicencias(Array.isArray(lic) ? lic : []);
            await cargarFaltas(from, to);
        } catch {
            setError('Error de red al cargar el operativo.');
            setData(null);
        } finally {
            setLoading(false);
        }
    };

    // Carga inicial con el rango por defecto; despues se recarga a mano desde
    // los filtros, no cuando cambian las fechas.
    useEffect(() => {
        cargar(dateFrom, dateTo);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const aplicarPreset = (preset) => {
        const t = todayAR();
        let from = dateFrom, to = dateTo;
        setActivePreset(preset);
        if (preset === 'sem') { from = addDaysStr(t, -1); to = addDaysStr(t, 5); }
        else if (preset === '2sem') { from = addDaysStr(t, -2); to = addDaysStr(t, 11); }
        else if (preset === 'mes') { from = addDaysStr(t, -2); to = addDaysStr(t, 27); }
        setDateFrom(from); setDateTo(to);
        cargar(from, to);
    };

    const fechas = useMemo(
        () => (data ? listaFechas(data.from, data.to) : []),
        [data]
    );

    // celdas[puesto_id][fecha] = { hi, he, nota }
    const celdas = useMemo(() => {
        const map = {};
        for (const d of data?.dias || []) {
            (map[d.puesto_id] = map[d.puesto_id] || {})[d.fecha] = d;
        }
        return map;
    }, [data]);

    // licPorEmpleado[employee_id] = [{start, end, type}]
    const licPorEmpleado = useMemo(() => {
        const map = {};
        for (const l of licencias) {
            if (!l.employee_id || !l.start_date || !l.end_date) continue;
            (map[l.employee_id] = map[l.employee_id] || []).push(l);
        }
        return map;
    }, [licencias]);

    const licenciaDe = (employeeId, fecha) => {
        if (!employeeId) return null;
        return (licPorEmpleado[employeeId] || []).find(l => l.start_date <= fecha && l.end_date >= fecha) || null;
    };

    // faltasPorPuesto[puesto_id][fecha] = falta, para pintarla sobre la grilla.
    const faltasPorPuesto = useMemo(() => {
        const map = {};
        for (const f of faltas) {
            if (!f.puesto_id) continue;
            (map[f.puesto_id] = map[f.puesto_id] || {})[f.fecha] = f;
        }
        return map;
    }, [faltas]);

    const faltasDelDia = useMemo(
        () => faltas.filter(f => f.fecha === hoyStr).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
        [faltas, hoyStr]
    );

    const borrarFalta = async (id) => {
        if (!confirm('¿Borrar esta falta?')) return;
        const res = await fetch(`/api/operativo/faltas?id=${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) { notify.error('No se pudo borrar la falta.'); return; }
        setFaltas(prev => prev.filter(f => f.id !== id));
    };

    const supervisores = useMemo(() => {
        const set = new Set();
        for (const p of data?.puestos || []) if (p.supervisor_nombre) set.add(p.supervisor_nombre.trim());
        return [...set].sort();
    }, [data]);

    // Agrupar por servicio respetando el orden del archivo.
    const grupos = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        const out = [];
        let actual = null;
        for (const p of data?.puestos || []) {
            if (supervisorFiltro && (p.supervisor_nombre || '').trim() !== supervisorFiltro) continue;
            if (q) {
                const blob = `${p.servicio_excel} ${p.nombre_excel || ''} ${p.apodo_excel || ''} ${p.supervisor_nombre || ''}`.toLowerCase();
                if (!blob.includes(q)) continue;
            }
            if (!actual || actual.servicio !== p.servicio_excel) {
                actual = { servicio: p.servicio_excel, direccion: p.direccion_excel, supervisor: p.supervisor_nombre, puestos: [] };
                out.push(actual);
            }
            actual.puestos.push(p);
        }
        return out;
    }, [data, busqueda, supervisorFiltro]);

    const totalPuestos = grupos.reduce((acc, g) => acc + g.puestos.length, 0);

    const sinMatch = useMemo(() => {
        const emp = new Set(); const svc = new Set();
        for (const p of data?.puestos || []) {
            if (p.tipo === 'titular' && !p.employee_id && p.nombre_excel) emp.add(p.nombre_excel);
            if (!p.service_id && p.servicio_excel) svc.add(p.servicio_excel);
        }
        return { empleados: [...emp].sort(), servicios: [...svc].sort() };
    }, [data]);

    const toggleGrupo = (servicio) => {
        setColapsados(prev => {
            const next = new Set(prev);
            if (next.has(servicio)) next.delete(servicio); else next.add(servicio);
            return next;
        });
    };

    const subirArchivo = async (file) => {
        if (!file) return;
        setImportando(true);
        setResumenImport(null);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/api/operativo/import', { method: 'POST', body: fd, credentials: 'include' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(json.error || 'No se pudo importar el archivo.'); return; }
            setResumenImport(json);
            notify.success(`Operativo importado: ${json.puestos} puestos, ${json.celdas} celdas (${fmtDM(json.desde)} al ${fmtDM(json.hasta)}).`);
            cargar(dateFrom, dateTo);
        } catch {
            notify.error('Error de red al importar.');
        } finally {
            setImportando(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const exportarExcel = async () => {
        if (!data || !grupos.length) { notify.error('No hay datos para exportar.'); return; }
        const XLSX = await import('xlsx');
        const header = ['SUPERVISOR', 'SERVICIO', 'DIRECCION', 'CELULAR', 'OPERARIOS', 'APELLIDO Y NOMBRE'];
        for (const f of fechas) { header.push(fmtDM(f)); header.push(fmtDM(f)); }
        const filas = [header];
        for (const g of grupos) {
            for (const p of g.puestos) {
                const fila = [p.supervisor_nombre || '', p.servicio_excel, p.direccion_excel || '', p.celular || '', p.apodo_excel || '', p.nombre_excel || ''];
                for (const f of fechas) {
                    const c = celdas[p.id]?.[f];
                    fila.push(c?.hi ?? '');
                    fila.push(c?.he ?? '');
                }
                filas.push(fila);
            }
        }
        const ws = XLSX.utils.aoa_to_sheet(filas);
        ws['!cols'] = [{ width: 14 }, { width: 34 }, { width: 28 }, { width: 15 }, { width: 12 }, { width: 30 }, ...fechas.flatMap(() => [{ width: 6 }, { width: 6 }])];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'OPERATIVO');
        downloadWorkbook(XLSX, wb, `Operativo_${data.from}_a_${data.to}.xlsx`);
    };

    const horasDesactualizado = data?.ultimaImportacion
        ? (Date.now() - new Date(data.ultimaImportacion).getTime()) / 3600000
        : null;

    const puedeImportar = IMPORT_ROLES.includes(role);

    const thFecha = (f) => (
        <th
            key={f}
            className={[
                esFinde(f) ? 'op-weekend-head' : '',
                f === hoyStr ? 'op-today-head' : '',
            ].filter(Boolean).join(' ')}
        >
            {DIAS_SEMANA[diaSemana(f)]}<br />{fmtDM(f)}
        </th>
    );

    return (
        <MainLayout>
            <div className="config-view">
                <header className="page-header" style={{ marginBottom: '1rem' }}>
                    <div>
                        <h1>Operativo</h1>
                        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            Quién trabaja dónde y en qué horario, según el operativo de Operaciones.
                        </p>
                    </div>
                </header>

                {/* Estado de actualizacion + acciones */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
                    {data?.ultimaImportacion ? (
                        <span style={{
                            fontSize: '0.8rem', padding: '0.3rem 0.7rem', borderRadius: '999px',
                            background: horasDesactualizado > 26 ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.12)',
                            color: horasDesactualizado > 26 ? '#b45309' : '#15803d', fontWeight: 600,
                        }}>
                            Último archivo subido: {new Date(data.ultimaImportacion).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} hs
                            {horasDesactualizado > 26 ? ' · puede estar desactualizado' : ''}
                        </span>
                    ) : !loading && (
                        <span style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', borderRadius: '999px', background: 'rgba(245,158,11,0.15)', color: '#b45309', fontWeight: 600 }}>
                            Todavía no se importó ningún operativo
                        </span>
                    )}
                    <div style={{ flex: 1 }} />
                    {puedeImportar && (
                        <>
                            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => subirArchivo(e.target.files?.[0])} />
                            <button className="btn btn-primary" disabled={importando} onClick={() => fileRef.current?.click()}>
                                {importando ? 'Importando…' : '📥 Subir operativo del día'}
                            </button>
                        </>
                    )}
                    {FALTAS_ROLES.includes(role) && data && data.puestos.length > 0 && (
                        <button className="btn btn-primary" onClick={() => setShowFaltaModal(true)}>
                            ⚠ Registrar falta
                        </button>
                    )}
                    {data && grupos.length > 0 && (
                        <button className="btn btn-secondary" onClick={exportarExcel}>📤 Exportar Excel</button>
                    )}
                </div>

                {/* Faltas de hoy. Va arriba de todo porque es lo que se mira
                    durante el día: quién falta y cuántas horas hay que cubrir. */}
                {faltasDelDia.length > 0 && (
                    <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '0.7rem', flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>Faltas de hoy</h3>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                {faltasDelDia.length} {faltasDelDia.length === 1 ? 'persona' : 'personas'} ·{' '}
                                {faltasDelDia.reduce((a, f) => a + (Number(f.horas) || 0), 0)} horas sin cubrir
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {faltasDelDia.map(f => (
                                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', fontSize: '0.87rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-color)' }}>
                                    <strong>{f.nombre}</strong>
                                    <span style={{ color: 'var(--text-muted)' }}>{f.servicio}</span>
                                    {f.horas != null && <span style={{ fontWeight: 600 }}>{fmtHora(f.horas)} hs</span>}
                                    <span className="op-tag op-tag-warn">{MOTIVO_LABEL[f.motivo] || f.motivo}</span>
                                    {f.nota && <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{f.nota}</span>}
                                    <span style={{ flex: 1 }} />
                                    {f.registrado_por && (
                                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>cargó {f.registrado_por}</span>
                                    )}
                                    {FALTAS_ROLES.includes(role) && (
                                        <button onClick={() => borrarFalta(f.id)} title="Borrar" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: '0.95rem' }}>✕</button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Resumen del ultimo import de esta sesion */}
                {resumenImport && (
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                        <strong>{resumenImport.archivo}</strong> importado: {resumenImport.puestos} puestos
                        ({resumenImport.puestosNuevos} nuevos, {resumenImport.puestosDesactivados} dados de baja del operativo),
                        {' '}{resumenImport.celdas} celdas del {fmtDM(resumenImport.desde)} al {fmtDM(resumenImport.hasta)}.
                        {(resumenImport.sinMatchEmpleados?.length > 0 || resumenImport.sinMatchServicios?.length > 0) && (
                            <div style={{ marginTop: '0.5rem', color: '#b45309' }}>
                                {resumenImport.sinMatchEmpleados?.length > 0 && <div>Operarios sin match con la base: {resumenImport.sinMatchEmpleados.join(' · ')}</div>}
                                {resumenImport.sinMatchServicios?.length > 0 && <div>Servicios sin match: {resumenImport.sinMatchServicios.join(' · ')}</div>}
                            </div>
                        )}
                    </div>
                )}

                {/* Filtros */}
                <div className="card" style={{ marginBottom: '1rem', padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 220px', minWidth: '200px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>Buscar</label>
                        <input
                            type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                            placeholder="Operario, servicio o supervisor…"
                            style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg, transparent)', color: 'var(--text-main)' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>Supervisor</label>
                        <select value={supervisorFiltro} onChange={e => setSupervisorFiltro(e.target.value)}
                            style={{ padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg, transparent)', color: 'var(--text-main)' }}>
                            <option value="">Todos</option>
                            {supervisores.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>Desde</label>
                        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePreset(''); }}
                            style={{ padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg, transparent)', color: 'var(--text-main)' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>Hasta</label>
                        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePreset(''); }}
                            style={{ padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg, transparent)', color: 'var(--text-main)' }} />
                    </div>
                    <button className="btn btn-primary" onClick={() => cargar(dateFrom, dateTo)} disabled={loading} style={{ height: 'fit-content' }}>
                        {loading ? 'Cargando…' : 'Ver'}
                    </button>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {[['sem', 'Semana'], ['2sem', '2 semanas'], ['mes', 'Mes']].map(([key, label]) => (
                            <button key={key} className={`btn ${activePreset === key ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }} onClick={() => aplicarPreset(key)}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {error && <div className="card" style={{ padding: '1rem', color: 'var(--error)', marginBottom: '1rem' }}>{error}</div>}

                {/* Sin match: para revisar una sola vez y corregir en la base o el Excel */}
                {(sinMatch.empleados.length > 0 || sinMatch.servicios.length > 0) && (
                    <details className="card" style={{ padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.83rem' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#b45309' }}>
                            ⚠ Sin match con la base: {sinMatch.empleados.length} operarios · {sinMatch.servicios.length} servicios
                        </summary>
                        {sinMatch.empleados.length > 0 && (
                            <p style={{ margin: '0.6rem 0 0' }}><strong>Operarios</strong> (el nombre del Excel no coincide con ningún legajo): {sinMatch.empleados.join(' · ')}</p>
                        )}
                        {sinMatch.servicios.length > 0 && (
                            <p style={{ margin: '0.6rem 0 0' }}><strong>Servicios</strong> (no coinciden con el catálogo): {sinMatch.servicios.join(' · ')}</p>
                        )}
                    </details>
                )}

                {loading && !data ? (
                    <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando el operativo…</div>
                ) : data && grupos.length === 0 ? (
                    <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        {data.puestos.length === 0
                            ? 'Todavía no hay operativo cargado. Subí el archivo del día para empezar.'
                            : 'Ningún puesto coincide con la búsqueda.'}
                    </div>
                ) : data && (
                    <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem 1rem', margin: '0 0 0.6rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            <span>{grupos.length} servicios · {totalPuestos} puestos</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ background: 'var(--op-on-bg)', color: 'var(--op-on-text)', fontWeight: 700, borderRadius: '4px', padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}>6–14</span>
                                trabaja (ingreso–egreso; {'>'}24 = termina al día siguiente)
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ background: 'var(--op-lic-bg)', color: 'var(--op-lic-text)', fontWeight: 700, borderRadius: '4px', padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}>VAC</span>
                                licencia cargada en RRHH
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ background: 'var(--op-warn-bg)', color: 'var(--op-warn-text)', fontWeight: 700, borderRadius: '4px', padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}>6–14</span>
                                figura con horario estando de licencia
                            </span>
                            <span>· celda vacía = no trabaja</span>
                        </div>
                        <div className="card" style={{ padding: 0, overflowX: 'auto', maxHeight: '72vh', overflowY: 'auto' }}>
                            <table className="op-grid">
                                <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
                                    <tr>
                                        <th className="op-name-head" style={{ position: 'sticky' }}>Operario</th>
                                        {fechas.map(thFecha)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {grupos.map(g => (
                                        <GrupoServicio
                                            key={g.servicio}
                                            grupo={g}
                                            fechas={fechas}
                                            celdas={celdas}
                                            licenciaDe={licenciaDe}
                                            hoyStr={hoyStr}
                                            faltasPorPuesto={faltasPorPuesto}
                                            colapsado={colapsados.has(g.servicio)}
                                            onToggle={() => toggleGrupo(g.servicio)}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {showFaltaModal && data && (
                    <FaltaModal
                        fecha={hoyStr}
                        puestos={data.puestos}
                        celdasPorPuesto={celdas}
                        onClose={() => setShowFaltaModal(false)}
                        onGuardada={() => cargarFaltas(data.from, data.to)}
                    />
                )}
            </div>
        </MainLayout>
    );
}

function GrupoServicio({ grupo, fechas, celdas, licenciaDe, hoyStr, faltasPorPuesto, colapsado, onToggle }) {
    return (
        <>
            <tr className="op-group" onClick={onToggle}>
                <td colSpan={1 + fechas.length}>
                    {colapsado ? '▸' : '▾'} {grupo.servicio}
                    <span className="op-group-meta">
                        {grupo.direccion ? `${grupo.direccion} · ` : ''}{grupo.supervisor ? `Sup: ${grupo.supervisor} · ` : ''}{grupo.puestos.length} puesto{grupo.puestos.length === 1 ? '' : 's'}
                    </span>
                </td>
            </tr>
            {!colapsado && grupo.puestos.map((p, i) => (
                <tr key={p.id} className={i % 2 === 0 ? 'op-r' : 'op-r-alt'}>
                    <td className="op-name" title={p.nombre_excel || 'Puesto sin asignar'}>
                        {p.tipo === 'vacante' ? (
                            <span className="op-vacante">Puesto sin asignar</span>
                        ) : (
                            <>
                                {p.nombre_excel}
                                {p.tipo !== 'titular' && (
                                    <span className="op-tag op-tag-extra">
                                        {p.tipo === 'adicional_fijo' ? 'ADIC' : 'EXTRA'}
                                    </span>
                                )}
                                {p.tipo === 'titular' && !p.employee_id && (
                                    <span className="op-tag op-tag-warn" title="No coincide con ningún legajo">SIN LEGAJO</span>
                                )}
                            </>
                        )}
                    </td>
                    {fechas.map(f => (
                        <Celda
                            key={f}
                            celda={celdas[p.id]?.[f]}
                            licencia={licenciaDe(p.employee_id, f)}
                            falta={faltasPorPuesto?.[p.id]?.[f]}
                            finde={esFinde(f)}
                            esHoy={f === hoyStr}
                        />
                    ))}
                </tr>
            ))}
        </>
    );
}

function Celda({ celda, licencia, falta, finde, esHoy }) {
    const tiene = celda && (celda.hi !== null || celda.he !== null);
    const conflicto = tiene && licencia; // planificado estando de licencia
    const clases = [];
    if (esHoy) clases.push('op-today-col');

    // La falta manda sobre todo lo demás: es lo que realmente pasó ese día.
    if (falta) {
        clases.push('op-falta');
        return (
            <td className={clases.join(' ')} title={`Faltó${falta.horas != null ? ` (${fmtHora(falta.horas)} hs)` : ''}${falta.nota ? ` · ${falta.nota}` : ''}`}>
                FALTÓ
            </td>
        );
    }

    if (tiene) {
        clases.push(conflicto ? 'op-conflict' : 'op-on');
        return (
            <td className={clases.join(' ')} title={conflicto ? `Tiene licencia ${licencia.type} pero figura con horario` : (celda.nota || '')}>
                {fmtHora(celda.hi)}–{fmtHora(celda.he)}
            </td>
        );
    }
    if (licencia) {
        clases.push('op-lic');
        return (
            <td className={clases.join(' ')} title={`Licencia: ${licencia.type} (${licencia.start_date} al ${licencia.end_date})`}>
                {LICENCIA_LABEL[licencia.type] || 'LIC'}
            </td>
        );
    }
    if (finde) clases.push('op-weekend');
    if (celda?.nota) clases.push('op-note');
    return (
        <td className={clases.join(' ')} title={celda?.nota || ''}>
            {celda?.nota ? celda.nota.slice(0, 8) : ''}
        </td>
    );
}
