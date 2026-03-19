'use client';

import { useState, useEffect, useCallback } from 'react';
import MainLayout from '@/components/MainLayout';
import { useRouter } from 'next/navigation';

// Haversine formula
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    if (lat1 === lat2 && lon1 === lon2) return 0;
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getZone(distance) {
    if (distance <= 200) return 'green';
    if (distance <= 500) return 'yellow';
    return 'red';
}

const ZONE_CONFIG = {
    green: { label: 'En zona', color: '#10B981', bg: '#DCFCE7', icon: '🟢', emoji: '✅' },
    yellow: { label: 'Zona cercana', color: '#F59E0B', bg: '#FEF3C7', icon: '🟡', emoji: '⚠️' },
    red: { label: 'Fuera de zona', color: '#EF4444', bg: '#FEE2E2', icon: '🔴', emoji: '❌' },
};

export default function PresentismoPage() {
    const [user, setUser] = useState(null);
    const [route, setRoute] = useState([]); // recorrido asignado
    const [activeCheckin, setActiveCheckin] = useState(null); // fichaje activo
    const [todayRecords, setTodayRecords] = useState([]); // fichajes del día
    const [currentPos, setCurrentPos] = useState(null); // GPS actual
    const [gpsLoading, setGpsLoading] = useState(false);
    const [fichadaLoading, setFichadaLoading] = useState(false);
    const [message, setMessage] = useState(null); // { text, type: 'success'|'error'|'info' }
    const router = useRouter();

    // Load user
    useEffect(() => {
        const u = localStorage.getItem('currentUser');
        if (!u) { router.push('/login'); return; }
        setUser(JSON.parse(u));
    }, [router]);

    // Load route, active check-in, and today's records
    const loadData = useCallback(async () => {
        if (!user) return;
        try {
            const [routeRes, activeRes, todayRes] = await Promise.all([
                fetch(`/api/supervisor-routes?supervisor_id=${user.id}`),
                fetch(`/api/attendance?supervisor_id=${user.id}&active=true`),
                fetch(`/api/attendance?supervisor_id=${user.id}&today=true`),
            ]);
            if (routeRes.ok) setRoute(await routeRes.json());
            if (activeRes.ok) {
                const activeData = await activeRes.json();
                setActiveCheckin(activeData.length > 0 ? activeData[0] : null);
            }
            if (todayRes.ok) setTodayRecords(await todayRes.json());
        } catch (err) {
            console.error('Error loading data:', err);
        }
    }, [user]);

    useEffect(() => { loadData(); }, [loadData]);

    // Get current GPS position
    const refreshGPS = useCallback(() => {
        if (!navigator.geolocation) {
            setMessage({ text: 'Tu navegador no soporta geolocalización.', type: 'error' });
            return;
        }
        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setGpsLoading(false);
            },
            (err) => {
                setMessage({ text: `Error GPS: ${err.message}`, type: 'error' });
                setGpsLoading(false);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    }, []);

    // Auto-refresh GPS on load
    useEffect(() => { if (user) refreshGPS(); }, [user, refreshGPS]);

    // Handle fichada
    const handleFichada = async (serviceId, type) => {
        if (!currentPos) {
            setMessage({ text: 'Esperando ubicación GPS...', type: 'error' });
            refreshGPS();
            return;
        }

        setFichadaLoading(true);
        setMessage(null);

        try {
            const res = await fetch('/api/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supervisor_id: user.id,
                    service_id: serviceId,
                    type,
                    lat: currentPos.lat,
                    lng: currentPos.lng,
                }),
            });

            const data = await res.json();

            if (res.ok) {
                const zoneInfo = ZONE_CONFIG[data.zone || 'red'];
                setMessage({
                    text: `${type === 'check-in' ? 'Entrada' : 'Salida'} registrada ${zoneInfo.emoji} ${zoneInfo.label} (${Math.round(data.distance_meters || 0)}m)`,
                    type: 'success',
                });
                await loadData();
            } else {
                setMessage({ text: data.error || 'Error al registrar fichada.', type: 'error' });
            }
        } catch (err) {
            setMessage({ text: 'Error de red al registrar fichada.', type: 'error' });
        } finally {
            setFichadaLoading(false);
        }
    };

    // Calculate zone for a service
    const getServiceZone = (service) => {
        if (!currentPos || !service.lat || !service.lng) return null;
        const dist = getDistanceInMeters(currentPos.lat, currentPos.lng, service.lat, service.lng);
        return { zone: getZone(dist), distance: dist };
    };

    // Check if a service has been completed today (has both check-in and check-out)
    const isServiceCompleted = (serviceId) => {
        const checkins = todayRecords.filter(r => r.service_id === serviceId && r.type === 'check-in');
        const checkouts = todayRecords.filter(r => r.service_id === serviceId && r.type === 'check-out');
        return checkins.length > 0 && checkouts.length >= checkins.length;
    };

    // Check if service has an active check-in
    const isServiceActive = (serviceId) => {
        return activeCheckin && activeCheckin.service_id === serviceId;
    };

    if (!user) return null;

    return (
        <MainLayout>
            <div className="fichaje-view panel-max-narrow">
                {/* Header */}
                <header style={{ marginBottom: '2rem' }}>
                    <div className="presentismo-header-top">
                        <div>
                            <h1 style={{ fontSize: '1.8rem', marginBottom: '0.25rem' }}>📍 Fichaje GPS</h1>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                                Recorrido de servicios del día
                            </p>
                        </div>
                        <button
                            className="btn btn-secondary"
                            onClick={refreshGPS}
                            disabled={gpsLoading}
                            style={{ gap: '0.4rem' }}
                        >
                            {gpsLoading ? '⏳' : '🛰️'} {gpsLoading ? 'Buscando...' : 'Actualizar GPS'}
                        </button>
                    </div>

                    {/* GPS Status Bar */}
                    <div style={{
                        marginTop: '1rem',
                        padding: '0.75rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        background: currentPos ? '#DCFCE7' : '#FEF3C7',
                        color: currentPos ? '#166534' : '#92400E',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                    }}>
                        <span style={{ fontSize: '1.1rem' }}>{currentPos ? '🛰️' : '📡'}</span>
                        {currentPos
                            ? `GPS activo: ${currentPos.lat.toFixed(5)}, ${currentPos.lng.toFixed(5)}`
                            : 'Esperando señal GPS...'}
                    </div>
                </header>

                {/* Message banner */}
                {message && (
                    <div style={{
                        padding: '1rem',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: '1.5rem',
                        background: message.type === 'success' ? '#DCFCE7' : message.type === 'error' ? '#FEE2E2' : '#E2E8F0',
                        color: message.type === 'success' ? '#166534' : message.type === 'error' ? '#991B1B' : '#334155',
                        fontWeight: 500,
                        textAlign: 'center',
                        animation: 'slideUp 0.3s ease-out',
                    }}>
                        {message.text}
                    </div>
                )}

                {/* Active Check-in Alert */}
                {activeCheckin && (
                    <div className="active-checkin-alert" style={{
                        padding: '1.25rem',
                        borderRadius: 'var(--radius-md)',
                        background: 'linear-gradient(135deg, #0096C7, #00B4D8)',
                        color: '#fff',
                        marginBottom: '1.5rem',
                        boxShadow: '0 4px 15px rgba(0,150,199,0.3)',
                    }}>
                        <div className="active-checkin-card">
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem' }}>
                                    ⏱️ Fichaje activo
                                </div>
                                <div style={{ opacity: 0.9, fontSize: '0.9rem' }}>
                                    {activeCheckin.service_name} — Desde {new Date(activeCheckin.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                            <button
                                className="btn"
                                style={{
                                    background: 'rgba(255,255,255,0.2)',
                                    color: '#fff',
                                    border: '1px solid rgba(255,255,255,0.4)',
                                    backdropFilter: 'blur(4px)',
                                    fontWeight: 600,
                                }}
                                onClick={() => handleFichada(activeCheckin.service_id, 'check-out')}
                                disabled={fichadaLoading}
                            >
                                🔴 Fichar Salida
                            </button>
                        </div>
                    </div>
                )}

                {/* Route / Recorrido */}
                {route.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
                        <h3 style={{ marginBottom: '0.5rem' }}>Sin recorrido asignado</h3>
                        <p style={{ color: 'var(--text-muted)' }}>
                            Contactá al administrador para que te asigne un recorrido de servicios.
                        </p>
                    </div>
                ) : (
                    <div className="route-timeline">
                        {route.map((svc, idx) => {
                            const completed = isServiceCompleted(svc.service_id);
                            const isActive = isServiceActive(svc.service_id);
                            const zoneInfo = getServiceZone(svc);
                            const zoneConfig = zoneInfo ? ZONE_CONFIG[zoneInfo.zone] : null;
                            const canCheckIn = !activeCheckin && !completed;
                            const canCheckOut = isActive;

                            return (
                                <div key={svc.id} style={{
                                    marginBottom: idx < route.length - 1 ? '0' : '0',
                                }} className="timeline-row">
                                    {/* Timeline line */}
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        minWidth: '40px',
                                    }}>
                                        <div style={{
                                            width: '36px',
                                            height: '36px',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '0.85rem',
                                            fontWeight: 700,
                                            background: completed ? 'var(--success)' : isActive ? 'var(--color-primary)' : '#E2E8F0',
                                            color: completed || isActive ? '#fff' : 'var(--text-muted)',
                                            boxShadow: isActive ? '0 0 0 4px rgba(0,180,216,0.2)' : 'none',
                                            transition: 'all 0.3s ease',
                                        }}>
                                            {completed ? '✓' : idx + 1}
                                        </div>
                                        {idx < route.length - 1 && (
                                            <div style={{
                                                width: '2px',
                                                flex: 1,
                                                minHeight: '20px',
                                                background: completed ? 'var(--success)' : '#E2E8F0',
                                                transition: 'background 0.3s ease',
                                            }} />
                                        )}
                                    </div>

                                    {/* Service Card */}
                                    <div className="timeline-card" style={{
                                        background: 'var(--color-surface)',
                                        borderRadius: 'var(--radius-md)',
                                        padding: '1.25rem',
                                        marginBottom: '1rem',
                                        border: isActive ? '2px solid var(--color-primary)' : '1px solid var(--border-color)',
                                        boxShadow: isActive ? '0 4px 15px rgba(0,180,216,0.15)' : 'var(--shadow-sm)',
                                        opacity: completed ? 0.65 : 1,
                                        transition: 'all 0.3s ease',
                                    }}>
                                        <div className="timeline-card-header">
                                            <div>
                                                <h3 style={{ fontSize: '1.05rem', marginBottom: '0.2rem' }}>
                                                    {svc.service_name}
                                                </h3>
                                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                    {svc.service_address || 'Sin dirección'}
                                                </p>
                                            </div>
                                            {completed && (
                                                <span className="badge badge-success">Completado</span>
                                            )}
                                            {isActive && (
                                                <span className="badge" style={{ background: '#CAF0F8', color: '#0096C7' }}>En curso</span>
                                            )}
                                        </div>

                                        {/* Zone indicator */}
                                        {zoneConfig && !completed && (
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                padding: '0.5rem 0.75rem',
                                                borderRadius: 'var(--radius-sm)',
                                                background: zoneConfig.bg,
                                                color: zoneConfig.color,
                                                fontSize: '0.85rem',
                                                fontWeight: 600,
                                                marginBottom: '0.75rem',
                                            }}>
                                                <span className={`zone-pulse zone-pulse-${zoneInfo.zone}`} style={{
                                                    width: '10px', height: '10px', borderRadius: '50%',
                                                    background: zoneConfig.color, display: 'inline-block',
                                                }} />
                                                {zoneConfig.icon} {zoneConfig.label} — {Math.round(zoneInfo.distance)}m
                                            </div>
                                        )}

                                        {/* Action buttons */}
                                        {!completed && (
                                            <div className="timeline-actions">
                                                {canCheckIn && (
                                                    <button
                                                        className="btn btn-primary"
                                                        style={{
                                                            flex: 1,
                                                            padding: '0.75rem',
                                                            fontSize: '0.95rem',
                                                            background: 'var(--success)',
                                                            boxShadow: '0 4px 10px rgba(16,185,129,0.25)',
                                                        }}
                                                        onClick={() => handleFichada(svc.service_id, 'check-in')}
                                                        disabled={fichadaLoading}
                                                    >
                                                        🟢 Fichar Entrada
                                                    </button>
                                                )}
                                                {canCheckOut && (
                                                    <button
                                                        className="btn btn-primary"
                                                        style={{
                                                            flex: 1,
                                                            padding: '0.75rem',
                                                            fontSize: '0.95rem',
                                                            background: 'var(--error)',
                                                            boxShadow: '0 4px 10px rgba(239,68,68,0.25)',
                                                        }}
                                                        onClick={() => handleFichada(svc.service_id, 'check-out')}
                                                        disabled={fichadaLoading}
                                                    >
                                                        🔴 Fichar Salida
                                                    </button>
                                                )}
                                                {activeCheckin && !isActive && !completed && (
                                                    <div style={{
                                                        flex: 1,
                                                        padding: '0.75rem',
                                                        textAlign: 'center',
                                                        color: 'var(--text-muted)',
                                                        fontSize: '0.85rem',
                                                        fontStyle: 'italic',
                                                    }}>
                                                        🔒 Fichá salida en {activeCheckin.service_name} primero
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Today's History */}
                {todayRecords.length > 0 && (
                    <div className="card" style={{ marginTop: '2rem', padding: 0 }}>
                        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-color)' }}>
                            <h3 style={{ fontSize: '1rem' }}>📋 Historial de hoy</h3>
                        </div>
                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            {todayRecords.map(record => {
                                const zc = ZONE_CONFIG[record.zone || 'red'];
                                return (
                                    <div key={record.id} style={{
                                        padding: '0.85rem 1.25rem',
                                        borderBottom: '1px solid var(--border-color)',
                                        fontSize: '0.9rem',
                                    }} className="history-row">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <span className={`badge ${record.type === 'check-in' ? 'badge-success' : 'badge-danger'}`}>
                                                {record.type === 'check-in' ? 'Entrada' : 'Salida'}
                                            </span>
                                            <strong>{record.service_name}</strong>
                                        </div>
                                        <div className="history-meta">
                                            <span style={{
                                                padding: '0.2rem 0.5rem',
                                                borderRadius: 'var(--radius-sm)',
                                                background: zc.bg,
                                                color: zc.color,
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                            }}>
                                                {zc.icon} {record.distance_meters != null ? `${Math.round(record.distance_meters)}m` : '—'}
                                            </span>
                                            <span style={{ color: 'var(--text-muted)', minWidth: '50px', textAlign: 'right' }}>
                                                {new Date(record.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </MainLayout>
    );
}
