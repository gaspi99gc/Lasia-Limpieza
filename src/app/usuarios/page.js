'use client';

import { useState, useEffect } from 'react';
import MainLayout from '@/components/MainLayout';
import { useCatalog } from '@/lib/CatalogContext';

function EyeIcon({ open }) {
    return open ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
    ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
    );
}

function PasswordInput({ placeholder, value, onChange, show, onToggle }) {
    return (
        <div style={{ position: 'relative' }}>
            <input
                type={show ? 'text' : 'password'}
                placeholder={placeholder}
                className="card"
                style={{ margin: 0, width: '100%', paddingRight: '2.5rem' }}
                value={value}
                onChange={onChange}
            />
            <button type="button" onClick={onToggle} tabIndex={-1} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}>
                <EyeIcon open={show} />
            </button>
        </div>
    );
}

const ROLE_LABEL = { admin: 'Administrador', direccion: 'Dirección', purchases: 'Compras', supervisor: 'Supervisor', jefe_operativo: 'Jefe Operativo', rrhh: 'RRHH', operaciones: 'Operaciones' };
const ROLE_ORDER = { admin: 0, direccion: 1, jefe_operativo: 2, operaciones: 3, rrhh: 4, purchases: 5, supervisor: 6 };
const sortUsers = arr => [...arr].sort((a, b) => {
    const rDiff = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
    if (rDiff !== 0) return rDiff;
    return `${a.surname} ${a.name}`.localeCompare(`${b.surname} ${b.name}`);
});

export default function UsuariosPage() {
    const { refetch: refetchCatalog } = useCatalog();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState(null);
    const [formData, setFormData] = useState({});
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/app-users');
            if (res.ok) setUsers(sortUsers(await res.json()));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const openModal = (user = {}) => {
        setEditingUser(user);
        setFormData(user.id ? {
            name: user.name,
            surname: user.surname,
            username: user.username,
            role: user.role,
            login_enabled: user.login_enabled !== false,
            password: '',
            confirmPassword: '',
        } : {
            name: '',
            surname: '',
            username: '',
            role: 'supervisor',
            login_enabled: true,
            password: '',
            confirmPassword: '',
        });
        setShowPassword(false);
        setShowConfirmPassword(false);
    };

    const closeModal = () => {
        setEditingUser(null);
        setShowPassword(false);
        setShowConfirmPassword(false);
    };

    const handleSave = async () => {
        if (!formData.name?.trim() || !formData.surname?.trim() || !formData.username?.toString().trim()) {
            alert('Completá nombre, apellido y usuario.');
            return;
        }
        if (!editingUser?.id && !formData.password) {
            alert('Definí una contraseña inicial.');
            return;
        }
        if (formData.password && formData.password.length < 6) {
            alert('La contraseña debe tener al menos 6 caracteres.');
            return;
        }
        if ((formData.password || formData.confirmPassword) && formData.password !== formData.confirmPassword) {
            alert('Las contraseñas no coinciden.');
            return;
        }
        if (!['admin', 'purchases', 'supervisor', 'jefe_operativo', 'rrhh', 'direccion'].includes(formData.role)) {
            alert('Seleccioná un rol válido.');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                username: formData.username.toString().trim(),
                name: formData.name.trim(),
                surname: formData.surname.trim(),
                role: formData.role,
                login_enabled: formData.login_enabled !== false,
                password: formData.password || undefined,
            };

            const url = editingUser?.id ? `/api/app-users/${editingUser.id}` : '/api/app-users';
            const method = editingUser?.id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json().catch(() => ({}));

            if (res.ok) {
                await load();
                refetchCatalog();
                closeModal();
            } else {
                alert(data.error || 'Error al guardar');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (user) => {
        if (!confirm(`¿Eliminar a ${user.surname}, ${user.name}? Esta acción no se puede deshacer.`)) return;
        const res = await fetch(`/api/app-users/${user.id}`, { method: 'DELETE' });
        if (res.ok) {
            setUsers(users.filter(u => u.id !== user.id));
            refetchCatalog();
        } else {
            alert('No se pudo eliminar el usuario.');
        }
    };

    return (
        <MainLayout>
            <div>
                <header className="page-header" style={{ marginBottom: '2rem' }}>
                    <div>
                        <h1>Usuarios del Sistema</h1>
                    </div>
                    <button className="btn btn-primary" onClick={() => openModal()}>+ Crear Usuario</button>
                </header>

                <div className="card" style={{ padding: 0 }}>
                    <div className="table-container">
                        <table className="table mobile-cards-table">
                            <thead>
                                <tr>
                                    <th>Nombre completo</th>
                                    <th>Usuario</th>
                                    <th>Rol</th>
                                    <th>Acceso</th>
                                    <th style={{ textAlign: 'right' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Cargando...</td></tr>
                                ) : users.length === 0 ? (
                                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No hay usuarios cargados.</td></tr>
                                ) : users.map(u => (
                                    <tr key={u.id}>
                                        <td data-label="Nombre completo"><strong>{u.surname}, {u.name}</strong></td>
                                        <td data-label="Usuario">
                                            <strong>{u.username}</strong>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Usuario de inicio de sesión</div>
                                        </td>
                                        <td data-label="Rol">
                                            <span className="badge badge-info">{ROLE_LABEL[u.role] || u.role}</span>
                                        </td>
                                        <td data-label="Acceso">
                                            <span className={`badge ${u.login_enabled ? 'badge-success' : 'badge-danger'}`}>
                                                {u.login_enabled ? 'Habilitado' : 'Bloqueado'}
                                            </span>
                                        </td>
                                        <td data-label="Acciones" className="mobile-hide-label" style={{ textAlign: 'right' }}>
                                            <div className="table-action-group">
                                                <button className="btn btn-secondary" onClick={() => openModal(u)}>✏️</button>
                                                <button className="btn btn-secondary" style={{ color: 'var(--error)' }} onClick={() => handleDelete(u)}>🗑️</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {editingUser !== null && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>{editingUser?.id ? 'Editar Usuario' : 'Crear Usuario'}</h2>
                        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <input
                                type="text" placeholder="Nombre" className="card" style={{ margin: 0 }}
                                value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                            <input
                                type="text" placeholder="Apellido" className="card" style={{ margin: 0 }}
                                value={formData.surname || ''} onChange={e => setFormData({ ...formData, surname: e.target.value })}
                            />
                            <input
                                type="text" placeholder="Usuario (DNI o identificador)" className="card" style={{ margin: 0 }}
                                value={formData.username || ''} onChange={e => setFormData({ ...formData, username: e.target.value })}
                            />
                            <select
                                className="card"
                                style={{ margin: 0, padding: '0.75rem' }}
                                value={formData.role || 'supervisor'}
                                onChange={e => setFormData({ ...formData, role: e.target.value })}
                            >
                                <option value="supervisor">Supervisor</option>
                                <option value="jefe_operativo">Jefe Operativo</option>
                                <option value="rrhh">RRHH</option>
                                <option value="direccion">Dirección</option>
                                <option value="admin">Administrador</option>
                                <option value="purchases">Compras</option>
                            </select>
                            <div className="supervisor-toggle-row" style={{ padding: '0.9rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--color-surface)' }}>
                                <div>
                                    <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>Acceso habilitado</div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Si lo desactivás, el usuario no podrá iniciar sesión.</div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={formData.login_enabled !== false}
                                    onChange={e => setFormData({ ...formData, login_enabled: e.target.checked })}
                                    style={{ width: 'auto', margin: 0, transform: 'scale(1.2)' }}
                                />
                            </div>
                            <PasswordInput
                                placeholder={editingUser?.id ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'}
                                value={formData.password || ''}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                show={showPassword}
                                onToggle={() => setShowPassword(v => !v)}
                            />
                            <PasswordInput
                                placeholder={editingUser?.id ? 'Confirmar nueva contraseña' : 'Confirmar contraseña'}
                                value={formData.confirmPassword || ''}
                                onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                                show={showConfirmPassword}
                                onToggle={() => setShowConfirmPassword(v => !v)}
                            />
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                {editingUser?.id ? 'Dejá la contraseña vacía para mantener la actual.' : 'Mínimo 6 caracteres.'}
                            </div>
                        </div>
                        <div className="config-modal-actions" style={{ marginTop: '2rem' }}>
                            <button className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'Guardando...' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </MainLayout>
    );
}
