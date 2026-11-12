// Ingreso con huella digital / Face ID (WebAuthn): APAGADO desde el 2026-11-12.
//
// El usuario decidió que no se va a usar ("al final no se va a usar"). Con
// esto en false:
//   - el login no muestra el botón de huella,
//   - los supervisores no ven "Configuración" (esa pantalla era solo para
//     registrar la huella) y si entran por el link vuelven a su panel,
//   - el servidor no arma ni registra huellas (auth-options y
//     register-options responden 404), así no queda una puerta de entrada
//     que nadie usa.
//
// Para volver a activarlo alcanza con pasarlo a true: el código, las rutas
// y la tabla webauthn_credentials (2 dispositivos registrados al apagarlo)
// siguen ahí.
export const HUELLA_ACTIVA = false;
