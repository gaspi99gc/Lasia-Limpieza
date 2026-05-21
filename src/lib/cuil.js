// Argentine CUIL/CUIT helpers.
// CUIL format: PP-DDDDDDDD-V (11 digits) where the middle 8 are the DNI.

export function dniFromCuil(cuil) {
    const digits = (cuil || '').toString().replace(/\D/g, '');
    if (digits.length !== 11) return null;
    const middle = digits.slice(2, 10).replace(/^0+/, '');
    return middle || null;
}
