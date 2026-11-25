// Lo que comparten la pantalla de Documentación mensual (ex Vencimientos de
// RRHH), su API y el cron de avisos. Funciones puras: corren igual en el
// navegador, en el servidor y en el middleware.

// Quiénes ven la lista, el detalle y la nómina (y bajan el Excel).
export const ROLES_VER = ['admin', 'rrhh', 'operaciones', 'jefe_operativo'];
// Quiénes arman la nómina: agregar y sacar personas. Operaciones y la jefa
// operativa son las que saben a quién mandan a cada servicio.
export const ROLES_NOMINA = ['admin', 'rrhh', 'operaciones', 'jefe_operativo'];
// Quiénes gestionan la documentación: crear, editar, "Hecho", "Ya la mandé",
// borrar. Son también los únicos que pueden recibir los avisos al celular.
export const ROLES_GESTION = ['admin', 'rrhh'];

// Cuántos días antes se avisa (decidido con el usuario el 2026-10-26): una
// semana antes, dos días antes y el mismo día. Como el cron mira solo los
// pendientes, dejan de salir apenas alguien marca "Hecho".
export const AVISOS_VENCIMIENTO = [7, 2, 0];

// La próxima fecha de uno que se repite: `cada` meses después, el mismo día
// del mes. Si ese mes es más corto (vence el 31 y el mes tiene 30), cae el
// último día; el mes siguiente vuelve al día original, porque se calcula
// siempre desde `diaMes` y no desde la fecha anterior.
export function siguienteFecha(ymd, cada, diaMes) {
    const [a, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
    const dia = diaMes || d;
    const base = new Date(Date.UTC(a, m - 1 + Number(cada), 1));
    const ultimo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
    base.setUTCDate(Math.min(dia, ultimo));
    return base.toISOString().slice(0, 10);
}

// Aviso entre pestañas del navegador: cuando en Vencimientos se marca, edita,
// carga o borra algo, la tarjeta del dashboard abierta en otra pestaña se
// actualiza sola (antes quedaba vieja hasta recargar, 2026-10-30).
export const CANAL_VENCIMIENTOS = 'lasia-vencimientos';

export function avisarCambioVencimientos() {
    try {
        if (typeof BroadcastChannel === 'undefined') return;
        const canal = new BroadcastChannel(CANAL_VENCIMIENTOS);
        canal.postMessage('cambio');
        canal.close();
    } catch { /* sin aviso: el dashboard se actualiza igual al volver a su pestaña */ }
}

// "Todos los meses" / "Cada 3 meses" / "Todos los años" / "Una sola vez".
export function textoRepeticion(cada) {
    if (!cada) return 'Una sola vez';
    if (Number(cada) === 1) return 'Todos los meses';
    if (Number(cada) === 12) return 'Todos los años';
    return `Cada ${cada} meses`;
}

// La urgencia, en una palabra: la usan la hoja de la fecha, el "cuándo" y el
// grupo. Rojo = vencida o a dos días; ámbar = esta semana.
export const tonoVencimiento = (dias) => (dias <= 2 ? 'rojo' : dias <= 7 ? 'ambar' : undefined);

// "vence hoy" / "vence mañana" / "en 5 días" / "venció hace 2 días".
export function cuandoVence(dias) {
    if (dias < 0) return `venció hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'día' : 'días'}`;
    if (dias === 0) return 'vence hoy';
    if (dias === 1) return 'vence mañana';
    return `en ${dias} días`;
}

// "1 pendiente" / "3 pendientes".
export const textoPendientes = (n) => `${n} ${n === 1 ? 'pendiente' : 'pendientes'}`;
