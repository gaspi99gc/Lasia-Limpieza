const GEOCODING_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

export async function geocodeAddress(address) {
    const trimmedAddress = address?.trim();

    if (!trimmedAddress) {
        throw new Error('La direccion es obligatoria para ubicar el servicio.');
    }

    const searchUrl = new URL(GEOCODING_ENDPOINT);
    searchUrl.searchParams.set('format', 'jsonv2');
    searchUrl.searchParams.set('limit', '1');
    searchUrl.searchParams.set('countrycodes', 'ar');
    searchUrl.searchParams.set('accept-language', 'es');
    searchUrl.searchParams.set('q', trimmedAddress.includes('Argentina') ? trimmedAddress : `${trimmedAddress}, Argentina`);

    const response = await fetch(searchUrl, {
        cache: 'no-store',
        headers: {
            'User-Agent': 'ProyectoSupervisores/1.0',
            'Accept-Language': 'es'
        }
    });

    if (!response.ok) {
        throw new Error('No se pudo consultar el servicio de geocodificacion.');
    }

    const results = await response.json();

    if (!Array.isArray(results) || results.length === 0) {
        return null;
    }

    const bestMatch = results[0];

    return {
        lat: Number(bestMatch.lat),
        lng: Number(bestMatch.lon),
        normalizedAddress: bestMatch.display_name || trimmedAddress
    };
}
