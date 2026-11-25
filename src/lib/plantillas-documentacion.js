import { siguienteFecha } from './vencimientos.js';

// Las documentaciones que, además del Excel, se bajan en el Word del cliente
// (la "Solicitud de autorización de trabajo"), ya llenado con la nómina.
//
// - archivo: nombre en el bucket privado "plantillas" de Supabase Storage. Se
//   sube con scripts/subir_plantilla_word.mjs.
// - diasAntes: cuántos días antes del vencimiento real se puso la fecha en la
//   app (las FAO de Zara, 1: pedido del usuario del 2026-11-25).
//
// Para sumar otra (TOM, BULL, AVE...): armar su plantilla y agregarla acá.
const PLANTILLAS = {
    8: { archivo: 'zara-uni.docx', nombre: 'ZARA UNI - SOLICITUD DE AUT', diasAntes: 1 },
};

export const plantillaDe = (vencimientoId) => PLANTILLAS[vencimientoId] || null;

const sumarDias = (ymd, dias) => {
    const d = new Date(`${ymd}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
};

// Las fechas que se proponen para el Word (decidido con el usuario el
// 2026-11-25): la del día en que se baja, y el período nuevo, que arranca el
// día siguiente al vencimiento real y termina un mes después.
export function fechasSugeridas(fechaApp, diasAntes, hoy) {
    const real = sumarDias(fechaApp, diasAntes);
    return {
        fecha: hoy,
        inicio: sumarDias(real, 1),
        fin: siguienteFecha(real, 1, Number(real.slice(8, 10))),
    };
}

// '2026-12-21' -> '21/12/2026', como en el Word.
export const fechaWord = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

// 'ZARA UNI - SOLICITUD DE AUT 19-12-2026.docx'
export const nombreArchivoWord = (nombre, ymd) => `${nombre} ${fechaWord(ymd).replace(/\//g, '-')}.docx`;
