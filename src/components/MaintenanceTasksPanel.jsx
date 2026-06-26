'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { getSessionUser } from '@/lib/session';
import { formatArgentinaDate } from '@/lib/datetime';
import { isWeworkService } from '@/lib/wework';
import { notify } from '@/lib/toast';

const ESTADO_INFO = {
    al_dia:     { label: 'Al día',     bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0', dot: '#10B981' },
    por_vencer: { label: 'Por vencer', bg: '#FFFBEB', fg: '#B45309', border: '#FCD34D', dot: '#F59E0B' },
    vencida:    { label: 'Vencida',    bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA', dot: '#EF4444' },
    pendiente:  { label: 'Sin registro', bg: '#F1F5F9', fg: '#475569', border: '#CBD5E1', dot: '#94A3B8' },
    a_demanda:  { label: 'A demanda',  bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE', dot: '#3B82F6' },
};

function EstadoChip({ estado }) {
    const e = ESTADO_INFO[estado] || ESTADO_INFO.pendiente;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.18rem 0.55rem', borderRadius: '999px',
            fontSize: '0.7rem', fontWeight: 700,
            background: e.bg, color: e.fg, border: `1px solid ${e.border}`, whiteSpace: 'nowrap',
        }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: e.dot }} />
            {e.label}
        </span>
    );
}

// Panel compartido de tareas de mantenimiento preventivo por servicio.
// canRegister=true -> el rol mantenimiento puede marcar tareas como hechas.
// canRegister=false -> wework, solo lectura.
export default function MaintenanceTasksPanel({ canRegister = false }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [services, setServices] = useState([]);
    const [loadingSvc, setLoadingSvc] = useState(true);
    const [serviceId, setServiceId] = useState('');
    const [step, setStep] = useState(1);

    const [tasks, setTasks] = useState([]);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [savingId, setSavingId] = useState(null);

    useEffect(() => {
        setCurrentUser(getSessionUser());
    }, []);

    useEffect(() => {
        (async () => {
            setLoadingSvc(true);
            try {
                const res = await fetch('/api/services');
                const data = await res.json();
                const all = Array.isArray(data) ? data : [];
                setServices(all.filter(s => isWeworkService(s.name)));
            } finally {
                setLoadingSvc(false);
            }
        })();
    }, []);

    const loadTasks = useCallback(async () => {
        if (!serviceId) return;
        setLoadingTasks(true);
        try {
            const res = await fetch(`/api/maintenance-tasks?service_id=${serviceId}`, { cache: 'no-store' });
            const data = await res.json();
            setTasks(Array.isArray(data) ? data : []);
        } finally {
            setLoadingTasks(false);
        }
    }, [serviceId]);

    useEffect(() => { loadTasks(); }, [loadTasks]);

    const selectedService = useMemo(
        () => services.find(s => String(s.id) === String(serviceId)) || null,
        [services, serviceId]
    );

    // Agrupa por area, manteniendo el orden del catalogo.
    const grouped = useMemo(() => {
        const map = new Map();
        for (const t of tasks) {
            if (!map.has(t.area)) map.set(t.area, []);
            map.get(t.area).push(t);
        }
        return Array.from(map.entries()).map(([area, items]) => ({ area, items }));
    }, [tasks]);

    const resumen = useMemo(() => {
        const r = { vencida: 0, por_vencer: 0, al_dia: 0, pendiente: 0 };
        for (const t of tasks) {
            if (t.estado in r) r[t.estado] += 1;
        }
        return r;
    }, [tasks]);

    const marcarHecha = async (task) => {
        const { default: Swal } = await import('sweetalert2');
        const hoy = new Date();
        const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

        const { value: fecha } = await Swal.fire({
            title: task.tarea,
            html: `<p style="font-size:13px;color:#6b7280;margin:0 0 10px;">${selectedService?.name || ''}</p>`,
            input: 'date',
            inputValue: hoyStr,
            inputLabel: '¿Qué día se realizó?',
            showCancelButton: true,
            confirmButtonText: 'Registrar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#00AEEF',
            didOpen: () => {
                const input = Swal.getInput();
                if (input) input.max = hoyStr; // no permitir fechas futuras
            },
        });
        if (!fecha) return;

        setSavingId(task.id);
        try {
            const user = getSessionUser();
            const res = await fetch('/api/maintenance-tasks/logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    catalog_id: task.id,
                    service_id: Number(serviceId),
                    fecha_realizacion: fecha,
                    realizado_por_id: user?.app_user_id || user?.id || null,
                    realizado_por_nombre: user ? `${user.name || ''} ${user.surname || ''}`.trim() || null : null,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'No se pudo registrar.');
            }
            notify.success('Tarea registrada');
            await loadTasks();
        } catch (e) {
            notify.error(e.message);
        } finally {
            setSavingId(null);
        }
    };

    // ── Paso 1: elegir servicio ──
    if (step === 1) {
        return (
            <div className="mtasks-card">
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Servicio</label>
                <SearchableSelect
                    options={services.map(s => ({ value: s.id, label: s.name }))}
                    value={serviceId}
                    onChange={(v) => setServiceId(v)}
                    placeholder={loadingSvc ? 'Cargando servicios...' : 'Seleccionar servicio...'}
                    searchPlaceholder="Buscar servicio..."
                />
                <button
                    type="button"
                    onClick={() => serviceId && setStep(2)}
                    disabled={!serviceId}
                    style={{
                        marginTop: '1.5rem', width: '100%', padding: '0.95rem', borderRadius: '10px',
                        border: 'none', background: '#00AEEF', color: '#fff', fontWeight: 700, fontSize: '1rem',
                        cursor: serviceId ? 'pointer' : 'not-allowed', opacity: serviceId ? 1 : 0.45,
                    }}
                >
                    Ver tareas
                </button>

                <style jsx>{`
                    .mtasks-card {
                        background: var(--color-surface);
                        border: 1px solid var(--border-color);
                        border-radius: 14px;
                        padding: 1.25rem 1.1rem;
                    }
                    @media (min-width: 700px) { .mtasks-card { padding: 1.75rem 1.5rem; } }
                `}</style>
            </div>
        );
    }

    // ── Paso 2: tareas del servicio ──
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                <button
                    type="button"
                    onClick={() => setStep(1)}
                    aria-label="Volver"
                    style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '999px', width: '36px', height: '36px', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                    ←
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Servicio</p>
                    <strong style={{ fontSize: '1.05rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedService?.name}</strong>
                </div>
            </div>
            <button
                type="button"
                onClick={() => setStep(1)}
                style={{ background: 'none', border: 'none', color: '#00AEEF', fontSize: '0.82rem', cursor: 'pointer', padding: 0, fontWeight: 600, marginBottom: '1.25rem' }}
            >
                Cambiar servicio
            </button>

            {/* Resumen de estado */}
            {!loadingTasks && tasks.length > 0 && (
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                    {resumen.vencida > 0 && <EstadoChip estado="vencida" />}
                    {resumen.por_vencer > 0 && <EstadoChip estado="por_vencer" />}
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                        {resumen.al_dia} al día · {resumen.pendiente} sin registro
                    </span>
                </div>
            )}

            {loadingTasks ? (
                <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Cargando...</div>
            ) : tasks.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: 'var(--text-muted)' }}>
                    No hay tareas en el catálogo.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {grouped.map(({ area, items }) => (
                        <div key={area}>
                            <h3 style={{
                                display: 'flex', alignItems: 'center', gap: '0.6rem',
                                fontSize: '1.12rem', fontWeight: 800, color: 'var(--text-main)',
                                letterSpacing: '0.01em', margin: '0 0 0.8rem',
                                padding: '0.5rem 0.85rem',
                                background: 'var(--color-muted-surface)',
                                border: '1px solid var(--border-color)',
                                borderLeft: '4px solid #00AEEF',
                                borderRadius: '8px',
                            }}>
                                {area}
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                                {items.map(task => (
                                    <TaskRow
                                        key={task.id}
                                        task={task}
                                        canRegister={canRegister}
                                        saving={savingId === task.id}
                                        onMarcar={() => marcarHecha(task)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function TaskRow({ task, canRegister, saving, onMarcar }) {
    const isCorrectiva = task.tipo === 'correctiva';
    return (
        <div className="card" style={{ marginBottom: 0, padding: '0.85rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <strong style={{ fontSize: '0.95rem', overflowWrap: 'anywhere' }}>{task.tarea}</strong>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {task.frecuencia_label}
                    </div>
                </div>
                <EstadoChip estado={task.estado} />
            </div>

            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                {task.ultima_fecha ? (
                    <>
                        Realizada el <strong style={{ color: 'var(--text-main)' }}>{formatArgentinaDate(task.ultima_fecha)}</strong>
                        {/* El autor solo lo ve el rol mantenimiento, no el cliente */}
                        {canRegister && task.ultima_por ? ` · ${task.ultima_por}` : ''}
                        {!isCorrectiva && task.proxima_fecha && (
                            <> · Próxima: {formatArgentinaDate(task.proxima_fecha)}</>
                        )}
                    </>
                ) : (
                    isCorrectiva ? 'Todavía no se registró ninguna.' : 'Sin registros todavía.'
                )}
            </div>

            {canRegister && (
                <button
                    type="button"
                    onClick={onMarcar}
                    disabled={saving}
                    style={{
                        marginTop: '0.7rem', width: '100%', padding: '0.55rem',
                        border: '1px solid #00AEEF', borderRadius: '8px',
                        background: 'transparent', color: '#00AEEF', fontWeight: 700,
                        fontSize: '0.85rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1,
                    }}
                >
                    {saving ? 'Guardando...' : (isCorrectiva ? '+ Registrar realización' : '✓ Marcar como hecha')}
                </button>
            )}
        </div>
    );
}
