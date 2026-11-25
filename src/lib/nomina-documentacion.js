// Cuentas puras de la nómina de Documentación mensual (ex Vencimientos).
//
// Cada documentación que se manda al cliente (FAO de Zara, WeWork...) tiene
// su nómina: quiénes van documentados. Acá está lo que no toca la base, para
// que lo usen igual la pantalla, las rutas de la API y los scripts de carga.
// Por eso el módulo no importa nada: ni `@/` (los scripts no lo entienden) ni
// supabase. Las pruebas están en tests/nomina-documentacion.test.mjs.

// Dado de baja = no está Activo o ya tiene fecha de baja. Las dos cosas,
// porque en los legajos viejos a veces se cargó solo una.
export function estaDeBaja(emp) {
    return (emp?.estado_empleado ?? 'Activo') !== 'Activo' || !!emp?.fecha_baja;
}

// El DNI de una celda de Excel. En las planillas de los clientes la columna
// "DNI" a veces trae el CUIL entero (11 dígitos): ahí el DNI son los dígitos
// 3 a 10. Devuelve null si lo que queda no parece un DNI (7 u 8 dígitos).
export function dniDeCelda(valor) {
    let digitos = String(valor ?? '').replace(/\D/g, '');
    if (digitos.length === 11) digitos = digitos.slice(2, 10);
    digitos = digitos.replace(/^0+/, '');
    return digitos.length >= 7 && digitos.length <= 8 ? digitos : null;
}

// '23456789' -> '23.456.789'. Se muestra así porque así lo lee la gente.
export function formatearDni(dni) {
    return String(dni ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const porApellido = (a, b) =>
    String(a.apellido ?? '').localeCompare(String(b.apellido ?? ''), 'es')
    || String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es');

// La foto de quiénes se mandaron, para el registro oculto de envíos. Solo los
// datos de la persona: si después cambia la nómina, el envío sigue diciendo a
// quién se documentó.
export function snapshotNomina(filas) {
    return (filas || [])
        .map(({ employee_id, apellido, nombre, dni }) => ({ employee_id, apellido, nombre, dni }))
        .sort(porApellido);
}

// { vencimiento_id: { total, pendientes } } a partir de las filas vigentes
// (las que no se sacaron). Pendiente = todavía no entró en ningún envío.
export function resumenNomina(filas) {
    const out = {};
    for (const f of filas || []) {
        const r = out[f.vencimiento_id] || (out[f.vencimiento_id] = { total: 0, pendientes: 0 });
        r.total += 1;
        if (!f.enviado_at) r.pendientes += 1;
    }
    return out;
}

// 'Nomina FAO ZARA TOM 2026-12.xlsx'. Algunos títulos traen "/" y Windows no
// acepta esos caracteres en un nombre de archivo.
export function nombreArchivoNomina(titulo, fecha) {
    const limpio = String(titulo ?? '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
    return `Nomina ${limpio} ${String(fecha ?? '').slice(0, 7)}.xlsx`;
}
