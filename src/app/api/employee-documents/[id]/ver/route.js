import { supabase } from '@/lib/db';

const BUCKET = 'employee-documents';

// Abre un documento del legajo.
//
// Antes el link firmado se generaba al CARGAR la lista y duraba una hora. Como
// RRHH deja la pantalla abierta toda la tarde, al tocar "Ver" el link ya estaba
// vencido y Storage devolvia {"error":"InvalidJWT","message":"exp claim
// timestamp check failed"}, sin forma de entender que pasaba.
//
// Ahora se firma recien cuando se abre el archivo y se redirige: el link nace en
// ese instante, asi que no puede estar vencido. De paso, la lista deja de pedirle
// a Storage una firma por cada documento del sistema en cada carga.
//
// El permiso lo aplica el middleware sobre el prefijo /api/employee-documents.
export async function GET(req, { params }) {
    try {
        const { id } = await params;

        const { data: doc, error } = await supabase
            .from('employee_documents')
            .select('file_path, file_name')
            .eq('id', id)
            .maybeSingle();
        if (error) throw error;
        if (!doc?.file_path) {
            return Response.json({ error: 'Documento no encontrado' }, { status: 404 });
        }

        const { data: signed, error: eSign } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(doc.file_path, 60 * 5);
        if (eSign || !signed?.signedUrl) {
            console.error('No se pudo firmar el documento', id, eSign?.message);
            return Response.json({ error: 'No se pudo abrir el documento.' }, { status: 500 });
        }

        return Response.redirect(signed.signedUrl, 302);
    } catch (error) {
        console.error('Error abriendo documento del legajo:', error);
        return Response.json({ error: 'No se pudo abrir el documento.' }, { status: 500 });
    }
}
