'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const CatalogContext = createContext(null);

// Trae un endpoint del catálogo con reintentos. La causa del bug que dejaba
// pantallas vacías (Servicios, Compras) era que un ÚNICO fetch fallido al arrancar
// la app (ej. 401 transitorio justo después del login, antes de que la cookie se
// asiente) dejaba la lista vacía PARA SIEMPRE, porque no se reintentaba nunca.
// Ahora, si falla, reintenta con backoff creciente antes de rendirse.
async function fetchConReintento(url, { intentos = 4, esperaBase = 400 } = {}) {
    let ultimoError = null;
    for (let i = 0; i < intentos; i++) {
        try {
            const res = await fetch(url, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json().catch(() => null);
                if (Array.isArray(data)) return data;
                // Respuesta OK pero no es un array (ej. error JSON): tratamos como fallo.
            }
            // res no ok (401/500) o body inválido: reintentamos.
            ultimoError = new Error(`HTTP ${res.status}`);
        } catch (err) {
            ultimoError = err;
        }
        // Espera creciente antes del próximo intento (400ms, 800ms, 1200ms...).
        if (i < intentos - 1) await new Promise(r => setTimeout(r, esperaBase * (i + 1)));
    }
    throw ultimoError || new Error(`No se pudo cargar ${url}`);
}

export function CatalogProvider({ children }) {
    const [services, setServices] = useState([]);
    const [supervisors, setSupervisors] = useState([]);
    const [supplies, setSupplies] = useState([]);
    const [loading, setLoading] = useState(true);
    // Evita que dos cargas simultáneas (montaje + refetch) se pisen.
    const cargando = useRef(false);

    const fetchCatalogs = useCallback(async () => {
        if (cargando.current) return;
        cargando.current = true;

        // Services controlan el flag loading (desbloquean mi-panel en cuanto llegan).
        try {
            const svc = await fetchConReintento('/api/services');
            setServices(svc);
        } catch (err) {
            console.error('Error cargando servicios:', err);
            // No pisamos lo que ya hubiera cargado antes con una lista vacía.
        } finally {
            setLoading(false);
        }

        // Supervisores e insumos en paralelo, cada uno con sus reintentos.
        const [supv, sup] = await Promise.allSettled([
            fetchConReintento('/api/supervisors'),
            fetchConReintento('/api/supplies'),
        ]);
        if (supv.status === 'fulfilled') setSupervisors(supv.value);
        else console.error('Error cargando supervisores:', supv.reason);
        if (sup.status === 'fulfilled') setSupplies(sup.value);
        else console.error('Error cargando insumos:', sup.reason);

        cargando.current = false;
    }, []);

    useEffect(() => { fetchCatalogs(); }, [fetchCatalogs]);

    return (
        <CatalogContext.Provider value={{ services, supervisors, supplies, loading, refetch: fetchCatalogs }}>
            {children}
        </CatalogContext.Provider>
    );
}

export function useCatalog() {
    const ctx = useContext(CatalogContext);
    if (!ctx) throw new Error('useCatalog debe usarse dentro de CatalogProvider');
    return ctx;
}
