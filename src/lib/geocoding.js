const ARCGIS_GEOCODING_ENDPOINT = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';

const AMBA_BOUNDS = {
    west: -59.40,
    south: -35.35,
    east: -57.50,
    north: -34.10,
};

const EXACT_ADDRESS_TYPES = new Set(['PointAddress', 'StreetAddress', 'Subaddress']);

export function normalizeAddressInput(address) {
    return address?.trim().replace(/\s+/g, ' ') || '';
}

function hasStreetNumber(address) {
    return /\d/.test(address);
}

function isWithinAmba(lat, lng) {
    return lat >= AMBA_BOUNDS.south
        && lat <= AMBA_BOUNDS.north
        && lng >= AMBA_BOUNDS.west
        && lng <= AMBA_BOUNDS.east;
}

function toCandidateId(candidate) {
    return [
        candidate.address,
        candidate.lat.toFixed(6),
        candidate.lng.toFixed(6),
        candidate.type,
    ].join('|');
}

function mapCandidate(rawCandidate) {
    const lat = Number(rawCandidate?.location?.y);
    const lng = Number(rawCandidate?.location?.x);
    const address = rawCandidate?.attributes?.Match_addr || rawCandidate?.address || '';
    const type = rawCandidate?.attributes?.Addr_type || 'Unknown';
    const city = rawCandidate?.attributes?.City || '';
    const region = rawCandidate?.attributes?.Region || '';
    const score = Number(rawCandidate?.score || 0);

    const candidate = {
        address,
        lat,
        lng,
        type,
        city,
        region,
        score,
    };

    return {
        id: toCandidateId(candidate),
        ...candidate,
    };
}

function isPreciseAmbaCandidate(candidate) {
    return Number.isFinite(candidate.lat)
        && Number.isFinite(candidate.lng)
        && EXACT_ADDRESS_TYPES.has(candidate.type)
        && candidate.score >= 85
        && hasStreetNumber(candidate.address)
        && isWithinAmba(candidate.lat, candidate.lng);
}

function buildSearchUrl(address) {
    const url = new URL(ARCGIS_GEOCODING_ENDPOINT);
    url.searchParams.set('SingleLine', address);
    url.searchParams.set('f', 'pjson');
    url.searchParams.set('countryCode', 'ARG');
    url.searchParams.set('searchExtent', `${AMBA_BOUNDS.west},${AMBA_BOUNDS.south},${AMBA_BOUNDS.east},${AMBA_BOUNDS.north}`);
    url.searchParams.set('locationType', 'rooftop');
    url.searchParams.set('outFields', 'Match_addr,Addr_type,City,Region');
    url.searchParams.set('maxLocations', '5');
    return url;
}

export async function searchAmbaAddresses(address) {
    const normalizedAddress = normalizeAddressInput(address);

    if (!normalizedAddress) {
        throw new Error('La direccion es obligatoria.');
    }

    if (!hasStreetNumber(normalizedAddress)) {
        throw new Error('Ingresá calle y altura para validar una direccion exacta dentro de AMBA.');
    }

    const response = await fetch(buildSearchUrl(normalizedAddress), {
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error('No se pudo consultar el servicio de direcciones.');
    }

    const data = await response.json();
    const rawCandidates = Array.isArray(data?.candidates) ? data.candidates : [];

    const candidates = rawCandidates
        .map(mapCandidate)
        .filter(isPreciseAmbaCandidate)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    return {
        query: normalizedAddress,
        candidates,
    };
}

export async function resolveAmbaAddress(address, options = {}) {
    const { candidateId, fallbackLat, fallbackLng } = options;
    const { candidates } = await searchAmbaAddresses(address);
    const lat = Number(fallbackLat);
    const lng = Number(fallbackLng);

    if (candidates.length === 0) {
        if (Number.isFinite(lat) && Number.isFinite(lng) && isWithinAmba(lat, lng)) {
            return {
                id: '',
                address: normalizeAddressInput(address),
                lat,
                lng,
                type: 'Legacy',
                city: '',
                region: '',
                score: 0,
            };
        }

        return null;
    }

    if (candidateId) {
        const selectedCandidate = candidates.find(candidate => candidate.id === candidateId);

        if (!selectedCandidate) {
            throw new Error('La direccion cambio o la coincidencia ya no es valida. Volve a validarla dentro de AMBA.');
        }

        return selectedCandidate;
    }

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const matchedByCoordinates = candidates.find(candidate => (
            Math.abs(candidate.lat - lat) < 0.0002 && Math.abs(candidate.lng - lng) < 0.0002
        ));

        if (matchedByCoordinates) {
            return matchedByCoordinates;
        }
    }

    if (candidates.length === 1) {
        return candidates[0];
    }

    throw new Error('Validá la direccion y elegí una coincidencia de AMBA antes de guardar el servicio.');
}
