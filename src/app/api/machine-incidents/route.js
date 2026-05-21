import { supabase } from '@/lib/db';
import { randomUUID } from 'crypto';

const ESTADOS = ['abierta', 'en_revision', 'reparada', 'reemplazada', 'descartada', 'completada'];
const BUCKET = 'machine-incidents';
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

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
            .select('id, service_id, machine_id, descripcion, nota_interna, estado, tipo_falla, service_destino_id, created_at, updated_at, services!machine_incidents_service_id_fkey(name), service_destino:services!machine_incidents_service_destino_id_fkey(name), machines(nombre), machine_incident_attachments(id, file_path, file_name, mime_type, size_bytes)')
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

export async function POST(req) {
    let createdId = null;
    const uploadedPaths = [];
    try {
        const form = await req.formData();
        const service_id = Number(form.get('service_id'));
        const machine_id = Number(form.get('machine_id'));
        const descripcion = (form.get('descripcion') || '').toString().trim();
        const nota_interna = (form.get('nota_interna') || '').toString().trim() || null;
        const tipo_falla = (form.get('tipo_falla') || '').toString().trim() || null;
        const estadoRaw = (form.get('estado') || '').toString();
        const service_destino_id_raw = form.get('service_destino_id');
        const service_destino_id = service_destino_id_raw ? Number(service_destino_id_raw) : null;
        const isTraspaso = tipo_falla === 'Traspaso';
        const files = form.getAll('files').filter(f => f && typeof f === 'object' && 'arrayBuffer' in f);

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
        } else if (files.length === 0) {
            return Response.json({ error: 'Debés adjuntar al menos una foto o video de la falla' }, { status: 400 });
        }
        for (const f of files) {
            if (!/^(image|video)\//.test(f.type || '')) {
                return Response.json({ error: `Archivo no permitido: ${f.name}. Solo fotos o videos.` }, { status: 400 });
            }
            if (f.size > MAX_BYTES) {
                return Response.json({ error: `Archivo demasiado grande: ${f.name} (máx 25 MB).` }, { status: 400 });
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
            })
            .select()
            .single();
        if (insErr) throw insErr;
        createdId = incident.id;

        const attachmentRows = [];
        for (const f of files) {
            const buf = Buffer.from(await f.arrayBuffer());
            const safeName = f.name.replace(/[^\w.\-]+/g, '_');
            const path = `${incident.id}/${randomUUID()}-${safeName}`;
            const { error: upErr } = await supabase.storage
                .from(BUCKET)
                .upload(path, buf, { contentType: f.type, upsert: false });
            if (upErr) throw upErr;
            uploadedPaths.push(path);
            attachmentRows.push({
                incident_id: incident.id,
                file_path: path,
                file_name: f.name,
                mime_type: f.type,
                size_bytes: f.size,
            });
        }

        const { data: insertedAtt, error: attErr } = await supabase
            .from('machine_incident_attachments')
            .insert(attachmentRows)
            .select('id, file_path, file_name, mime_type, size_bytes');
        if (attErr) throw attErr;

        const attachments = await attachSignedUrls(insertedAtt);
        return Response.json({ ...incident, attachments }, { status: 201 });
    } catch (error) {
        console.error('Error creating machine_incident:', error);
        // Rollback
        if (uploadedPaths.length) {
            try { await supabase.storage.from(BUCKET).remove(uploadedPaths); } catch {}
        }
        if (createdId) {
            try { await supabase.from('machine_incidents').delete().eq('id', createdId); } catch {}
        }
        return Response.json({ error: error?.message || 'Failed to create incident' }, { status: 500 });
    }
}
