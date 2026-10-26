import { supabase } from '@/lib/db';
import { enviarA } from '@/lib/push-server';
import { MAX_INTENTOS_AVISO, diasEntre, sumarDias } from '@/lib/trabajos';
import { AVISOS_VENCIMIENTO, textoRepeticion } from '@/lib/vencimientos';

// Avisos de los vencimientos de RRHH. Corre dentro del cron diario de las 8
// (/api/cron/avisos), separado de los trabajos: si una parte falla, la otra
// sale igual.
//
// Es el mismo mecanismo que los trabajos programados (ver ese cron para el
// detalle): cada aviso se "reclama" insertándolo en rrhh_vencimientos_avisos,
// cuyo UNIQUE (vencimiento, fecha, días antes) hace que nunca salga dos veces;
// si no llegó a nadie se reintenta hasta MAX_INTENTOS_AVISO veces.

const ENVIANDO_VENCE_MIN = 15;
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// "Vence en 7 días: Presentación 931" / "⚠ Vence pasado mañana: …" / "🔴 Vence hoy: …"
function armarAviso(v, dias) {
    const titulo = dias === 0 ? `🔴 Vence hoy: ${v.titulo}`
        : dias === 1 ? `⚠ Vence mañana: ${v.titulo}`
            : dias === 2 ? `⚠ Vence pasado mañana: ${v.titulo}`
                : `Vence en ${dias} días: ${v.titulo}`;
    const [, m, d] = v.fecha.split('-');
    const diaSemana = DIAS_SEMANA[new Date(`${v.fecha}T12:00:00Z`).getUTCDay()];
    const nota = v.nota && v.nota.length > 80 ? `${v.nota.slice(0, 77)}…` : v.nota;
    return {
        titulo,
        cuerpo: [`${diaSemana} ${d}/${m}`, v.cada_meses ? textoRepeticion(v.cada_meses) : null, nota].filter(Boolean).join(' · '),
        url: '/vencimientos',
        acciones: [],
        // El aviso nuevo reemplaza al anterior en el celular en vez de apilarse.
        tag: `vencimiento-${v.id}`,
        requiereAccion: true,
    };
}

export async function avisosVencimientos(hoy) {
    // Los que una corrida anterior tomó y no llegó a marcar: a fallido, para
    // reintentarlos. Dos updates porque PostgREST no acepta .or() en un update.
    const vence = new Date(Date.now() - ENVIANDO_VENCE_MIN * 60 * 1000).toISOString();
    const recuperar = () => supabase
        .from('rrhh_vencimientos_avisos')
        .update({ estado: 'fallido', ultimo_error: 'El envío se cortó a la mitad.' })
        .eq('estado', 'enviando');
    const [{ error: errA }, { error: errB }] = await Promise.all([
        recuperar().lt('enviado_at', vence),
        recuperar().is('enviado_at', null).lt('created_at', vence),
    ]);
    if (errA) throw errA;
    if (errB) throw errB;

    const { data: pendientes, error: errPend } = await supabase
        .from('rrhh_vencimientos')
        .select('id, titulo, nota, fecha, cada_meses, responsables')
        .is('anulado_at', null)
        .eq('estado', 'pendiente')
        .gte('fecha', hoy)
        .lte('fecha', sumarDias(hoy, Math.max(...AVISOS_VENCIMIENTO)));
    if (errPend) throw errPend;

    // El aviso que le toca hoy: el más cercano de los que ya llegaron. Si se
    // cargó tarde (a 5 días) sale el de 7 igual; los que quedaron atrás se
    // anotan como omitidos.
    const tocan = [];
    for (const v of pendientes || []) {
        const dias = diasEntre(hoy, v.fecha);
        const llegados = AVISOS_VENCIMIENTO.filter((d) => dias <= d);
        if (!llegados.length) continue;
        const actual = Math.min(...llegados);
        tocan.push({ v, dias, diasAntes: actual, salteados: llegados.filter((d) => d !== actual) });
    }
    if (!tocan.length) return { revisados: pendientes?.length || 0, avisos: [] };

    const porId = new Map(tocan.map((x) => [x.v.id, x]));
    const responsables = [...new Set(tocan.flatMap((x) => x.v.responsables || []))];
    const [{ data: fallidos, error: errFallidos }, { data: activos, error: errActivos }] = await Promise.all([
        supabase
            .from('rrhh_vencimientos_avisos')
            .select('id, vencimiento_id, fecha_vencimiento, dias_antes, intentos')
            .eq('estado', 'fallido')
            .lt('intentos', MAX_INTENTOS_AVISO)
            .in('vencimiento_id', [...porId.keys()]),
        responsables.length
            ? supabase.from('app_users').select('id').in('id', responsables).eq('login_enabled', true)
            : Promise.resolve({ data: [] }),
    ]);
    if (errFallidos) throw errFallidos;
    if (errActivos) throw errActivos;
    const habilitados = new Set((activos || []).map((u) => u.id));

    const tomadoAt = new Date().toISOString();
    const filas = tocan.flatMap(({ v, diasAntes, salteados }) => [
        { vencimiento_id: v.id, fecha_vencimiento: v.fecha, dias_antes: diasAntes, estado: 'enviando', intentos: 1, enviado_at: tomadoAt },
        ...salteados.map((d) => ({
            vencimiento_id: v.id, fecha_vencimiento: v.fecha, dias_antes: d, estado: 'omitido', intentos: 0,
            ultimo_error: 'Se cargó tarde: ya correspondía un aviso más cercano.',
        })),
    ]);
    const { data: creados, error: errCrear } = await supabase
        .from('rrhh_vencimientos_avisos')
        .upsert(filas, { onConflict: 'vencimiento_id,fecha_vencimiento,dias_antes', ignoreDuplicates: true })
        .select('id, vencimiento_id, estado');
    if (errCrear) throw errCrear;

    const aMandar = (creados || [])
        .filter((a) => a.estado === 'enviando')
        .map((a) => ({ avisoId: a.id, ...porId.get(a.vencimiento_id) }));

    // Reintentos: solo si sigue siendo el aviso que corresponde hoy.
    for (const f of fallidos || []) {
        const x = porId.get(f.vencimiento_id);
        if (!x || x.v.fecha !== f.fecha_vencimiento || x.diasAntes !== f.dias_antes) continue;
        const { data: tomado, error } = await supabase
            .from('rrhh_vencimientos_avisos')
            .update({ estado: 'enviando', intentos: f.intentos + 1, enviado_at: tomadoAt })
            .eq('id', f.id)
            .eq('estado', 'fallido')
            .eq('intentos', f.intentos)
            .select('id');
        if (error) { console.error('No se pudo tomar el reintento', f.id, error.message); continue; }
        if (tomado?.length) aMandar.push({ avisoId: f.id, ...x });
    }

    const resultados = [];
    for (const { avisoId, v, dias, diasAntes } of aMandar) {
        const destinatarios = (v.responsables || []).filter((id) => habilitados.has(id));
        let cambios;
        let r = null;
        try {
            if (!destinatarios.length) throw new Error('Ninguno de los responsables tiene el usuario habilitado.');
            r = await enviarA(destinatarios, armarAviso(v, dias));
            if (r.error) throw new Error(r.error);
            cambios = r.enviados > 0
                ? {
                    estado: 'enviado',
                    enviado_at: new Date().toISOString(),
                    destinatarios: destinatarios.length,
                    dispositivos: r.enviados,
                    ultimo_error: r.fallidos ? `${r.fallidos} dispositivo(s) no lo recibieron.` : null,
                }
                : {
                    estado: 'fallido',
                    destinatarios: destinatarios.length,
                    dispositivos: 0,
                    ultimo_error: r.fallidos
                        ? 'El servicio de notificaciones rechazó todos los envíos.'
                        : 'Ninguno de los responsables tiene las notificaciones activadas.',
                };
        } catch (e) {
            cambios = { estado: 'fallido', ultimo_error: e?.message || String(e) };
        }

        const { error: errMarcar } = await supabase.from('rrhh_vencimientos_avisos').update(cambios).eq('id', avisoId);
        if (errMarcar) console.error('No se pudo marcar el aviso de vencimiento', avisoId, errMarcar.message);

        resultados.push({
            vencimiento_id: v.id,
            titulo: v.titulo,
            fecha: v.fecha,
            dias_antes: diasAntes,
            estado: cambios.estado,
            destinatarios: destinatarios.length,
            dispositivos: r?.enviados || 0,
            error: cambios.ultimo_error || null,
        });
    }

    return { revisados: pendientes?.length || 0, avisos: resultados };
}
