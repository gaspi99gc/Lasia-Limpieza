'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { getSessionUser } from '@/lib/session';
import { isWeworkService } from '@/lib/wework';
import { formatArgentinaDate } from '@/lib/datetime';

// Estados que cuentan como "resuelto/cerrado". El resto (abierta, en_revision)
// se consideran activos. updated_at hace de fecha de resolucion para los cerrados.
const RESOLVED_STATES = new Set(['reparada', 'reemplazada', 'descartada', 'completada']);
const ESTADO_INFO = {
    abierta: { label: 'Abierta', bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
    en_revision: { label: 'En revisión', bg: '#FFFBEB', fg: '#B45309', border: '#FCD34D' },
    reparada: { label: 'Reparada', bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
    reemplazada: { label: 'Reemplazada', bg: '#F1F5F9', fg: '#475569', border: '#CBD5E1' },
    descartada: { label: 'Descartada', bg: '#F8FAFC', fg: '#64748B', border: '#E2E8F0' },
    completada: { label: 'Completada', bg: '#ECFDF5', fg: '#065F46', border: '#6EE7B7' },
};

function esc(s) {
    return (s ?? '').toString()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function incidentRowHtml(inc) {
    const info = ESTADO_INFO[inc.estado] || ESTADO_INFO.abierta;
    const resolved = RESOLVED_STATES.has(inc.estado);
    const badge = `<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;background:${info.bg};color:${info.fg};border:1px solid ${info.border};">${info.label}</span>`;
    const tipo = inc.tipo_falla ? `<span style="font-size:11px;color:#6b7280;">· ${esc(inc.tipo_falla)}</span>` : '';
    const reportado = `Reportada el ${formatArgentinaDate(inc.created_at)}${inc.reportado_por_nombre ? ` por ${esc(inc.reportado_por_nombre)}` : ''}`;
    const resuelta = resolved
        ? `<div style="font-size:12px;color:#047857;margin-top:2px;">Resuelta el ${formatArgentinaDate(inc.updated_at || inc.created_at)}</div>`
        : `<div style="font-size:12px;color:#B45309;margin-top:2px;">Todavía sin resolver</div>`;
    const nota = inc.nota_interna ? `<div style="font-size:12px;color:#6b7280;margin-top:4px;white-space:pre-wrap;"><strong>Nota:</strong> ${esc(inc.nota_interna)}</div>` : '';

    return `
        <div style="text-align:left;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fff;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
                ${badge}${tipo}
            </div>
            <div style="font-size:14px;font-weight:600;color:#111827;white-space:pre-wrap;">${esc(inc.descripcion || 'Sin descripción')}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">${reportado}</div>
            ${resuelta}
            ${nota}
        </div>
    `;
}

export default function WeWorkMaquinariaPage() {
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState(null);
    const [services, setServices] = useState([]);
    const [machines, setMachines] = useState([]);
    const [relations, setRelations] = useState([]);
    const [incidents, setIncidents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const user = getSessionUser();
        if (!user) { router.push('/login'); return; }
        setCurrentUser(user);
    }, [router]);

    useEffect(() => {
        if (!currentUser) return;
        (async () => {
            setLoading(true);
            try {
                const [svcs, allMachines, allRels, allIncidents] = await Promise.all([
                    fetch('/api/services').then(r => r.json()),
                    fetch('/api/machines').then(r => r.json()),
                    fetch('/api/service-machines').then(r => r.json()),
                    fetch('/api/machine-incidents').then(r => r.json()),
                ]);
                const weworkSvcs = (Array.isArray(svcs) ? svcs : []).filter(s => isWeworkService(s.name));
                setServices(weworkSvcs);
                setMachines(Array.isArray(allMachines) ? allMachines : []);
                setRelations(Array.isArray(allRels) ? allRels : []);
                setIncidents(Array.isArray(allIncidents) ? allIncidents : []);
            } finally {
                setLoading(false);
            }
        })();
    }, [currentUser]);

    const weworkServiceIds = useMemo(() => new Set(services.map(s => Number(s.id))), [services]);

    // Por cada servicio WeWork, sus maquinas con cantidad (> 0).
    const grouped = useMemo(() => {
        const machinesById = new Map(machines.map(m => [m.id, m]));
        return services.map(svc => {
            const items = relations
                .filter(r => Number(r.service_id) === Number(svc.id) && r.quantity > 0)
                .map(r => ({ machine: machinesById.get(r.machine_id), quantity: r.quantity }))
                .filter(x => x.machine)
                .sort((a, b) => (a.machine.nombre || '').localeCompare(b.machine.nombre || ''));
            const total = items.reduce((acc, x) => acc + Number(x.quantity || 0), 0);
            return { service: svc, items, total };
        });
    }, [services, machines, relations]);

    const totalMaquinas = grouped.reduce((acc, g) => acc + g.total, 0);

    // Cuenta de incidencias por maquina EN CADA servicio (clave service|machine).
    // La misma maquina del catalogo puede estar en varios servicios, asi que hay
    // que separar por servicio para no sumar incidencias de otra sucursal.
    const incidentCountByServiceMachine = useMemo(() => {
        const map = new Map();
        for (const inc of incidents) {
            if (!weworkServiceIds.has(Number(inc.service_id))) continue;
            const k = `${Number(inc.service_id)}|${Number(inc.machine_id)}`;
            map.set(k, (map.get(k) || 0) + 1);
        }
        return map;
    }, [incidents, weworkServiceIds]);

    const openIncidencias = async (machine, service) => {
        const { default: Swal } = await import('sweetalert2');
        const list = incidents
            .filter(inc => Number(inc.machine_id) === Number(machine.id) && Number(inc.service_id) === Number(service.id))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        const activas = list.filter(inc => !RESOLVED_STATES.has(inc.estado)).length;
        const resueltas = list.length - activas;

        let html;
        if (list.length === 0) {
            html = `<p style="color:#6b7280;font-size:14px;margin:8px 0 0;">Esta máquina no tuvo incidencias registradas en ${esc(service.name)}. 🎉</p>`;
        } else {
            const resumen = `<div style="font-size:12px;color:#6b7280;margin:0 0 12px;">${list.length} incidencia${list.length !== 1 ? 's' : ''} en total · ${activas} activa${activas !== 1 ? 's' : ''} · ${resueltas} resuelta${resueltas !== 1 ? 's' : ''}</div>`;
            html = resumen + list.map(incidentRowHtml).join('');
        }

        await Swal.fire({
            title: machine.nombre,
            html: `<div style="text-align:left;"><div style="font-size:12px;color:#6b7280;margin-bottom:10px;">${esc(service.name)}</div>${html}</div>`,
            width: 560,
            confirmButtonText: 'Cerrar',
            confirmButtonColor: '#00AEEF',
        });
    };

    return (
        <MainLayout>
            <div className="wework-page">
                <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.4rem' }}>Maquinaria</h1>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: '0 0 1.5rem' }}>
                    Máquinas asignadas a cada servicio WeWork. Tocá una máquina para ver su historial de incidencias.
                </p>

                {loading ? (
                    <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Cargando...</div>
                ) : grouped.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: 'var(--text-muted)' }}>
                        No hay servicios WeWork cargados.
                    </div>
                ) : (
                    <>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            Total: <strong style={{ color: 'var(--text-main)' }}>{totalMaquinas}</strong> {totalMaquinas === 1 ? 'máquina' : 'máquinas'} en {grouped.length} {grouped.length === 1 ? 'servicio' : 'servicios'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {grouped.map(({ service, items, total }) => (
                                <div key={service.id} className="card" style={{ marginBottom: 0, padding: '1rem 1.1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: items.length ? '0.85rem' : 0, flexWrap: 'wrap' }}>
                                        <strong style={{ fontSize: '1.02rem' }}>{service.name}</strong>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--color-muted-surface)', border: '1px solid var(--border-color)', borderRadius: '999px', padding: '0.18rem 0.6rem' }}>
                                            {total} {total === 1 ? 'unidad' : 'unidades'}
                                        </span>
                                    </div>
                                    {items.length === 0 ? (
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>No hay máquinas asignadas a este servicio.</p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
                                            {items.map(({ machine, quantity }, idx) => {
                                                const incCount = incidentCountByServiceMachine.get(`${Number(service.id)}|${Number(machine.id)}`) || 0;
                                                return (
                                                    <button
                                                        key={machine.id}
                                                        type="button"
                                                        onClick={() => openIncidencias(machine, service)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem',
                                                            padding: '0.7rem 0.9rem',
                                                            borderTop: idx === 0 ? 'none' : '1px solid var(--border-color)',
                                                            background: 'transparent', border: 'none', cursor: 'pointer',
                                                            textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit',
                                                        }}
                                                    >
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
                                                            <span style={{ fontWeight: 600, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {machine.nombre}
                                                            </span>
                                                            {incCount > 0 && (
                                                                <span
                                                                    title={`${incCount} incidencia${incCount !== 1 ? 's' : ''} registrada${incCount !== 1 ? 's' : ''}`}
                                                                    style={{ flexShrink: 0, fontSize: '0.68rem', fontWeight: 700, color: '#B45309', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '999px', padding: '0.05rem 0.45rem' }}
                                                                >
                                                                    {incCount} {incCount === 1 ? 'incidencia' : 'incidencias'}
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                                                            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                                                <strong style={{ color: 'var(--text-main)' }}>{quantity}</strong> {quantity === 1 ? 'unidad' : 'unidades'}
                                                            </span>
                                                            <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: 1 }}>›</span>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            <style jsx>{`
                .wework-page {
                    max-width: 760px;
                    margin: 0 auto;
                    padding: 1.25rem 1rem calc(2rem + env(safe-area-inset-bottom));
                }
                @media (min-width: 700px) {
                    .wework-page {
                        padding: 1.75rem 1.25rem 3rem;
                    }
                }
            `}</style>
        </MainLayout>
    );
}
