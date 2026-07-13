'use client';

import { useEffect, useMemo, useState } from 'react';
import { notify } from '@/lib/toast';
import { matchesSearch } from '@/lib/search';
import { formatArgentinaDate } from '@/lib/datetime';

const emptyForm = () => ({
    persona: '', caratula: '', estado: '', fecha_inicio: '', fecha_audiencia: '', fecha_cierre: '', notas: '',
});

const fieldLabel = { margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 };

export default function LegalCasesView({ readOnly = false }) {
    const [cases, setCases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyForm());
    const [saving, setSaving] = useState(false);

    const loadCases = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/legal-cases');
            const data = await res.json().catch(() => []);
            setCases(Array.isArray(data) ? data : []);
        } catch {
            setCases([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadCases(); }, []);

    const filtered = useMemo(
        () => cases.filter(c => matchesSearch(search, [c.persona, c.caratula, c.estado])),
        [cases, search]
    );

    const openNew = () => { setEditingId(null); setForm(emptyForm()); setModalOpen(true); };
    const openEdit = (c) => {
        setEditingId(c.id);
        setForm({
            persona: c.persona || '',
            caratula: c.caratula || '',
            estado: c.estado || '',
            fecha_inicio: c.fecha_inicio || '',
            fecha_audiencia: c.fecha_audiencia || '',
            fecha_cierre: c.fecha_cierre || '',
            notas: c.notas || '',
        });
        setModalOpen(true);
    };
    const closeModal = () => { setModalOpen(false); setEditingId(null); };

    const handleSave = async () => {
        if (!form.persona.trim()) { notify.error('Ingresá la persona o entidad del caso.'); return; }
        setSaving(true);
        try {
            const res = await fetch(editingId ? `/api/legal-cases/${editingId}` : '/api/legal-cases', {
                method: editingId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(data.error || 'No se pudo guardar el caso.'); return; }
            notify.success(editingId ? 'Caso actualizado' : 'Caso creado');
            closeModal();
            loadCases();
        } catch {
            notify.error('Error de red al guardar.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (c) => {
        if (!confirm(`¿Eliminar el caso de "${c.persona}"? Esta acción no se puede deshacer.`)) return;
        try {
            const res = await fetch(`/api/legal-cases/${c.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                notify.error(data.error || 'No se pudo eliminar el caso.');
                return;
            }
            notify.success('Caso eliminado');
            loadCases();
        } catch {
            notify.error('Error de red al eliminar.');
        }
    };

    const fmt = (d) => d ? formatArgentinaDate(d) : '—';

    return (
        <div className="legales-view">
            <header className="page-header" style={{ marginBottom: '1.5rem' }}>
                <div>
                    <h1>Legales</h1>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Casos legales de la empresa. {readOnly ? 'Vista de solo lectura.' : ''}
                    </p>
                </div>
                {!readOnly && (
                    <div className="page-header-actions">
                        <button className="btn btn-primary" onClick={openNew}>+ Nuevo caso</button>
                    </div>
                )}
            </header>

            <div className="card" style={{ padding: '0.9rem 1.25rem', marginBottom: '1.25rem' }}>
                <input
                    type="text"
                    placeholder="Buscar por persona, carátula o estado..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="card"
                    style={{ margin: 0, width: '100%' }}
                />
            </div>

            <div className="card" style={{ padding: 0 }}>
                <div className="table-container">
                    <table className="table mobile-cards-table">
                        <thead>
                            <tr>
                                <th>Persona / Entidad</th>
                                <th>Carátula</th>
                                <th>Estado</th>
                                <th>Inicio</th>
                                <th>Próxima audiencia</th>
                                <th>Cierre</th>
                                {!readOnly && <th style={{ textAlign: 'right' }}>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(c => (
                                <tr key={c.id}>
                                    <td data-label="Persona / Entidad" style={{ fontWeight: 600 }}>{c.persona}</td>
                                    <td data-label="Carátula">{c.caratula || '—'}</td>
                                    <td data-label="Estado">{c.estado || '—'}</td>
                                    <td data-label="Inicio">{fmt(c.fecha_inicio)}</td>
                                    <td data-label="Próxima audiencia">{fmt(c.fecha_audiencia)}</td>
                                    <td data-label="Cierre">{fmt(c.fecha_cierre)}</td>
                                    {!readOnly && (
                                        <td data-label="Acciones" className="mobile-hide-label" style={{ textAlign: 'right' }}>
                                            <div className="table-action-group">
                                                <button className="btn btn-secondary" onClick={() => openEdit(c)}>✏️</button>
                                                <button className="btn btn-secondary" style={{ color: 'var(--error)' }} onClick={() => handleDelete(c)}>🗑️</button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            {!loading && filtered.length === 0 && (
                                <tr>
                                    <td colSpan={readOnly ? 6 : 7} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                                        {search ? 'No hay casos que coincidan con la búsqueda.' : 'No hay casos legales cargados todavía.'}
                                    </td>
                                </tr>
                            )}
                            {loading && (
                                <tr>
                                    <td colSpan={readOnly ? 6 : 7} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>Cargando…</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {modalOpen && !readOnly && (
                <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
                    <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
                        <h2 style={{ margin: 0 }}>{editingId ? 'Editar caso legal' : 'Nuevo caso legal'}</h2>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '1rem', ...fieldLabel }}>
                            Persona / Entidad
                            <input
                                type="text"
                                className="card"
                                style={{ margin: 0, fontWeight: 'normal' }}
                                placeholder="Ej. Pérez Juan / Estudio González"
                                value={form.persona}
                                onChange={(e) => setForm(f => ({ ...f, persona: e.target.value }))}
                            />
                        </label>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', ...fieldLabel }}>
                                Carátula / Tipo
                                <input
                                    type="text"
                                    className="card"
                                    style={{ margin: 0, fontWeight: 'normal' }}
                                    placeholder="Ej. Juicio laboral, Expte. 1234/26"
                                    value={form.caratula}
                                    onChange={(e) => setForm(f => ({ ...f, caratula: e.target.value }))}
                                />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', ...fieldLabel }}>
                                Estado
                                <input
                                    type="text"
                                    className="card"
                                    style={{ margin: 0, fontWeight: 'normal' }}
                                    placeholder="Ej. En trámite, Cerrado"
                                    value={form.estado}
                                    onChange={(e) => setForm(f => ({ ...f, estado: e.target.value }))}
                                />
                            </label>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', ...fieldLabel }}>
                                Fecha de inicio
                                <input type="date" className="card" style={{ margin: 0, fontWeight: 'normal' }} value={form.fecha_inicio} onChange={(e) => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', ...fieldLabel }}>
                                Próxima audiencia
                                <input type="date" className="card" style={{ margin: 0, fontWeight: 'normal' }} value={form.fecha_audiencia} onChange={(e) => setForm(f => ({ ...f, fecha_audiencia: e.target.value }))} />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', ...fieldLabel }}>
                                Fecha de cierre
                                <input type="date" className="card" style={{ margin: 0, fontWeight: 'normal' }} value={form.fecha_cierre} onChange={(e) => setForm(f => ({ ...f, fecha_cierre: e.target.value }))} />
                            </label>
                        </div>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.75rem', ...fieldLabel }}>
                            Notas / observaciones
                            <textarea
                                className="card"
                                style={{ margin: 0, fontWeight: 'normal', minHeight: '80px', resize: 'vertical' }}
                                placeholder="Novedades, detalles del caso…"
                                value={form.notas}
                                onChange={(e) => setForm(f => ({ ...f, notas: e.target.value }))}
                            />
                        </label>

                        <div className="config-modal-actions" style={{ marginTop: '1.25rem' }}>
                            <button className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'Guardando…' : 'Guardar caso'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
