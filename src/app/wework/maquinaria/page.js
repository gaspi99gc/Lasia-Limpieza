'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { getSessionUser } from '@/lib/session';
import { isWeworkService } from '@/lib/wework';

export default function WeWorkMaquinariaPage() {
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState(null);
    const [services, setServices] = useState([]);
    const [machines, setMachines] = useState([]);
    const [relations, setRelations] = useState([]);
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
                const [svcs, allMachines, allRels] = await Promise.all([
                    fetch('/api/services').then(r => r.json()),
                    fetch('/api/machines').then(r => r.json()),
                    fetch('/api/service-machines').then(r => r.json()),
                ]);
                const weworkSvcs = (Array.isArray(svcs) ? svcs : []).filter(s => isWeworkService(s.name));
                setServices(weworkSvcs);
                setMachines(Array.isArray(allMachines) ? allMachines : []);
                setRelations(Array.isArray(allRels) ? allRels : []);
            } finally {
                setLoading(false);
            }
        })();
    }, [currentUser]);

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

    return (
        <MainLayout>
            <div className="wework-page">
                <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.4rem' }}>Maquinaria</h1>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: '0 0 1.5rem' }}>
                    Máquinas asignadas a cada servicio WeWork.
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
                                            {items.map(({ machine, quantity }, idx) => (
                                                <div
                                                    key={machine.id}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem',
                                                        padding: '0.7rem 0.9rem',
                                                        borderTop: idx === 0 ? 'none' : '1px solid var(--border-color)',
                                                    }}
                                                >
                                                    <span style={{ fontWeight: 600, fontSize: '0.92rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {machine.nombre}
                                                    </span>
                                                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                                                        <strong style={{ color: 'var(--text-main)' }}>{quantity}</strong> {quantity === 1 ? 'unidad' : 'unidades'}
                                                    </span>
                                                </div>
                                            ))}
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
