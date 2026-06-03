'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { getSessionUser, saveSession } from '@/lib/session';
import { useCatalog } from '@/lib/CatalogContext';
import { useNearbyServices, formatDistance } from '@/lib/useNearbyServices';

const SERVICE_NEAR_DISTANCE_METERS = 200;

function formatServiceAddress(address) {
    const rawAddress = address?.toString().trim();

    if (!rawAddress) {
        return 'Servicio sin direccion cargada';
    }

    const segments = rawAddress
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean);

    if (segments.length === 0) {
        return 'Servicio sin direccion cargada';
    }

    const streetSegment = segments[0];
    const buenosAiresSegment = segments.find((segment, index) => {
        if (index === 0) return false;
        return segment.toLowerCase().includes('buenos aires');
    });

    if (buenosAiresSegment) {
        return `${streetSegment}, ${buenosAiresSegment}`;
    }

    if (segments.length > 1) {
        return `${streetSegment}, ${segments[1]}`;
    }

    return streetSegment;
}

function getDistanceInMeters(lat1, lng1, lat2, lng2) {
    const earthRadius = 6371e3;
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(deltaPhi / 2) ** 2
        + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadius * c;
}

export default function SupervisorHomePage() {
    const [currentUser, setCurrentUser] = useState(null);
    const { services } = useCatalog();
    const { sortedServices, userLocation, locationLoading, locationPermission, retryLocation } = useNearbyServices(services);
    const [selectedServiceId, setSelectedServiceId] = useState('');
    const [searchText, setSearchText] = useState('');
    const [showResults, setShowResults] = useState(false);
    const [status, setStatus] = useState('afuera');
    const [entryCoordinates, setEntryCoordinates] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef(null);
    const [dropdownPos, setDropdownPos] = useState(null);

    const selectedService = useMemo(() => {
        return services.find((service) => String(service.id) === selectedServiceId) || null;
    }, [selectedServiceId, services]);

    const normalize = (v) => (v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    const filteredServices = useMemo(() => {
        const q = normalize(searchText);
        const pool = q && !selectedServiceId
            ? sortedServices.filter((s) => normalize(s.name).includes(q) || normalize(s.address).includes(q))
            : sortedServices;

        if (!pool.length) return [];

        if (!userLocation) {
            return pool.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        }

        const [nearest, ...rest] = pool;
        return [{ ...nearest, _recommended: true }, ...rest];
    }, [searchText, selectedServiceId, sortedServices, userLocation]);

    // Sync search text when initial status loads (supervisor already checked in)
    useEffect(() => {
        if (selectedServiceId && services.length > 0 && !searchText) {
            const service = services.find((s) => String(s.id) === selectedServiceId);
            if (service) setSearchText(service.name);
        }
    }, [selectedServiceId, services]);

    useEffect(() => {
        let cancelled = false;

        async function loadStatus() {
            try {
                const storedUser = getSessionUser();

                if (!storedUser) {
                    return;
                }

                const resolvedUser = storedUser;

                if (cancelled) return;

                setCurrentUser(resolvedUser);

                const supervisorId = Number(resolvedUser?.id);

                // Acceso rápido sin ID real — mostrar panel vacío
                if (!Number.isFinite(supervisorId) || supervisorId <= 0) {
                    setIsLoading(false);
                    return;
                }

                const response = await fetch(`/api/supervisor-status?supervisor_id=${supervisorId}`);
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(data.error || 'No se pudo obtener el estado actual.');
                }

                if (!cancelled) {
                    setStatus(data.status || 'afuera');
                    setSelectedServiceId(data.current_service_id ? String(data.current_service_id) : '');
                    setEntryCoordinates(
                        Number.isFinite(Number(data.entered_lat)) && Number.isFinite(Number(data.entered_lng))
                            ? { lat: Number(data.entered_lat), lng: Number(data.entered_lng) }
                            : null
                    );
                }

            } catch (loadError) {
                if (!cancelled) {
                    setError(loadError.message || 'No se pudo obtener el estado actual.');
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        loadStatus();

        return () => {
            cancelled = true;
        };
    }, []);


    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;
        const scrollInputIntoView = () => {
            if (!inputRef.current || document.activeElement !== inputRef.current) return;
            const rect = inputRef.current.getBoundingClientRect();
            const vvBottom = vv.offsetTop + vv.height;
            if (rect.bottom > vvBottom - 10) {
                window.scrollBy({ top: rect.bottom - vvBottom + 80, behavior: 'smooth' });
            }
        };
        vv.addEventListener('resize', scrollInputIntoView);
        return () => vv.removeEventListener('resize', scrollInputIntoView);
    }, []);

    useLayoutEffect(() => {
        if (!showResults || !inputRef.current) { setDropdownPos(null); return; }
        const update = () => {
            const rect = inputRef.current?.getBoundingClientRect();
            if (rect) setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
        };
        update();
        const vv = window.visualViewport;
        vv?.addEventListener('resize', update);
        vv?.addEventListener('scroll', update);
        return () => { vv?.removeEventListener('resize', update); vv?.removeEventListener('scroll', update); };
    }, [showResults]);

    const buttonLabel = useMemo(() => {
        if (isLoading) return 'CARGANDO...';
        return status === 'trabajando' ? 'SALIDA' : 'INGRESAR';
    }, [isLoading, status]);

    const getCurrentCoordinates = async () => {
        if (typeof window === 'undefined' || !navigator.geolocation) {
            throw new Error('Tu dispositivo no permite obtener la ubicacion exacta.');
        }

        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (position) => resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                }),
                (geoError) => reject(new Error(geoError.message || 'No se pudo obtener la ubicacion exacta del ingreso.')),
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0,
                }
            );
        });
    };

    const handleToggleStatus = async () => {
        if (!currentUser?.id || currentUser.id <= 0 || isLoading || isSaving) {
            return;
        }
        const { default: Swal } = await import('sweetalert2');

        const nextStatus = status === 'trabajando' ? 'afuera' : 'trabajando';

        if (nextStatus === 'trabajando' && !selectedServiceId) {
            setError('Seleccioná un servicio antes de ingresar.');
            return;
        }

        try {
            setIsSaving(true);
            setError('');

            const ingresoCoordinates = nextStatus === 'trabajando'
                ? await getCurrentCoordinates()
                : null;

            if (
                nextStatus === 'trabajando'
                && ingresoCoordinates
                && Number.isFinite(Number(selectedService?.lat))
                && Number.isFinite(Number(selectedService?.lng))
            ) {
                const distanceMeters = getDistanceInMeters(
                    ingresoCoordinates.lat,
                    ingresoCoordinates.lng,
                    Number(selectedService.lat),
                    Number(selectedService.lng)
                );

                if (distanceMeters > SERVICE_NEAR_DISTANCE_METERS) {
                    await Swal.fire({
                        title: 'No estas en el servicio',
                        text: `Segui igual. La ubicacion de ingreso se registro a ${Math.round(distanceMeters)} metros del servicio seleccionado.`,
                        icon: 'warning',
                        iconColor: '#ef4444',
                        confirmButtonText: 'Entendido',
                        confirmButtonColor: '#ef4444',
                        background: '#ffffff',
                    });
                }
            }

            const payload = JSON.stringify({
                supervisor_id: currentUser.id,
                status: nextStatus,
                service_id: nextStatus === 'trabajando' ? Number(selectedServiceId) : undefined,
                lat: ingresoCoordinates?.lat,
                lng: ingresoCoordinates?.lng,
            });

            // La red de algunas oficinas tiene cortes intermitentes que hacen
            // fallar la fichada con "Timeout expired". Reintentamos en silencio
            // ante fallos de red/servidor (no ante errores de validación 4xx).
            const MAX_ATTEMPTS = 3;
            let response, data, lastNetworkError;
            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    response = await fetch('/api/supervisor-status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: payload,
                    });
                    data = await response.json().catch(() => ({}));
                    // 4xx = error del lado del usuario (validación), no reintentar.
                    if (response.ok || (response.status >= 400 && response.status < 500)) break;
                } catch (networkError) {
                    lastNetworkError = networkError;
                    response = null;
                }
                if (attempt < MAX_ATTEMPTS) {
                    await new Promise(r => setTimeout(r, 1200 * attempt));
                }
            }

            if (!response) {
                throw new Error('No hay conexión estable. Revisá la red e intentá de nuevo.');
            }

            if (!response.ok) {
                throw new Error(data.error || 'No se pudo actualizar el estado.');
            }

            setStatus(data.status || nextStatus);
            const newServiceId = data.current_service_id ? String(data.current_service_id) : '';
            setSelectedServiceId(newServiceId);
            if (!newServiceId) setSearchText('');
            setEntryCoordinates(
                Number.isFinite(Number(data.entered_lat)) && Number.isFinite(Number(data.entered_lng))
                    ? { lat: Number(data.entered_lat), lng: Number(data.entered_lng) }
                    : null
            );
        } catch (saveError) {
            setError(saveError.message || 'No se pudo actualizar el estado.');
        } finally {
            setIsSaving(false);
        }
    };


    return (
        <MainLayout>
            <div className="supervisor-home-view">
                <div className="supervisor-home-panel">
                    <div className="form-group supervisor-home-service-group">
                        <label>Ubicacion</label>
                        {locationLoading && !userLocation && (
                            <div style={{
                                marginBottom: '0.5rem',
                                padding: '0.5rem 0.75rem',
                                borderRadius: 'var(--radius-md)',
                                background: '#f0f9ff',
                                border: '1px solid #bae6fd',
                                color: '#0369a1',
                                fontSize: '0.85rem',
                            }}>
                                Obteniendo ubicación...
                            </div>
                        )}
                        {!locationLoading && !userLocation && locationPermission === 'denied' && (
                            <div style={{
                                marginBottom: '0.5rem',
                                padding: '0.5rem 0.75rem',
                                borderRadius: 'var(--radius-md)',
                                background: '#fef9c3',
                                border: '1px solid #fde047',
                                color: '#854d0e',
                                fontSize: '0.85rem',
                            }}>
                                📍 GPS bloqueado. Para activarlo, tocá el candado o el ícono de ubicación en la barra de tu navegador y permitir el acceso.
                            </div>
                        )}
                        {!locationLoading && !userLocation && locationPermission === 'prompt' && (
                            <div style={{
                                marginBottom: '0.5rem',
                                padding: '0.75rem',
                                borderRadius: 'var(--radius-md)',
                                background: '#f0f9ff',
                                border: '1px solid #bae6fd',
                                color: '#0369a1',
                                fontSize: '0.85rem',
                            }}>
                                <div style={{ marginBottom: '0.5rem', fontWeight: 600 }}>📍 Necesitamos tu ubicación</div>
                                <div style={{ marginBottom: '0.75rem' }}>Activá el GPS para que el sistema te muestre el servicio más cercano automáticamente.</div>
                                <button
                                    type="button"
                                    onClick={retryLocation}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        borderRadius: 'var(--radius-md)',
                                        border: 'none',
                                        background: '#0369a1',
                                        color: '#fff',
                                        fontSize: '0.9rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Activar GPS
                                </button>
                            </div>
                        )}
                        <div style={{ position: 'relative' }}>
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder={
                                    isLoading ? 'Cargando servicios...'
                                    : services.length === 0 ? 'No hay servicios cargados'
                                    : 'Buscar servicio...'
                                }
                                value={searchText}
                                onChange={(e) => {
                                    setSearchText(e.target.value);
                                    setSelectedServiceId('');
                                    setShowResults(true);
                                }}
                                onFocus={() => {
                                    if (!selectedServiceId) setShowResults(true);
                                    setTimeout(() => {
                                        if (!inputRef.current) return;
                                        const vv = window.visualViewport;
                                        const rect = inputRef.current.getBoundingClientRect();
                                        const vvBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
                                        if (rect.bottom > vvBottom - 10) {
                                            window.scrollBy({ top: rect.bottom - vvBottom + 80, behavior: 'smooth' });
                                        }
                                    }, 350);
                                }}
                                onBlur={() => setTimeout(() => setShowResults(false), 150)}
                                disabled={isLoading || isSaving || status === 'trabajando' || services.length === 0}
                                autoComplete="off"
                                style={{
                                    width: '100%',
                                    padding: '0.75rem 2.5rem 0.75rem 1rem',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--color-surface)',
                                    fontSize: '1rem',
                                    color: 'var(--text-main)',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                }}
                            />
                            {searchText && !isLoading && !isSaving && status !== 'trabajando' && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchText('');
                                        setSelectedServiceId('');
                                        setShowResults(false);
                                    }}
                                    style={{
                                        position: 'absolute', right: '0.75rem', top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: 'var(--text-muted)', fontSize: '1.1rem',
                                        lineHeight: 1, padding: '0.1rem 0.2rem',
                                        display: 'flex', alignItems: 'center',
                                    }}
                                    tabIndex={-1}
                                    aria-label="Limpiar"
                                >×</button>
                            )}
                            {showResults && !selectedServiceId && filteredServices.length > 0 && dropdownPos && (
                                <div style={{
                                    position: 'fixed',
                                    top: dropdownPos.top,
                                    left: dropdownPos.left,
                                    width: dropdownPos.width,
                                    zIndex: 9999,
                                    background: 'var(--color-surface)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 'var(--radius-md)',
                                    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                                    maxHeight: '220px', overflowY: 'auto',
                                }}>
                                    {filteredServices.map((service) => (
                                        <button
                                            key={service.id}
                                            type="button"
                                            onMouseDown={() => {
                                                setSelectedServiceId(String(service.id));
                                                setSearchText(service.name);
                                                setShowResults(false);
                                            }}
                                            style={{
                                                display: 'block', width: '100%', textAlign: 'left',
                                                padding: '0.75rem 1rem', background: service._recommended ? 'var(--color-primary-light, #f0f7ff)' : 'none', border: 'none',
                                                borderBottom: '1px solid var(--border-color)',
                                                cursor: 'pointer', color: 'var(--text-main)',
                                            }}
                                        >
                                            {service._recommended && (
                                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.15rem' }}>
                                                    Recomendado
                                                </div>
                                            )}
                                            <div style={{ fontWeight: 600 }}>{service.name}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>

                    <button
                        type="button"
                        className={`btn supervisor-home-button ${status === 'trabajando' ? 'supervisor-home-button-active' : 'btn-primary'}`}
                        onClick={handleToggleStatus}
                        disabled={isLoading || isSaving || !currentUser?.id || currentUser.id <= 0}
                    >
                        {isSaving ? 'GUARDANDO...' : buttonLabel}
                    </button>

                    {!error ? (
                        <>
                            <p className="supervisor-home-status">
                                Estado actual: <strong>{status === 'trabajando' ? 'trabajando' : 'afuera'}</strong>
                                {status === 'trabajando' && selectedService ? ` en ${selectedService.name}` : ''}
                            </p>
                        </>
                    ) : (
                        <p className="supervisor-home-error">{error}</p>
                    )}


                </div>

                {currentUser?.id && <MisFichadasCard supervisorId={currentUser.id} />}
            </div>
        </MainLayout>
    );
}

function todayARStr() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

function addDaysAR(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function fmtYMD(ymd) {
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
}

function MisFichadasCard({ supervisorId }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const today = todayARStr();
    const dateFrom = addDaysAR(today, -6);
    const dateTo = today;

    useEffect(() => {
        if (!supervisorId) return;
        let cancelled = false;
        setLoading(true);
        setError('');
        setData(null);
        fetch(`/api/reports/weekly-json?supervisor_id=${supervisorId}&date_from=${dateFrom}&date_to=${dateTo}`)
            .then(async r => {
                if (!r.ok) {
                    const err = await r.json().catch(() => ({}));
                    throw new Error(err.error || `Error del servidor (${r.status})`);
                }
                return r.json();
            })
            .then(d => { if (!cancelled) setData(d); })
            .catch(e => { if (!cancelled) setError(e.message || 'No se pudieron cargar las fichadas.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [supervisorId, dateFrom, dateTo]);

    const openDayDetail = async (day) => {
        if (!day.visitas.length) return;
        const { default: Swal } = await import('sweetalert2');
        const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const filas = day.visitas.map(v => `
            <li class="swal-fichada-visit">
                <div class="swal-fichada-visit-main">
                    <strong>${esc(v.service_name)}</strong>
                    <span>${esc(v.ingresoHora)} → ${esc(v.egresoHora || '—')}</span>
                </div>
                <div class="swal-fichada-visit-meta">
                    ${v.duracion ? `<span class="swal-fichada-dur">${esc(v.duracion)}</span>` : ''}
                    ${v.ongoing ? `<span class="swal-fichada-badge is-ongoing">⏵ En curso</span>` : ''}
                    ${v.lejos ? `<span class="swal-fichada-badge is-lejos">⚠ Lejos${v.distanciaMetros ? ` (${v.distanciaMetros} m)` : ''}</span>` : ''}
                </div>
            </li>
        `).join('');
        await Swal.fire({
            title: day.label,
            html: `<ul class="swal-fichada-visits">${filas}</ul>`,
            width: 480,
            showConfirmButton: true,
            confirmButtonText: 'Cerrar',
            confirmButtonColor: '#00AEEF',
        });
    };

    return (
        <div className="mis-fichadas-card">
            <div className="mis-fichadas-head">
                <div>
                    <h3>Mis fichadas</h3>
                    <p className="mis-fichadas-subtitle">{fmtYMD(dateFrom)} al {fmtYMD(dateTo)}</p>
                </div>
            </div>

            {loading && <p className="mis-fichadas-empty">Cargando…</p>}
            {error && <p className="mis-fichadas-error">{error}</p>}

            {data && !loading && !error && (
                <>
                    <div className="mis-fichadas-summary">
                        <div>
                            <span>Total</span>
                            <strong>{data.totales.hsTotal}</strong>
                        </div>
                        <div>
                            <span>Días</span>
                            <strong>{data.totales.diasConFichada}</strong>
                        </div>
                        <div>
                            <span>Servicios</span>
                            <strong>{data.totales.serviciosVisitados}</strong>
                        </div>
                    </div>

                    <ul className="mis-fichadas-day-list">
                        {data.days.map(d => {
                            const cantidad = d.visitas.length;
                            const totalMin = d.visitas.reduce((acc, v) => {
                                if (!v.duracion) return acc;
                                const [hh, mm, ss] = v.duracion.split(':').map(Number);
                                return acc + (hh * 60) + mm + (ss / 60);
                            }, 0);
                            const totalLabel = totalMin > 0
                                ? `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(Math.round(totalMin % 60)).padStart(2, '0')}`
                                : '—';
                            return (
                                <li key={d.date}>
                                    <button
                                        type="button"
                                        className="mis-fichadas-day-row"
                                        onClick={() => openDayDetail(d)}
                                        disabled={cantidad === 0}
                                    >
                                        <span className="mis-fichadas-day-label">{d.label}</span>
                                        <span className="mis-fichadas-day-meta">
                                            {cantidad === 0
                                                ? <span className="mis-fichadas-day-empty">Sin fichadas</span>
                                                : (
                                                    <>
                                                        <span className="mis-fichadas-day-count">{cantidad}</span>
                                                        <span className="mis-fichadas-day-total">{totalLabel}</span>
                                                        <span className="mis-fichadas-day-arrow">›</span>
                                                    </>
                                                )}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </div>
    );
}
