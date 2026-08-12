'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const CatalogContext = createContext(null);

export function CatalogProvider({ children }) {
    const [services, setServices] = useState([]);
    const [supervisors, setSupervisors] = useState([]);
    const [supplies, setSupplies] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchCatalogs = useCallback(async () => {
        try {
            // credentials:'include' manda la cookie de sesión firmada. Sin esto la API
            // (que ahora exige sesión) puede responder 401 y el catálogo queda vacío.
            const [svcRes, supvRes, supRes] = await Promise.all([
                fetch('/api/services', { credentials: 'include' }),
                fetch('/api/supervisors', { credentials: 'include' }),
                fetch('/api/supplies', { credentials: 'include' }),
            ]);

            const [svcData, supvData, supData] = await Promise.all([
                svcRes.json().catch(() => []),
                supvRes.json().catch(() => []),
                supRes.json().catch(() => []),
            ]);

            if (svcRes.ok) setServices(Array.isArray(svcData) ? svcData : []);
            if (supvRes.ok) setSupervisors(Array.isArray(supvData) ? supvData : []);
            if (supRes.ok) setSupplies(Array.isArray(supData) ? supData : []);
        } catch (err) {
            console.error('Error cargando catálogos:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // Services controlan el flag loading — desbloquean mi-panel en cuanto llegan.
        // credentials:'include' asegura que viaje la cookie de sesión (la API la exige).
        fetch('/api/services', { credentials: 'include' })
            .then(r => r.ok ? r.json().catch(() => []) : [])
            .then(data => setServices(Array.isArray(data) ? data : []))
            .catch(() => {})
            .finally(() => setLoading(false));

        // Supervisores e insumos cargan en background sin bloquear el flag loading
        Promise.all([
            fetch('/api/supervisors', { credentials: 'include' }).then(r => r.ok ? r.json().catch(() => []) : []),
            fetch('/api/supplies', { credentials: 'include' }).then(r => r.ok ? r.json().catch(() => []) : []),
        ]).then(([supvData, supData]) => {
            setSupervisors(Array.isArray(supvData) ? supvData : []);
            setSupplies(Array.isArray(supData) ? supData : []);
        }).catch(err => console.error('Error cargando catálogos secundarios:', err));
    }, []);

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
