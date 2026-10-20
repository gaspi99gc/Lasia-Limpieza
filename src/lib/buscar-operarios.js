import { supabase } from '@/lib/db';
import { matchesSearch, normalizeText } from '@/lib/search';

// Buscar operarios en el legajo por apellido, nombre o legajo. Solo lo
// necesario para elegir (nombre, legajo, servicio), nada de CUIL ni datos
// personales.
//
// La usan los trabajos programados (coordinar quién va) y los uniformes
// (a quién se le entrega o quién devuelve).
//
// Hacen falta 3 letras y se busca en la base: traer el legajo entero (más de
// mil personas) cada vez que se abre una ventana tardaba.

const MIN_LETRAS = 3;
const MAXIMO = 25;
const CANDIDATOS = 200;

// La base no ignora acentos: cada vocal y la n se buscan con sus variantes,
// asi "nunez" encuentra NUÑEZ y NÚÑEZ. Es una expresion regular (imatch) y no
// un comodin, para no traer de mas: con muchos falsos el limite de candidatos
// podia dejar afuera a la persona buscada.
const VARIANTES = {
    a: '[aáàäâAÁÀÄÂ]', e: '[eéèëêEÉÈËÊ]', i: '[iíìïîIÍÌÏÎ]',
    o: '[oóòöôOÓÒÖÔ]', u: '[uúùüûUÚÙÜÛ]', n: '[nñNÑ]',
};
const patron = (palabra) => [...palabra].map((c) => VARIANTES[c] || c).join('');

/**
 * @param {string}  q            lo que se escribió
 * @param {object}  opciones
 * @param {number}  opciones.servicioId   los de ese servicio van primero
 * @param {boolean} opciones.incluirBajas también los dados de baja (quien
 *                                        renuncia devuelve el uniforme)
 */
export async function buscarOperarios(q, { servicioId = null, incluirBajas = false } = {}) {
    // Solo letras, numeros y espacios: lo que va a la consulta no puede traer
    // comas ni parentesis que rompan el filtro.
    const palabras = normalizeText(q || '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    if (palabras.join('').length < MIN_LETRAS) return [];

    let consulta = supabase
        .from('employees')
        .select('id, nombre, apellido, legajo, servicio_id, fecha_baja, services:servicio_id (name)');
    if (!incluirBajas) consulta = consulta.is('fecha_baja', null);
    // Cada palabra tiene que estar en el apellido, el nombre o el legajo.
    for (const p of palabras) {
        consulta = consulta.or(`apellido.imatch."${patron(p)}",nombre.imatch."${patron(p)}",legajo.ilike.${p}%`);
    }
    const { data, error } = await consulta
        .order('apellido', { ascending: true })
        .order('nombre', { ascending: true })
        .limit(CANDIDATOS);
    if (error) throw error;

    return (data || [])
        .filter((e) => matchesSearch(palabras.join(' '), [e.apellido, e.nombre, e.legajo]))
        // Primero los activos y, entre ellos, los del servicio pedido.
        .sort((a, b) => (!a.fecha_baja - !b.fecha_baja) * -1
            || (b.servicio_id === servicioId) - (a.servicio_id === servicioId))
        .slice(0, MAXIMO)
        .map((e) => ({
            id: e.id,
            nombre: e.nombre,
            apellido: e.apellido,
            legajo: e.legajo,
            servicio_id: e.servicio_id,
            servicio_nombre: e.services?.name || null,
            fecha_baja: e.fecha_baja || null,
        }));
}
