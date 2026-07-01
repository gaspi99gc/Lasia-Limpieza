'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/lib/ThemeContext';

function formatShortAddress(address) {
    if (!address) return '';
    const parts = address.split(',').map(p => p.trim());
    if (parts.length <= 1) return address;

    const street = parts[0];
    const isCaba = address.toLowerCase().includes('ciudad autónoma de buenos aires') || address.toLowerCase().includes('caba');
    
    let locality = '';
    if (isCaba) {
        const p1Lower = parts[1]?.toLowerCase();
        if (p1Lower === 'buenos aires') {
            locality = 'CABA';
        } else {
            locality = parts[1];
        }
    } else {
        locality = parts[1];
    }
    
    if (locality && locality.match(/^[a-zA-Z]?\d{4}/)) {
        locality = '';
    }
    
    return locality ? `${street}, ${locality}` : street;
}

export default function ServicesMap({ services = [], onSelectService = null, height = '400px' }) {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markerGroupRef = useRef(null);
    const hasFittedBoundsRef = useRef(false);
    const { themeMode } = useTheme();
    const [leafletLoaded, setLeafletLoaded] = useState(false);

    // Keep the callback ref updated so standard re-renders don't trigger re-creation
    const onSelectServiceRef = useRef(onSelectService);
    useEffect(() => {
        onSelectServiceRef.current = onSelectService;
    }, [onSelectService]);

    // 1. Initialize Map ONCE on mount
    useEffect(() => {
        let isMounted = true;
        let L;

        const initMap = async () => {
            if (typeof window === 'undefined') return;

            // Dynamically import Leaflet and its CSS on client side
            L = await import('leaflet');
            await import('leaflet/dist/leaflet.css');

            if (!isMounted) return;
            setLeafletLoaded(true);

            if (mapInstanceRef.current) return; // Guard against double initialization

            if (!mapContainerRef.current) return;

            // Center of AMBA: approximately -34.61, -58.45
            const map = L.map(mapContainerRef.current, {
                zoomControl: true,
                scrollWheelZoom: true,
            }).setView([-34.61, -58.45], 10);

            mapInstanceRef.current = map;

            // OpenStreetMap standard tiles
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19,
            }).addTo(map);

            // Create LayerGroup for markers
            markerGroupRef.current = L.layerGroup().addTo(map);

            // Listen to zoom changes to show/hide labels dynamically via CSS class
            const handleZoom = () => {
                const zoom = map.getZoom();
                if (zoom >= 15) {
                    mapContainerRef.current?.classList.add('show-marker-labels');
                } else {
                    mapContainerRef.current?.classList.remove('show-marker-labels');
                }
            };

            map.on('zoomend', handleZoom);
            handleZoom();
        };

        initMap();

        return () => {
            isMounted = false;
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
                markerGroupRef.current = null;
                hasFittedBoundsRef.current = false;
            }
        };
    }, []);

    // 2. Update markers and fit bounds when services are loaded
    useEffect(() => {
        if (!leafletLoaded || !mapInstanceRef.current || !markerGroupRef.current) return;

        // Use dynamically imported L which is already available on window or locally
        import('leaflet').then((L) => {
            // Clear existing markers from group
            markerGroupRef.current.clearLayers();

            const validServices = services.filter(s => s.lat && s.lng);

            // Create custom brand SVG pin
            const createCustomIcon = (name) => {
                return L.divIcon({
                    className: 'custom-map-pin',
                    html: `
                        <div class="custom-pin-wrapper" style="position: relative; width: 30px; height: 42px;">
                            <svg width="30" height="42" viewBox="0 0 30 42" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 3px 5px rgba(0,0,0,0.35));">
                                <path d="M15 0C6.71573 0 0 6.71573 0 15C0 26.25 15 42 15 42C15 42 30 26.25 30 15C30 6.71573 23.2843 0 15 0ZM15 20.25C12.1005 20.25 9.75 17.8995 9.75 15C9.75 12.1005 12.1005 9.75 15 9.75C17.8995 9.75 20.25 12.1005 20.25 15C20.25 17.8995 17.8995 20.25 15 20.25Z" fill="#00AEEF"/>
                            </svg>
                        </div>
                    `,
                    iconSize: [30, 42],
                    iconAnchor: [15, 42],
                    popupAnchor: [0, -42],
                });
            };

            const markers = [];

            validServices.forEach(service => {
                const marker = L.marker([Number(service.lat), Number(service.lng)], {
                    icon: createCustomIcon(service.name)
                }).addTo(markerGroupRef.current);

                // Bind tooltip to show label directly when zoomed in
                marker.bindTooltip(service.name, {
                    permanent: true,
                    direction: 'bottom',
                    className: 'custom-pin-tooltip',
                    offset: [0, 5]
                });

                markers.push(marker);

                // Build custom popup container and bind events dynamically
                marker.bindPopup(() => {
                    const popupEl = document.createElement('div');
                    popupEl.style.minWidth = '200px';
                    popupEl.style.padding = '0.2rem';
                    popupEl.style.fontFamily = 'inherit';

                    popupEl.innerHTML = `
                        <div class="map-popup-content" style="display: flex; flexDirection: column; gap: 0.5rem;">
                            <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--text-main); line-height: 1.3;">${service.name}</h4>
                            <p style="margin: 0.25rem 0 0; font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">📍 ${formatShortAddress(service.address)}</p>
                            ${service.encargado_nombre ? `
                                <div style="margin-top: 0.35rem; padding-top: 0.35rem; border-top: 1px solid var(--border-color); font-size: 0.78rem; color: var(--text-muted);">
                                    <strong>Encargado:</strong> ${service.encargado_nombre}
                                    ${service.encargado_telefono ? `<br/>📞 ${service.encargado_telefono}` : ''}
                                </div>
                            ` : ''}
                            ${onSelectServiceRef.current ? `
                                <button class="btn btn-primary map-popup-btn" style="margin-top: 0.5rem; width: 100%; font-size: 0.75rem; padding: 0.35rem 0.7rem; border-radius: var(--radius-sm, 4px); font-weight: 600; cursor: pointer;">
                                    Ver Ficha Completa
                                </button>
                            ` : ''}
                        </div>
                    `;

                    if (onSelectServiceRef.current) {
                        const btn = popupEl.querySelector('.map-popup-btn');
                        if (btn) {
                            btn.addEventListener('click', () => {
                                onSelectServiceRef.current(service.id);
                            });
                        }
                    }

                    return popupEl;
                });
            });

            // Only fit map bounds ONCE when markers load for the first time
            if (markers.length > 0 && !hasFittedBoundsRef.current) {
                const group = L.featureGroup(markers);
                mapInstanceRef.current.fitBounds(group.getBounds().pad(0.12));
                hasFittedBoundsRef.current = true;
            }
        });
    }, [leafletLoaded, services]);

    return (
        <div className={`map-wrapper-card ${themeMode === 'dark' ? 'dark-theme-map' : ''}`} style={{ position: 'relative', width: '100%', height }}>
            <div
                ref={mapContainerRef}
                style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid var(--border-color, #e2e8f0)',
                    backgroundColor: themeMode === 'dark' ? '#1e293b' : '#f8fafc',
                    zIndex: 1,
                }}
            />
            {!leafletLoaded && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: themeMode === 'dark' ? '#0f172a' : '#ffffff',
                    borderRadius: 'var(--radius-md, 8px)',
                    color: 'var(--text-muted)',
                    fontSize: '0.9rem',
                    zIndex: 10
                }}>
                    Cargando mapa interactivo...
                </div>
            )}
        </div>
    );
}
