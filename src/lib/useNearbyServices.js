'use client';

import { useState, useEffect, useRef, useMemo } from 'react';

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
    const [locationPermission, setLocationPermission] = useState('prompt'); // 'prompt' | 'granted' | 'denied'

    const watchIdRef = useRef(null);

    const startWatching = () => {
        if (typeof window === 'undefined' || !navigator.geolocation) {
            setLocationLoading(false);
            setLocationPermission('denied');
            return;
        }
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
        }
        setLocationLoading(true);
        watchIdRef.current = navigator.geolocation.watchPosition(
            pos => {
                setUserLocation({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
                    timestamp: pos.timestamp || Date.now(),
                });
                setLocationPermission('granted');
                setLocationLoading(false);
            },
            () => {
                setLocationPermission('denied');
                setLocationLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const requestLocation = startWatching;

    useEffect(() => {
        if (typeof window === 'undefined') {
            setLocationLoading(false);
            return;
        }
        if (!navigator.permissions) {
            setLocationLoading(false);
            return;
        }
        navigator.permissions.query({ name: 'geolocation' }).then(result => {
            setLocationPermission(result.state);
            if (result.state === 'granted') {
                startWatching();
            } else {
                setLocationLoading(false);
            }
            result.onchange = () => {
                setLocationPermission(result.state);
                if (result.state === 'granted') startWatching();
            };
        });

        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
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

    return { sortedServices, userLocation, locationLoading, locationPermission, retryLocation: requestLocation };
}
