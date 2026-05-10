'use client';

import { useState, useEffect, useMemo } from 'react';

function getDistanceInMeters(lat1, lng1, lat2, lng2) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(meters) {
    if (meters === Infinity || meters == null) return null;
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
}

export function useNearbyServices(services) {
    const [userLocation, setUserLocation] = useState(null);
    const [locationLoading, setLocationLoading] = useState(true);

    useEffect(() => {
        if (typeof window === 'undefined' || !navigator.geolocation) {
            setLocationLoading(false);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            pos => {
                setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setLocationLoading(false);
            },
            () => setLocationLoading(false),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    }, []);

    const sortedServices = useMemo(() => {
        if (!services.length) return services;
        return [...services]
            .map(s => ({
                ...s,
                _distance: (userLocation && s.lat && s.lng)
                    ? getDistanceInMeters(userLocation.lat, userLocation.lng, Number(s.lat), Number(s.lng))
                    : Infinity,
            }))
            .sort((a, b) => a._distance - b._distance);
    }, [services, userLocation]);

    return { sortedServices, userLocation, locationLoading };
}
