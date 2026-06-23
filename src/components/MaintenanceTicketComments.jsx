'use client';

import { useState, useCallback, useEffect } from 'react';
import { getSessionUser } from '@/lib/session';
import { formatArgentinaDate } from '@/lib/datetime';

const ROLE_LABELS = {
    wework: 'WeWork',
    supervisor_tecnico: 'Supervisor Técnico',
    admin: 'Admin',
};

const ROLE_COLORS = {
    wework: { bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE' },
    supervisor_tecnico: { bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
    admin: { bg: '#F3F4F6', fg: '#374151', border: '#D1D5DB' },
};

export default function MaintenanceTicketComments({ ticketId, canAdd = true, initialComments = null }) {
    const [comments, setComments] = useState(initialComments || []);
    const [loaded, setLoaded] = useState(Boolean(initialComments));
    const [newComment, setNewComment] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/maintenance-tickets/${ticketId}/comments`);
            if (res.ok) setComments(await res.json());
        } finally {
            setLoaded(true);
        }
    }, [ticketId]);

    useEffect(() => {
        if (!loaded) load();
    }, [loaded, load]);

    const addComment = async () => {
        if (!newComment.trim()) return;
        const user = getSessionUser();
        setSaving(true);
        try {
            const res = await fetch(`/api/maintenance-tickets/${ticketId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    body: newComment,
                    author_id: user?.app_user_id || user?.id || null,
                    author_name: user ? `${user.name || ''} ${user.surname || ''}`.trim() || user.dni : null,
                    author_role: user?.role || null,
                }),
            });
            if (res.ok) {
                const saved = await res.json();
                setComments(prev => [...prev, saved]);
                setNewComment('');
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Conversación
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: canAdd ? '0.75rem' : 0 }}>
                {loaded && comments.length === 0 && (
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                        Todavía no hay mensajes. {canAdd ? 'Escribí el primero abajo.' : ''}
                    </p>
                )}
                {comments.map(c => {
                    const roleStyle = ROLE_COLORS[c.author_role] || ROLE_COLORS.admin;
                    const roleLabel = ROLE_LABELS[c.author_role] || c.author_role || 'Usuario';
                    return (
                        <div key={c.id} style={{ padding: '0.55rem 0.7rem', background: 'var(--color-muted-surface)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{c.author_name || 'Usuario'}</span>
                                <span style={{
                                    display: 'inline-block', padding: '0.1rem 0.45rem', borderRadius: '999px',
                                    fontSize: '0.65rem', fontWeight: 700,
                                    background: roleStyle.bg, color: roleStyle.fg, border: `1px solid ${roleStyle.border}`,
                                }}>
                                    {roleLabel}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                    {formatArgentinaDate(c.created_at)}
                                </span>
                            </div>
                            <div style={{ fontSize: '0.88rem', whiteSpace: 'pre-wrap' }}>{c.body}</div>
                        </div>
                    );
                })}
            </div>
            {canAdd && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                    <textarea
                        value={newComment}
                        onChange={e => setNewComment(e.target.value)}
                        rows={2}
                        placeholder="Escribí un mensaje..."
                        style={{ flex: 1, padding: '0.5rem 0.65rem', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.88rem', resize: 'vertical', fontFamily: 'inherit' }}
                    />
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={saving || !newComment.trim()}
                        onClick={addComment}
                        style={{ flexShrink: 0 }}
                    >
                        {saving ? '...' : 'Enviar'}
                    </button>
                </div>
            )}
        </div>
    );
}
