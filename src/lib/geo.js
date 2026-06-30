// Shared geo helpers. Pure (no 'use client') so it works on server and client.
// Keep this the single source of truth for the "checked in far" threshold.

export const SERVICE_NEAR_DISTANCE_METERS = 450;

// Bounding box del AMBA (Área Metropolitana de Buenos Aires). Única fuente de
// verdad: la usan el geocoding, el alta de servicios y el import por Excel.
export const AMBA_BOUNDS = {
    west: -59.40,
    south: -35.35,
    east: -57.50,
    north: -34.10,
};

export function isWithinAmba(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng)
        && lat >= AMBA_BOUNDS.south && lat <= AMBA_BOUNDS.north
        && lng >= AMBA_BOUNDS.west && lng <= AMBA_BOUNDS.east;
}

export function getDistanceInMeters(lat1, lng1, lat2, lng2) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Distance between a check-in and its service.
// Returns { meters, far } or null when any coordinate is missing/invalid.
export function checkinDistance(eventLat, eventLng, serviceLat, serviceLng) {
    const eLat = Number(eventLat);
    const eLng = Number(eventLng);
    const sLat = Number(serviceLat);
    const sLng = Number(serviceLng);
    if (![eLat, eLng, sLat, sLng].every(Number.isFinite)) return null;
    if (eLat === 0 && eLng === 0) return null; // unset coords sentinel
    const meters = getDistanceInMeters(eLat, eLng, sLat, sLng);
    return { meters, far: meters > SERVICE_NEAR_DISTANCE_METERS };
}
