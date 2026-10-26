// Lo que comparten la pantalla de vencimientos de RRHH, su API y el cron de
// avisos. Funciones puras: corren igual en el navegador y en el servidor.

// Quiénes usan los vencimientos: los ven, los cargan y pueden recibir avisos.
export const ROLES_VENCIMIENTOS = ['admin', 'rrhh'];

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

// "Todos los meses" / "Cada 3 meses" / "Todos los años" / "Una sola vez".
export function textoRepeticion(cada) {
    if (!cada) return 'Una sola vez';
    if (Number(cada) === 1) return 'Todos los meses';
    if (Number(cada) === 12) return 'Todos los años';
    return `Cada ${cada} meses`;
}
