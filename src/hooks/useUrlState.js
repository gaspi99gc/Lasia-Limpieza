'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Estado de pantalla guardado en la URL en vez de en useState.
//
// El problema que resuelve: cuando "dónde estoy" vive solo en memoria, volver
// atrás no puede reconstruirlo. Por eso hoy el botón Volver de RRHH adivina una
// pestaña fija y pierde la búsqueda, los filtros y el orden; y la flecha del
// navegador saca de la pantalla entera en vez de deshacer el último paso.
//
// Con el estado en la URL las tres cosas salen solas: volver es volver a la URL
// anterior, la flecha del navegador funciona porque cada paso es una entrada del
// historial, y de paso un link se puede compartir con la búsqueda ya hecha.
//
// SOBRE EL HISTORIAL (push vs replace)
//
// Es la misma regla que usan YouTube o Twitter, y se decide una sola vez:
//
//   push    -> "me moví a otro lado":  cambiar de pestaña, abrir un legajo.
//   replace -> "ajusté lo que veo":    escribir en el buscador, filtrar, ordenar.
//
// Sin esa distinción, cada tecla del buscador dejaría una entrada y habría que
// tocar "atrás" veinte veces para salir de la misma pantalla.

/**
 * Lee y escribe un conjunto de valores en la query string.
 *
 * @param {object} defaults  Valor por defecto de cada clave. Una clave que
 *                           quede en su valor por defecto NO se escribe en la
 *                           URL, para que no se llene de ruido (`?tab=personal`
 *                           y no `?tab=personal&buscar=&orden=apellido&...`).
 */
export function useUrlState(defaults = {}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Los valores actuales: lo que dice la URL, o el default si no está.
    const valores = useMemo(() => {
        const out = {};
        for (const [clave, porDefecto] of Object.entries(defaults)) {
            const crudo = searchParams.get(clave);
            if (crudo === null) { out[clave] = porDefecto; continue; }
            // El tipo lo marca el default: un default numérico parsea número.
            out[clave] = typeof porDefecto === 'number' ? (Number(crudo) || porDefecto) : crudo;
        }
        return out;
        // searchParams cambia de identidad en cada navegación, que es lo que
        // queremos: recalcular. defaults se pasa inline y no hace falta vigilarlo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    /**
     * Escribe cambios en la URL.
     *
     * @param {object} cambios  Claves a actualizar. `null` borra la clave.
     * @param {object} opciones `{ push: true }` para crear una entrada en el
     *                          historial. Por defecto reemplaza (no la crea).
     */
    const setValores = useCallback((cambios, { push = false } = {}) => {
        const params = new URLSearchParams(searchParams.toString());

        for (const [clave, valor] of Object.entries(cambios)) {
            const porDefecto = defaults[clave];
            const vacio = valor === null || valor === undefined || valor === '';
            // Lo que vuelve a su valor por defecto sale de la URL en vez de
            // escribirse: así la dirección queda corta y legible.
            if (vacio || valor === porDefecto) params.delete(clave);
            else params.set(clave, String(valor));
        }

        const qs = params.toString();
        const destino = qs ? `${pathname}?${qs}` : pathname;
        // scroll:false porque acá no se cambia de pantalla, solo de contenido:
        // saltar al tope al tipear en un buscador se siente roto.
        router[push ? 'push' : 'replace'](destino, { scroll: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router, pathname, searchParams]);

    return [valores, setValores];
}
