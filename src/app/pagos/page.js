'use client';

import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { getSessionUser } from '@/lib/session';
import { notify } from '@/lib/toast';
import { formatArgentinaDate } from '@/lib/datetime';
import { normalizeText } from '@/lib/search';
import useIsMobile from '@/hooks/useIsMobile';

const TIPOS = [
    { key: 'adicional', label: 'Adicional' },
    { key: 'horas_extras', label: 'Horas extras' },
    { key: 'liquidacion_final', label: 'Liquidaciones finales' },
    { key: 'adelanto', label: 'Adelantos de sueldo' },
];
const TIPO_LABEL = Object.fromEntries(TIPOS.map(t => [t.key, t.label]));
// Color por tipo para los gráficos del resumen.
const TIPO_COLOR = {
    adicional: '#8b5cf6',
    horas_extras: '#2563eb',
    liquidacion_final: '#f59e0b',
    adelanto: '#10b981',
};

const money = (n) => Number(n || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });

// Convierte el valor de monto de una celda de Excel a string apto para el input.
// - Numero nativo de Excel (ej. 1234.56) → se usa tal cual.
// - Texto con formato argentino ("$ 1.234,56") → se limpia a "1234.56".
// - Vacio o no numerico → '' (se completa a mano despues).
function parseMonto(raw) {
    if (raw === '' || raw == null) return '';
    if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : '';
    const cleaned = String(raw).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
    return cleaned !== '' && Number.isFinite(Number(cleaned)) ? cleaned : '';
}

// --- Helpers para el resumen gráfico ---

const MES_CORTO = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
// 'YYYY-MM' -> 'Jul 26'
function mesLabel(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    return `${MES_CORTO[Number(m)] || m} ${String(y).slice(2)}`;
}
// Monto compacto para ejes/tarjetas: $1.2M, $840k, $0.
function montoCorto(n) {
    const v = Number(n || 0);
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
    if (v >= 1_000) return `$${Math.round(v / 1000)}k`;
    return `$${v}`;
}

// Agrupa planillas por mes (YYYY-MM), devolviendo [{mes, total}] ordenado.
// Si se pasa `tipo`, filtra solo ese tipo.
function gastoPorMes(sheets, tipo) {
    const acc = new Map();
    for (const s of sheets) {
        if (tipo && s.tipo !== tipo) continue;
        const mes = (s.fecha || '').slice(0, 7);
        if (!mes) continue;
        acc.set(mes, (acc.get(mes) || 0) + Number(s.total || 0));
    }
    return [...acc.entries()].map(([mes, total]) => ({ mes, total })).sort((a, b) => a.mes.localeCompare(b.mes));
}

// Gráfico de tendencia mensual (línea + área + puntos). El SVG dibuja solo la curva/área
// estirada al ancho (preserveAspectRatio=none); los puntos, montos y meses son divs HTML
// posicionados en %, así el texto y los círculos nunca se deforman. Sin librerías.
function LineaMes({ data, color = '#2563eb', alto = 150 }) {
    if (!data.length) {
        return (
            <p style={{ margin: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                Sin planillas cargadas todavía.
            </p>
        );
    }

    // Coordenadas normalizadas 0..100 en ambos ejes. La franja vertical usable deja
    // margen arriba (para el monto) y abajo, para que la curva no toque los bordes.
    const padX = 6, top = 16, bot = 8;
    const max = Math.max(...data.map(d => d.total), 1);
    const n = data.length;
    const px = (i) => n === 1 ? 50 : padX + (i / (n - 1)) * (100 - padX * 2);
    const py = (v) => top + (1 - v / max) * (100 - top - bot);
    const pts = data.map((d, i) => ({ ...d, x: px(i), y: py(d.total) }));

    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    const areaPath = n === 1 ? '' : `${linePath} L ${pts[n - 1].x.toFixed(2)} 100 L ${pts[0].x.toFixed(2)} 100 Z`;
    const gradId = `grad-${color.replace('#', '')}`;

    return (
        <div style={{ width: '100%' }}>
            <div style={{ position: 'relative', width: '100%', height: `${alto}px` }}>
                {/* Curva + área (se estira al ancho) */}
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                    <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                            <stop offset="100%" stopColor={color} stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    {areaPath && <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />}
                    <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </svg>
                {/* Puntos y montos como HTML (no se deforman) */}
                {pts.map((p, i) => (
                    <div key={i} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
                        <div style={{ position: 'absolute', bottom: '9px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>{montoCorto(p.total)}</div>
                        <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--card-bg, #fff)', border: `2px solid ${color}` }} />
                    </div>
                ))}
            </div>
            {/* Eje de meses, alineado con los puntos */}
            <div style={{ position: 'relative', height: '1rem', marginTop: '0.3rem' }}>
                {pts.map((p, i) => (
                    <span key={i} style={{ position: 'absolute', left: `${p.x}%`, transform: 'translateX(-50%)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {mesLabel(p.mes)}
                    </span>
                ))}
            </div>
        </div>
    );
}

export default function PagosPage() {
    const [readOnly, setReadOnly] = useState(false);
    const [sheets, setSheets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterTipo, setFilterTipo] = useState('todos');
    const isMobile = useIsMobile();

    // Modal de creacion/edicion.
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({ tipo: 'adicional', nombre: '', fecha: '', lines: [] });
    const [saving, setSaving] = useState(false);
    const [lineSearch, setLineSearch] = useState('');
    // Resumen del ultimo import, para cotejar la suma con el total del Excel.
    const [importInfo, setImportInfo] = useState(null);

    // Modal de detalle (solo lectura): ver los operarios de una planilla ya cargada.
    const [detalle, setDetalle] = useState(null);
    const [detalleLoading, setDetalleLoading] = useState(false);
    const [detalleSearch, setDetalleSearch] = useState('');

    useEffect(() => {
        setReadOnly(getSessionUser()?.role === 'direccion');
    }, []);

    const loadSheets = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/payment-sheets');
            const data = await res.json().catch(() => []);
            setSheets(Array.isArray(data) ? data : []);
        } catch {
            setSheets([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadSheets(); }, []);

    const filteredSheets = useMemo(() => {
        if (filterTipo === 'todos') return sheets;
        return sheets.filter(s => s.tipo === filterTipo);
    }, [sheets, filterTipo]);

    // Resumen para la vista "Todos": gasto total por mes + por cada tipo + totales.
    const resumen = useMemo(() => {
        const totalMensual = gastoPorMes(sheets);
        const porTipo = TIPOS.map(t => ({
            ...t,
            data: gastoPorMes(sheets, t.key),
            total: sheets.filter(s => s.tipo === t.key).reduce((a, s) => a + Number(s.total || 0), 0),
        }));
        const totalGeneral = sheets.reduce((a, s) => a + Number(s.total || 0), 0);
        return { totalMensual, porTipo, totalGeneral };
    }, [sheets]);

    const openNew = () => {
        setEditingId(null);
        setForm({ tipo: 'adicional', nombre: '', fecha: '', lines: [] });
        setLineSearch('');
        setImportInfo(null);
        setModalOpen(true);
    };

    // Abre el detalle de solo lectura de una planilla (ver operarios + montos).
    const openDetalle = async (id) => {
        setDetalleLoading(true);
        setDetalleSearch('');
        setDetalle({ id, cargando: true });
        try {
            const res = await fetch(`/api/payment-sheets/${id}`);
            if (!res.ok) { notify.error('No se pudo cargar la planilla.'); setDetalle(null); return; }
            const data = await res.json();
            setDetalle(data);
        } catch {
            notify.error('No se pudo cargar la planilla.');
            setDetalle(null);
        } finally {
            setDetalleLoading(false);
        }
    };

    const openEdit = async (id) => {
        try {
            const res = await fetch(`/api/payment-sheets/${id}`);
            if (!res.ok) { notify.error('No se pudo cargar la planilla.'); return; }
            const data = await res.json();
            setEditingId(id);
            setForm({
                tipo: data.tipo,
                nombre: data.nombre || '',
                fecha: data.fecha || '',
                lines: (data.lines || []).map(l => ({ operario: l.operario, monto: String(l.monto) })),
            });
            setLineSearch('');
            setImportInfo(null);
            setModalOpen(true);
        } catch {
            notify.error('No se pudo cargar la planilla.');
        }
    };

    const closeModal = () => { setModalOpen(false); setEditingId(null); setLineSearch(''); setImportInfo(null); };

    // Importa un Excel: columna 1 = operario, columna 2 = monto. Saltea el
    // encabezado (fila 1), las filas vacias y la fila de total (TOTAL/SUMA).
    const handleImportExcel = async (file) => {
        if (!file) return;
        try {
            const XLSX = await import('xlsx');
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            // Los Excel traen varias hojas; la de pago tiene la PERSONA en la 1ra columna
            // y el IMPORTE en la 2da. Los titulos varian segun el tipo de planilla:
            //   - Horas extras: "EMPLEADO" / "TOTAL"     (hoja "TABLA DINAMICA")
            //   - Adicionales:  "OPERARIOS" / "MONTO A PAGAR"  (hoja "PLANILLA DE PAGO")
            // Detectamos por esas palabras y descartamos las hojas de detalle (FECHA/SERVICIO).
            // Si aparece un formato con otra palabra en el encabezado, sumarla aca.
            const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
            const empiezaCon = (c, ...palabras) => palabras.some(p => (c || '').startsWith(p));
            const esHojaDePago = (sheet) => {
                const head = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false })[0] || [];
                const cols = head.map(norm);
                const col0EsPersona = empiezaCon(cols[0], 'empleado', 'operario');
                const col1EsImporte = empiezaCon(cols[1], 'total', 'monto', 'importe');
                const esDetalle = cols.includes('fecha') || cols.includes('servicio');
                return col0EsPersona && col1EsImporte && !esDetalle;
            };
            const nombreHoja = wb.SheetNames.find(n => esHojaDePago(wb.Sheets[n])) || wb.SheetNames[0];
            const ws = wb.Sheets[nombreHoja];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });

            // Salteamos la fila de encabezado.
            const dataRows = rows.slice(1);
            const esFilaTotal = (op) => /^(total|totales|suma|sumatoria)\b/i.test(op.trim());
            const imported = dataRows
                .map(r => ({
                    operario: (r?.[0] ?? '').toString().trim(),
                    monto: parseMonto(r?.[1]),
                }))
                .filter(l => l.operario && !esFilaTotal(l.operario));

            if (imported.length === 0) {
                notify.error('No encontré operarios en el archivo. Revisá que la columna 1 sea el operario.');
                return;
            }

            // Reemplazamos las filas actuales por las importadas.
            setForm(f => ({ ...f, lines: imported }));
            setLineSearch('');
            const suma = imported.reduce((acc, l) => acc + (Number(l.monto) || 0), 0);
            setImportInfo({ cantidad: imported.length, suma, archivo: file.name });
            notify.success(`Se importaron ${imported.length} operario${imported.length !== 1 ? 's' : ''}.`);
        } catch {
            notify.error('No se pudo leer el archivo. Asegurate de que sea un Excel (.xlsx) o CSV válido.');
        }
    };

    const modalTotal = useMemo(
        () => form.lines.reduce((acc, l) => acc + (Number(l.monto) || 0), 0),
        [form.lines]
    );

    // Filas visibles segun el buscador del modal.
    const visibleLines = useMemo(() => {
        const q = normalizeText(lineSearch);
        return form.lines
            .map((l, idx) => ({ ...l, idx }))
            .filter(l => !q || normalizeText(l.operario).includes(q));
    }, [form.lines, lineSearch]);

    const handleSave = async () => {
        if (!form.nombre.trim()) { notify.error('Ingresá un nombre para la planilla.'); return; }
        if (!form.fecha) { notify.error('Elegí la fecha del pago.'); return; }
        if (form.lines.length === 0) { notify.error('Importá un Excel con los operarios antes de guardar.'); return; }

        const cleanedLines = form.lines
            .map(l => ({ operario: l.operario.trim(), monto: Number(l.monto) }))
            .filter(l => l.operario && Number.isFinite(l.monto) && l.monto >= 0);

        const payload = { tipo: form.tipo, nombre: form.nombre.trim(), fecha: form.fecha, lines: cleanedLines };

        setSaving(true);
        try {
            const res = await fetch(editingId ? `/api/payment-sheets/${editingId}` : '/api/payment-sheets', {
                method: editingId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(data.error || 'No se pudo guardar la planilla.'); return; }
            notify.success(editingId ? 'Planilla actualizada' : 'Planilla creada');
            closeModal();
            loadSheets();
        } catch {
            notify.error('Error de red al guardar.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (sheet) => {
        if (!confirm(`¿Eliminar la planilla "${sheet.nombre}"? Esta acción no se puede deshacer.`)) return;
        try {
            const res = await fetch(`/api/payment-sheets/${sheet.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                notify.error(data.error || 'No se pudo eliminar la planilla.');
                return;
            }
            notify.success('Planilla eliminada');
            loadSheets();
        } catch {
            notify.error('Error de red al eliminar.');
        }
    };

    return (
        <MainLayout>
            <div className="config-view">
                <header className="page-header" style={{ marginBottom: '1.5rem' }}>
                    <div>
                        <h1>Pagos</h1>
                        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            Planillas de pago por operario. {readOnly ? 'Vista de solo lectura.' : 'Cargá cada pago y llevá el control de los totales.'}
                        </p>
                    </div>
                    {!readOnly && (
                        <div className="page-header-actions">
                            <button className="btn btn-primary" onClick={openNew}>+ Nueva planilla</button>
                        </div>
                    )}
                </header>

                {/* Filtro por tipo */}
                <div
                    className="card"
                    style={
                        isMobile
                            ? { padding: '0.75rem 0.85rem', marginBottom: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }
                            : { padding: '0.9rem 1.25rem', marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }
                    }
                >
                    <button
                        className={`btn ${filterTipo === 'todos' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
                        onClick={() => setFilterTipo('todos')}
                    >
                        Todos
                    </button>
                    {TIPOS.map(t => (
                        <button
                            key={t.key}
                            className={`btn ${filterTipo === t.key ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
                            onClick={() => setFilterTipo(t.key)}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* "Todos" = resumen gráfico anual. Un tipo puntual = listado de esas planillas. */}
                {filterTipo === 'todos' ? (
                    loading ? (
                        <div className="card" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>
                    ) : sheets.length === 0 ? (
                        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay planillas cargadas todavía.</div>
                    ) : (
                        <>
                            {/* Gasto total por mes (todos los tipos juntos) */}
                            <div className="card" style={{ marginBottom: '1.25rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.35rem' }}>
                                    <h3 style={{ margin: 0 }}>Gasto total por mes</h3>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total general: <strong style={{ color: 'var(--text-main)' }}>{money(resumen.totalGeneral)}</strong></span>
                                </div>
                                <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                    Suma de todas las planillas pagadas cada mes (adicionales, horas extras, liquidaciones y adelantos).
                                </p>
                                <LineaMes data={resumen.totalMensual} color="#2563eb" alto={200} />
                            </div>

                            {/* Un gráfico por tipo (escala propia para que no se aplasten entre sí) */}
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1.25rem' }}>
                                {resumen.porTipo.map(t => (
                                    <div key={t.key} className="card">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
                                            <h3 style={{ margin: 0, fontSize: '1rem' }}>{t.label}</h3>
                                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>{money(t.total)}</span>
                                        </div>
                                        <LineaMes data={t.data} color={TIPO_COLOR[t.key]} alto={130} />
                                    </div>
                                ))}
                            </div>
                        </>
                    )
                ) : (
                    <div className="card" style={{ padding: 0 }}>
                        <div className="table-container">
                            <table className="table mobile-cards-table">
                                <thead>
                                    <tr>
                                        <th>Planilla</th>
                                        <th>Tipo</th>
                                        <th>Fecha</th>
                                        <th style={{ textAlign: 'center' }}>Operarios</th>
                                        <th style={{ textAlign: 'right' }}>Total</th>
                                        {!readOnly && <th style={{ textAlign: 'right' }}>Acciones</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSheets.map(s => (
                                        <tr key={s.id} onClick={() => openDetalle(s.id)} style={{ cursor: 'pointer' }} title="Ver detalle de operarios">
                                            <td data-label="Planilla" style={{ fontWeight: 600 }}>{s.nombre}</td>
                                            <td data-label="Tipo">{TIPO_LABEL[s.tipo] || s.tipo}</td>
                                            <td data-label="Fecha">{s.fecha ? formatArgentinaDate(s.fecha) : ''}</td>
                                            <td data-label="Operarios" style={{ textAlign: 'center' }}>{s.cantidad_operarios}</td>
                                            <td data-label="Total" style={{ textAlign: 'right', fontWeight: 700 }}>{money(s.total)}</td>
                                            {!readOnly && (
                                                <td data-label="Acciones" className="mobile-hide-label" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                                                    <div className="table-action-group">
                                                        <button className="btn btn-secondary" onClick={() => openEdit(s.id)}>✏️</button>
                                                        <button className="btn btn-secondary" style={{ color: 'var(--error)' }} onClick={() => handleDelete(s)}>🗑️</button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                    {!loading && filteredSheets.length === 0 && (
                                        <tr>
                                            <td colSpan={readOnly ? 5 : 6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                                                No hay planillas de este tipo.
                                            </td>
                                        </tr>
                                    )}
                                    {loading && (
                                        <tr>
                                            <td colSpan={readOnly ? 5 : 6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                                                Cargando…
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Modal de detalle (solo lectura) */}
                {detalle && (
                    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) { setDetalle(null); setDetalleSearch(''); } }}>
                        <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
                            {detalleLoading || detalle.cargando ? (
                                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Cargando…</p>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                                        <div>
                                            <h2 style={{ margin: 0 }}>{detalle.nombre}</h2>
                                            <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                {TIPO_LABEL[detalle.tipo] || detalle.tipo}{detalle.fecha ? ` · ${formatArgentinaDate(detalle.fecha)}` : ''}
                                            </p>
                                        </div>
                                        <button className="btn btn-secondary" onClick={() => { setDetalle(null); setDetalleSearch(''); }} style={{ padding: '0.3rem 0.6rem' }}>✕</button>
                                    </div>

                                    {/* Resumen: cantidad de operarios + total */}
                                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', margin: '1rem 0', padding: '0.75rem 1rem', background: 'var(--surface-2, rgba(148,163,184,0.1))', borderRadius: '8px' }}>
                                        <div><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Operarios</span><div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{(detalle.lines || []).length}</div></div>
                                        <div style={{ marginLeft: 'auto', textAlign: 'right' }}><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total</span><div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{money(detalle.total)}</div></div>
                                    </div>

                                    {/* Buscador (útil con 60+ operarios) */}
                                    {(detalle.lines || []).length > 8 && (
                                        <input
                                            type="text"
                                            value={detalleSearch}
                                            onChange={(e) => setDetalleSearch(e.target.value)}
                                            placeholder="🔍 Buscar operario…"
                                            style={{ width: '100%', padding: '0.5rem 0.75rem', marginBottom: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg, transparent)', color: 'var(--text-main)', fontSize: '0.9rem' }}
                                        />
                                    )}

                                    {/* Lista de operarios */}
                                    <div style={{ maxHeight: '48vh', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                        {(detalle.lines || [])
                                            .filter(l => !detalleSearch || normalizeText(l.operario).includes(normalizeText(detalleSearch)))
                                            .map((l, i) => (
                                                <div key={l.id ?? i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.5rem 0.85rem', borderBottom: '1px solid var(--border-color)' }}>
                                                    <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{l.operario}</span>
                                                    <span style={{ fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{money(l.monto)}</span>
                                                </div>
                                            ))}
                                        {(detalle.lines || []).filter(l => !detalleSearch || normalizeText(l.operario).includes(normalizeText(detalleSearch))).length === 0 && (
                                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem', fontSize: '0.88rem' }}>Ningún operario coincide con la búsqueda.</p>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Modal crear/editar */}
                {modalOpen && !readOnly && (
                    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
                        <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '620px' }}>
                            <h2 style={{ margin: 0 }}>{editingId ? 'Editar planilla' : 'Nueva planilla'}</h2>

                            <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr 1fr' }}>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                    Tipo de pago
                                    <select
                                        className="card"
                                        style={{ margin: 0, fontWeight: 'normal' }}
                                        value={form.tipo}
                                        onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                                    >
                                        {TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                                    </select>
                                </label>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                    Fecha del pago
                                    <input
                                        type="date"
                                        className="card"
                                        style={{ margin: 0, fontWeight: 'normal' }}
                                        value={form.fecha}
                                        onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                                    />
                                </label>
                            </div>

                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '0.75rem' }}>
                                Nombre de la planilla
                                <input
                                    type="text"
                                    className="card"
                                    style={{ margin: 0, fontWeight: 'normal' }}
                                    placeholder="Ej. Adelantos julio 2026"
                                    value={form.nombre}
                                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                                />
                            </label>

                            <div style={{ marginTop: '1.25rem', paddingTop: '0.9rem', borderTop: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <h3 className="service-modal-section-title" style={{ margin: 0 }}>
                                        Operarios <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({form.lines.filter(l => l.operario.trim()).length})</span>
                                    </h3>
                                    <label className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
                                        📄 Importar Excel
                                        <input
                                            type="file"
                                            accept=".xlsx,.xls,.csv"
                                            style={{ display: 'none' }}
                                            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; handleImportExcel(f); }}
                                        />
                                    </label>
                                </div>
                                {/* Aviso post-import: nombre del archivo + suma para cotejar con el total del Excel */}
                                {importInfo && (
                                    <div style={{ margin: '0.6rem 0 0.7rem', padding: '0.7rem 1rem', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', color: '#1E40AF', fontSize: '0.85rem' }}>
                                        {importInfo.archivo && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', fontWeight: 600 }}>
                                                <span aria-hidden="true">📊</span>
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={importInfo.archivo}>{importInfo.archivo}</span>
                                            </div>
                                        )}
                                        Se importaron <strong>{importInfo.cantidad}</strong> operarios por un total de <strong>{money(importInfo.suma)}</strong>. Verificá que coincida con el total de tu Excel.
                                    </div>
                                )}

                                {form.lines.length === 0 ? (
                                    <p style={{ margin: '1rem 0', fontSize: '0.88rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
                                        Importá un Excel para cargar los operarios de la planilla.
                                    </p>
                                ) : (
                                    <>
                                        {/* Buscador dentro de la planilla (util con 60+ operarios) */}
                                        {form.lines.length > 8 && (
                                            <input
                                                type="text"
                                                className="card"
                                                style={{ margin: '0 0 0.5rem', width: '100%', fontWeight: 'normal' }}
                                                placeholder="🔍 Buscar operario en la planilla..."
                                                value={lineSearch}
                                                onChange={(e) => setLineSearch(e.target.value)}
                                            />
                                        )}

                                        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '38vh', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                            {visibleLines.map((l, i) => (
                                                <div key={l.idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'center', padding: '0.55rem 0.85rem', borderTop: i === 0 ? 'none' : '1px solid var(--border-color)' }}>
                                                    <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{l.operario}</span>
                                                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', textAlign: 'right', whiteSpace: 'nowrap' }}>{money(l.monto)}</span>
                                                </div>
                                            ))}
                                            {visibleLines.length === 0 && (
                                                <p style={{ margin: '0.75rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
                                                    No hay operarios que coincidan con “{lineSearch}”.
                                                </p>
                                            )}
                                        </div>
                                    </>
                                )}

                                <div style={{ marginTop: '0.9rem', padding: '0.7rem 1rem', background: 'var(--color-muted-surface)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total de la planilla</span>
                                    <strong style={{ fontSize: '1.15rem', color: 'var(--text-main)' }}>{money(modalTotal)}</strong>
                                </div>
                            </div>

                            <div className="config-modal-actions" style={{ marginTop: '1.25rem' }}>
                                <button className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancelar</button>
                                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                    {saving ? 'Guardando…' : 'Guardar planilla'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </MainLayout>
    );
}
