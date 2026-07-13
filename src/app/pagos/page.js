'use client';

import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { getSessionUser } from '@/lib/session';
import { notify } from '@/lib/toast';
import { formatArgentinaDate } from '@/lib/datetime';
import { normalizeText } from '@/lib/search';

const TIPOS = [
    { key: 'adicional', label: 'Adicional' },
    { key: 'horas_extras', label: 'Horas extras' },
    { key: 'liquidacion_final', label: 'Liquidaciones finales' },
    { key: 'adelanto', label: 'Adelantos de sueldo' },
];
const TIPO_LABEL = Object.fromEntries(TIPOS.map(t => [t.key, t.label]));

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

export default function PagosPage() {
    const [readOnly, setReadOnly] = useState(false);
    const [sheets, setSheets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterTipo, setFilterTipo] = useState('todos');

    // Modal de creacion/edicion.
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({ tipo: 'adicional', nombre: '', fecha: '', lines: [] });
    const [saving, setSaving] = useState(false);
    const [lineSearch, setLineSearch] = useState('');
    // Resumen del ultimo import, para cotejar la suma con el total del Excel.
    const [importInfo, setImportInfo] = useState(null);

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

    const openNew = () => {
        setEditingId(null);
        setForm({ tipo: 'adicional', nombre: '', fecha: '', lines: [] });
        setLineSearch('');
        setImportInfo(null);
        setModalOpen(true);
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
            const ws = wb.Sheets[wb.SheetNames[0]];
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
            setImportInfo({ cantidad: imported.length, suma });
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
                <div className="card" style={{ padding: '0.9rem 1.25rem', marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
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

                {/* Lista de planillas */}
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
                                    <tr key={s.id}>
                                        <td data-label="Planilla" style={{ fontWeight: 600 }}>{s.nombre}</td>
                                        <td data-label="Tipo">{TIPO_LABEL[s.tipo] || s.tipo}</td>
                                        <td data-label="Fecha">{s.fecha ? formatArgentinaDate(s.fecha) : ''}</td>
                                        <td data-label="Operarios" style={{ textAlign: 'center' }}>{s.cantidad_operarios}</td>
                                        <td data-label="Total" style={{ textAlign: 'right', fontWeight: 700 }}>{money(s.total)}</td>
                                        {!readOnly && (
                                            <td data-label="Acciones" className="mobile-hide-label" style={{ textAlign: 'right' }}>
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
                                            {filterTipo === 'todos' ? 'No hay planillas cargadas todavía.' : 'No hay planillas de este tipo.'}
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
                                <p style={{ margin: '0 0 0.6rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    El Excel debe tener el <strong>operario en la primera columna</strong> y el <strong>monto en la segunda</strong>, con una fila de encabezado. La planilla se carga tal cual el Excel (no se edita a mano); la fila de total se saltea sola.
                                </p>

                                {/* Aviso post-import: mostramos la suma para cotejar con el total del Excel */}
                                {importInfo && (
                                    <div style={{ marginBottom: '0.7rem', padding: '0.7rem 1rem', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', color: '#1E40AF', fontSize: '0.85rem' }}>
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
