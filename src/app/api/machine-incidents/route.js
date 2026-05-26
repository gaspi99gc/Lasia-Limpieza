import { supabase } from '@/lib/db';

const ESTADOS = ['abierta', 'en_revision', 'reparada', 'reemplazada', 'descartada', 'completada'];
const BUCKET = 'machine-incidents';
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

async function attachSignedUrls(rows) {
    if (!rows?.length) return [];
    const paths = rows.map(r => r.file_path);
    const { data: signed, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, 60 * 60); // 1 h
    if (error) throw error;
    const byPath = new Map(signed.map(s => [s.path, s.signedUrl]));
    return rows.map(r => ({
        id: r.id,
        file_name: r.file_name,
        mime_type: r.mime_type,
        size_bytes: r.size_bytes,
        url: byPath.get(r.file_path) || null,
    }));
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const estado = searchParams.get('estado');
        const serviceId = searchParams.get('service_id');
        const machineId = searchParams.get('machine_id');

        let query = supabase
            .from('machine_incidents')
            .select('id, service_id, machine_id, descripcion, nota_interna, estado, tipo_falla, service_destino_id, created_at, updated_at, reportado_por_nombre, reportado_por_id, reportado_por_dni, services!machine_incidents_service_id_fkey(name), service_destino:services!machine_incidents_service_destino_id_fkey(name), machines(nombre), machine_incident_attachments(id, file_path, file_name, mime_type, size_bytes)')
            .order('created_at', { ascending: false });

        if (estado) query = query.eq('estado', estado);
        if (serviceId) query = query.eq('service_id', serviceId);
        if (machineId) query = query.eq('machine_id', machineId);

        const { data, error } = await query;
        if (error) throw error;

        const flat = await Promise.all((data || []).map(async (r) => ({
            id: r.id,
            service_id: r.service_id,
            machine_id: r.machine_id,
            descripcion: r.descripcion,
            nota_interna: r.nota_interna,
            estado: r.estado,
            tipo_falla: r.tipo_falla,
            service_destino_id: r.service_destino_id,
            service_destino_name: r.service_destino?.name || null,
            created_at: r.created_at,
            updated_at: r.updated_at,
            reportado_por_nombre: r.reportado_por_nombre || null,
            reportado_por_id: r.reportado_por_id || null,
            reportado_por_dni: r.reportado_por_dni || null,
            service_name: r.services?.name || null,
            machine_nombre: r.machines?.nombre || null,
            attachments: await attachSignedUrls(r.machine_incident_attachments || []),
        })));

        return Response.json(flat);
    } catch (error) {
        console.error('Error fetching machine_incidents:', error);
        return Response.json({ error: 'Failed to fetch incidents' }, { status: 500 });
    }
}

// Crea la incidencia con archivos que el cliente ya subió DIRECTO a Storage
// usando las URLs firmadas que devuelve /api/machine-incidents/sign-uploads.
// Body JSON: { service_id, machine_id, descripcion?, nota_interna?, tipo_falla?,
//              service_destino_id?, estado?, attachments: [{path, file_name, mime_type, size_bytes}] }
// Asi salteamos el limite de body de Vercel (~4.5 MB) y soportamos videos grandes.
export async function POST(req) {
    let createdId = null;
    const movedPaths = []; // paths finales para rollback si algo falla despues
    try {
        const body = await req.json();
        const service_id = Number(body.service_id);
        const machine_id = Number(body.machine_id);
        const descripcion = (body.descripcion || '').toString().trim();
        const nota_interna = (body.nota_interna || '').toString().trim() || null;
        const tipo_falla = (body.tipo_falla || '').toString().trim() || null;
        const service_destino_id = body.service_destino_id ? Number(body.service_destino_id) : null;
        const estadoRaw = (body.estado || '').toString();
        const reportado_por_nombre = (body.reportado_por_nombre || '').toString().trim() || null;
        const reportado_por_id = body.reportado_por_id ? Number(body.reportado_por_id) : null;
        const reportado_por_dni = (body.reportado_por_dni || '').toString().trim() || null;
        const isTraspaso = tipo_falla === 'Traspaso';
        const attachments = Array.isArray(body.attachments) ? body.attachments : [];

        if (!service_id || !machine_id) {
            return Response.json({ error: 'service_id y machine_id son obligatorios' }, { status: 400 });
        }
        const finalDescripcion = descripcion || (isTraspaso ? 'Traspaso de máquina a otro servicio' : 'Incidencia sin descripción');
        if (isTraspaso) {
            if (!service_destino_id) {
                return Response.json({ error: 'Para un traspaso, el servicio destino es obligatorio' }, { status: 400 });
            }
            if (service_destino_id === service_id) {
                return Response.json({ error: 'El servicio destino debe ser distinto al servicio origen' }, { status: 400 });
            }
        } else if (attachments.length === 0) {
            return Response.json({ error: 'Debés adjuntar al menos una foto o video de la falla' }, { status: 400 });
        }
        for (const a of attachments) {
            if (!a?.path || !a?.file_name || !a?.mime_type) {
                return Response.json({ error: 'Cada adjunto requiere path, file_name y mime_type.' }, { status: 400 });
            }
            if (!/^(image|video)\//.test(a.mime_type)) {
                return Response.json({ error: `Archivo no permitido: ${a.file_name}. Solo fotos o videos.` }, { status: 400 });
            }
            const size = Number(a.size_bytes) || 0;
            if (size > MAX_BYTES) {
                return Response.json({ error: `Archivo demasiado grande: ${a.file_name} (máx 50 MB).` }, { status: 400 });
            }
            // Defensa: el cliente solo puede pasar paths que firmamos nosotros (prefijo _drafts/).
            if (!a.path.startsWith('_drafts/')) {
                return Response.json({ error: 'Path de archivo inválido.' }, { status: 400 });
            }
        }
        const finalEstado = estadoRaw || 'abierta';
        if (!ESTADOS.includes(finalEstado)) {
            return Response.json({ error: 'Estado inválido' }, { status: 400 });
        }

        const { data: incident, error: insErr } = await supabase
            .from('machine_incidents')
            .insert({
                service_id,
                machine_id,
                descripcion: finalDescripcion,
                nota_interna,
                estado: finalEstado,
                tipo_falla,
                service_destino_id: isTraspaso ? service_destino_id : null,
                reportado_por_nombre,
                reportado_por_id,
                reportado_por_dni,
            })
            .select()
            .single();
        if (insErr) throw insErr;
        createdId = incident.id;

        // Mover cada archivo desde _drafts/<draft>/<file> al prefijo definitivo <incident_id>/<file>.
        // Asi mantenemos la convencion previa de organizacion por incidencia.
        const attachmentRows = [];
        for (const a of attachments) {
            const fileSeg = a.path.split('/').pop();
            const finalPath = `${incident.id}/${fileSeg}`;
            const { error: mvErr } = await supabase.storage.from(BUCKET).move(a.path, finalPath);
            if (mvErr) throw mvErr;
            movedPaths.push(finalPath);
            attachmentRows.push({
                incident_id: incident.id,
                file_path: finalPath,
                file_name: a.file_name,
                mime_type: a.mime_type,
                size_bytes: Number(a.size_bytes) || 0,
            });
        }

        const { data: insertedAtt, error: attErr } = await supabase
            .from('machine_incident_attachments')
            .insert(attachmentRows)
            .select('id, file_path, file_name, mime_type, size_bytes');
        if (attErr) throw attErr;

        const signed = await attachSignedUrls(insertedAtt);
        return Response.json({ ...incident, attachments: signed }, { status: 201 });
    } catch (error) {
        console.error('Error creating machine_incident:', error);
        // Rollback: borrar lo que ya fue movido y la fila de incidencia si se creo.
        if (movedPaths.length) {
            try { await supabase.storage.from(BUCKET).remove(movedPaths); } catch {}
        }
        if (createdId) {
            try { await supabase.from('machine_incidents').delete().eq('id', createdId); } catch {}
        }
        return Response.json({ error: error?.message || 'Failed to create incident' }, { status: 500 });
    }
}
