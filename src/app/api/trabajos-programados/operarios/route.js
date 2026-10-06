import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { matchesSearch, normalizeText } from '@/lib/search';
import { ROLES_ESCRITURA } from '@/lib/trabajos-server';

// Buscar operarios del legajo activo (sin fecha de baja) para coordinar un
// trabajo. Solo lo necesario para elegir (nombre, legajo, servicio), nada de
// CUIL ni datos personales. Solo para quien coordina: Operaciones y admin.
//
// GET ?q=acosta maria&service_id=12
//
// Antes la ventana traia el legajo entero (mas de mil personas) cada vez que se
// abria y tardaba. Ahora, como en los buscadores de servicios, hacen falta 3
// letras y se busca en la base.

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

export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES_ESCRITURA);
    if (denied) return denied;

    try {
        const { searchParams } = new URL(request.url);
        const q = (searchParams.get('q') || '').trim();
        const servicioId = Number(searchParams.get('service_id')) || null;

        // Solo letras, numeros y espacios: lo que va a la consulta no puede
        // traer comas ni parentesis que rompan el filtro.
        const palabras = normalizeText(q).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
        if (palabras.join('').length < MIN_LETRAS) return Response.json([]);

        let consulta = supabase
            .from('employees')
            .select('id, nombre, apellido, legajo, servicio_id, services:servicio_id (name)')
            .is('fecha_baja', null);
        // Cada palabra tiene que estar en el apellido, el nombre o el legajo.
        for (const p of palabras) {
            consulta = consulta.or(`apellido.imatch."${patron(p)}",nombre.imatch."${patron(p)}",legajo.ilike.${p}%`);
        }
        const { data, error } = await consulta
            .order('apellido', { ascending: true })
            .order('nombre', { ascending: true })
            .limit(CANDIDATOS);
        if (error) throw error;

        const encontrados = (data || [])
            .filter((e) => matchesSearch(palabras.join(' '), [e.apellido, e.nombre, e.legajo]))
            // Primero los de este servicio: suele ser la gente que va.
            .sort((a, b) => (b.servicio_id === servicioId) - (a.servicio_id === servicioId))
            .slice(0, MAXIMO);

        return Response.json(encontrados.map((e) => ({
            id: e.id,
            nombre: e.nombre,
            apellido: e.apellido,
            legajo: e.legajo,
            servicio_id: e.servicio_id,
            servicio_nombre: e.services?.name || null,
        })));
    } catch (error) {
        console.error('Error buscando operarios para trabajos:', error);
        return Response.json({ error: 'No se pudo buscar en el legajo.' }, { status: 500 });
    }
}
