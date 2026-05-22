'use client';

import { useState, useCallback } from 'react';
import { getSessionUser } from '@/lib/session';
import { formatArgentinaDate } from '@/lib/datetime';

export default function IncidentNotesThread({ incidentId, canAdd = true }) {
    const [notes, setNotes] = useState([]);
    const [showNotes, setShowNotes] = useState(false);
    const [loadedNotes, setLoadedNotes] = useState(false);
    const [newNote, setNewNote] = useState('');
    const [savingNote, setSavingNote] = useState(false);

    const loadNotes = useCallback(async () => {
        try {
            const res = await fetch(`/api/incident-notes?incident_id=${incidentId}`);
            if (res.ok) setNotes(await res.json());
        } finally {
            setLoadedNotes(true);
        }
    }, [incidentId]);

    const toggleNotes = () => {
        const next = !showNotes;
        setShowNotes(next);
        if (next && !loadedNotes) loadNotes();
    };

    const addNote = async () => {
        if (!newNote.trim()) return;
        const user = getSessionUser();
        setSavingNote(true);
        try {
            const res = await fetch('/api/incident-notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    incident_id: incidentId,
                    nota: newNote,
                    autor: user ? `${user.name} ${user.surname}` : null,
                }),
            });
            if (res.ok) {
                const saved = await res.json();
                setNotes(prev => [...prev, saved]);
                setNewNote('');
            }
        } finally {
            setSavingNote(false);
        }
    };

    return (
        <div style={{ marginTop: '0.6rem' }}>
            <button
                type="button"
                onClick={toggleNotes}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-primary)',
                }}
            >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {showNotes ? 'Ocultar notas' : `Notas${notes.length ? ` (${notes.length})` : ''}`}
            </button>

            {showNotes && (
                <div style={{ marginTop: '0.6rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.7rem' }}>
                    {loadedNotes && notes.length === 0 && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>
                            Todavía no hay notas.
                        </p>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: canAdd ? '0.6rem' : 0 }}>
                        {notes.map(n => (
                            <div key={n.id} style={{ fontSize: '0.82rem', padding: '0.45rem 0.6rem', background: 'var(--color-muted-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                                <div style={{ whiteSpace: 'pre-wrap' }}>{n.nota}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                    {n.autor ? `${n.autor} · ` : ''}{formatArgentinaDate(n.created_at)}
                                </div>
                            </div>
                        ))}
                    </div>
                    {canAdd && (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                            <textarea
                                value={newNote}
                                onChange={e => setNewNote(e.target.value)}
                                rows={2}
                                placeholder="Escribí una nota..."
                                style={{ flex: 1, padding: '0.45rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', resize: 'vertical', fontFamily: 'inherit' }}
                            />
                            <button
                                type="button"
                                className="btn btn-primary"
                                disabled={savingNote || !newNote.trim()}
                                onClick={addNote}
                                style={{ flexShrink: 0 }}
                            >
                                {savingNote ? '...' : 'Agregar'}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
