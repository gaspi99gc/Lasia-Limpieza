import { supabase } from '@/lib/db';
import { denyUnlessRole } from '@/lib/apiAuth';
import { ROLES_VER } from '@/lib/vencimientos';
import { limpiarBajas, nominaVigente } from '@/lib/nomina-documentacion-server';
import { llenarPlantillaWord } from '@/lib/plantilla-word';
import { fechaWord, nombreArchivoWord, plantillaDe } from '@/lib/plantillas-documentacion';

// El Word del cliente (la "Solicitud de autorización de trabajo") llenado con
// la nómina vigente y las fechas que se eligieron en pantalla.
//
// GET ?id=8&fecha=2026-12-19&inicio=2026-12-21&fin=2027-01-20
//
// Solo para las documentaciones que tienen plantilla (plantillas-documentacion.js).
// La plantilla se lee del bucket privado "plantillas": no está en el repo.

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function GET(request) {
    const denied = await denyUnlessRole(request, ROLES_VER);
    if (denied) return denied;

    try {
        const q = new URL(request.url).searchParams;
        const id = Number(q.get('id'));
        const plantilla = plantillaDe(id);
        if (!plantilla) return Response.json({ error: 'Esta documentación no tiene Word.' }, { status: 404 });
        const [fecha, inicio, fin] = ['fecha', 'inicio', 'fin'].map((k) => q.get(k) || '');
        if (![fecha, inicio, fin].every((f) => FECHA_RE.test(f))) {
            return Response.json({ error: 'Faltan las fechas.' }, { status: 400 });
        }

        const { data: venc, error: eVenc } = await supabase
            .from('rrhh_vencimientos').select('id, anulado_at').eq('id', id).maybeSingle();
        if (eVenc) throw eVenc;
        if (!venc || venc.anulado_at) return Response.json({ error: 'Esa documentación no existe.' }, { status: 404 });

        const { data: archivo, error: eArchivo } = await supabase.storage.from('plantillas').download(plantilla.archivo);
        if (eArchivo || !archivo) {
            console.error('Plantilla de Word no encontrada:', plantilla.archivo, eArchivo);
            return Response.json({ error: 'No se encontró la plantilla del Word.' }, { status: 500 });
        }

        await limpiarBajas([id]);
        const personas = await nominaVigente(id);
        const word = await llenarPlantillaWord(Buffer.from(await archivo.arrayBuffer()), {
            campos: { FECHA: fechaWord(fecha), INICIO: fechaWord(inicio), FIN: fechaWord(fin) },
            filas: personas.map((p) => ({ DNI: p.dni || '', APELLIDO: p.apellido, NOMBRE: p.nombre })),
        });

        const nombre = nombreArchivoWord(plantilla.nombre, fecha);
        return new Response(word, {
            headers: {
                'Content-Type': DOCX,
                'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Error armando el Word de la documentación:', error);
        return Response.json({ error: 'No se pudo armar el Word.' }, { status: 500 });
    }
}
