import { supabase } from '@/lib/db';
import { cronAutorizado } from '@/lib/cronAuth';
import { enviarA } from '@/lib/push-server';

// Aviso automatico de los trabajos programados (sprint 3).
//
// Lo llama el cron de Vercel una vez por dia: en vercel.json dice '0 11 * * *'
// porque Vercel lo interpreta en UTC, y 11 UTC son las 8 de Argentina. En el
// plan Hobby puede salir en cualquier momento de esa hora (8 a 8:59). Mira
// los trabajos SIN COORDINAR que se vienen y le avisa a Operaciones y al
// supervisor elegido en el trabajo.
//
// Para correrlo a mano (es seguro: no duplica):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/avisos
//
// El cron no tiene sesion: el middleware lo deja pasar solo con CRON_SECRET.

export const runtime = 'nodejs';
// El envio tarda: cada push es una llamada a Google o Apple.
export const maxDuration = 60;

// Cuantos dias antes de la fecha se avisa. Como el cron solo mira trabajos en
// estado 'pendiente', el segundo aviso sale unicamente si nadie marco "ya lo
// coordine" despues del primero.
const AVISOS_DIAS_ANTES = [7, 2];

// Un aviso que no llego a nadie (tipicamente: nadie tiene las notificaciones
// activadas) se reintenta en las corridas siguientes, hasta este total.
const MAX_INTENTOS = 3;

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const hoyArgentina = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

// Las fechas se manejan como 'YYYY-MM-DD' y se operan en UTC a mediodia, para
// que ni el huso horario ni un cambio de horario corran el resultado un dia.
const aUTC = (ymd) => {
    const [a, m, d] = ymd.split('-').map(Number);
    return Date.UTC(a, m - 1, d, 12);
};
const sumarDias = (ymd, n) => new Date(aUTC(ymd) + n * 86400000).toISOString().slice(0, 10);
const diasEntre = (desde, hasta) => Math.round((aUTC(hasta) - aUTC(desde)) / 86400000);

function cuandoEs(dias) {
    if (dias === 0) return 'Hoy';
    if (dias === 1) return 'Mañana';
    if (dias === 2) return 'Pasado mañana';
    return `En ${dias} días`;
}

// "En 7 días: Limpieza de vidrios" / "CONS. LACROZE 2252 · jueves 15/10 · 3 operarios"
// Cerca de la fecha cambia el tono: a 2 dias o menos, sin coordinar, ya es un
// problema y la notificacion lo tiene que decir.
function armarAviso(t, dias) {
    const cuando = cuandoEs(dias);
    const [, m, d] = t.fecha.split('-');
    const diaSemana = DIAS_SEMANA[new Date(aUTC(t.fecha)).getUTCDay()];
    const n = t.operarios_necesarios;

    return {
        titulo: dias <= 2 ? `⚠ ${cuando} y sin coordinar: ${t.titulo}` : `${cuando}: ${t.titulo}`,
        cuerpo: [
            t.services?.name,
            `${diaSemana} ${d}/${m}`,
            `${n} ${n === 1 ? 'operario' : 'operarios'}`,
        ].filter(Boolean).join(' · '),
        url: '/trabajos',
        // El mismo tag por trabajo: el segundo aviso reemplaza al primero en
        // el celular en vez de apilarse.
        tag: `trabajo-${t.id}`,
        requiereAccion: true,
    };
}

export async function GET(request) {
    // El middleware ya lo controla; se repite para que la ruta no dependa de
    // que el middleware este bien configurado.
    if (!cronAutorizado(request)) {
        return Response.json({ error: 'No autorizado' }, { status: 401 });
    }

    try {
        const hoy = hoyArgentina();
        const hasta = sumarDias(hoy, Math.max(...AVISOS_DIAS_ANTES));

        const { data: trabajos, error } = await supabase
            .from('trabajos_programados')
            .select('id, titulo, fecha, operarios_necesarios, services:service_id (name), supervisors:supervisor_id (app_user_id)')
            .is('anulado_at', null)
            .eq('estado', 'pendiente')
            .gte('fecha', hoy)
            .lte('fecha', hasta);
        if (error) throw error;

        // Que aviso le toca hoy a cada trabajo: el mas cercano a la fecha de
        // los que ya llegaron a su dia. Si el trabajo se cargo tarde (a 5
        // dias), el de 7 sale igual, ese mismo dia. Si se cargo muy tarde (a 1
        // dia), sale solo el de 2 y el de 7 queda como omitido.
        const tocan = [];
        for (const t of trabajos || []) {
            const dias = diasEntre(hoy, t.fecha);
            const llegados = AVISOS_DIAS_ANTES.filter((d) => dias <= d);
            if (!llegados.length) continue;
            const actual = Math.min(...llegados);
            tocan.push({ t, dias, actual, salteados: llegados.filter((d) => d !== actual) });
        }

        if (!tocan.length) {
            return Response.json({ hoy, revisados: trabajos?.length || 0, avisos: [] });
        }

        // Reclamar los avisos de hoy: insertar y que la base descarte los que
        // ya existen. Solo se manda lo que este insert creo de verdad, asi que
        // si el cron corre dos veces (o dos corridas se pisan), la segunda no
        // encuentra nada nuevo y no manda nada.
        const filas = tocan.flatMap(({ t, actual, salteados }) => [
            { trabajo_id: t.id, fecha_trabajo: t.fecha, dias_antes: actual, estado: 'enviando', intentos: 1, ultimo_error: null },
            ...salteados.map((d) => ({
                trabajo_id: t.id, fecha_trabajo: t.fecha, dias_antes: d, estado: 'omitido', intentos: 0,
                ultimo_error: 'Se cargó o se reprogramó tarde: ya correspondía un aviso más cercano.',
            })),
        ]);

        const { data: creados, error: errCrear } = await supabase
            .from('trabajos_avisos')
            .upsert(filas, { onConflict: 'trabajo_id,fecha_trabajo,dias_antes', ignoreDuplicates: true })
            .select('id, trabajo_id, dias_antes, estado');
        if (errCrear) throw errCrear;

        const porTrabajo = new Map(tocan.map((x) => [x.t.id, x]));
        const aMandar = (creados || [])
            .filter((a) => a.estado === 'enviando')
            .map((a) => ({ avisoId: a.id, ...porTrabajo.get(a.trabajo_id) }));

        // Reintentos: el aviso de hoy ya existia pero no le llego a nadie. Se
        // reclama con un update condicionado al estado y los intentos que se
        // leyeron, para que dos corridas simultaneas no lo manden las dos.
        const { data: fallidos, error: errFallidos } = await supabase
            .from('trabajos_avisos')
            .select('id, trabajo_id, fecha_trabajo, dias_antes, intentos')
            .eq('estado', 'fallido')
            .lt('intentos', MAX_INTENTOS)
            .in('trabajo_id', [...porTrabajo.keys()]);
        if (errFallidos) throw errFallidos;

        for (const f of fallidos || []) {
            const x = porTrabajo.get(f.trabajo_id);
            // Solo si sigue siendo el aviso que corresponde hoy: un "en 7 dias"
            // que fallo no se reintenta cuando ya toca el de 2.
            if (!x || x.t.fecha !== f.fecha_trabajo || x.actual !== f.dias_antes) continue;
            const { data: tomado, error: errTomar } = await supabase
                .from('trabajos_avisos')
                .update({ estado: 'enviando', intentos: f.intentos + 1 })
                .eq('id', f.id)
                .eq('estado', 'fallido')
                .eq('intentos', f.intentos)
                .select('id');
            if (errTomar) throw errTomar;
            if (tomado?.length) aMandar.push({ avisoId: f.id, ...x });
        }

        if (!aMandar.length) {
            return Response.json({ hoy, revisados: trabajos.length, avisos: [] });
        }

        // A quien: Operaciones siempre, y el supervisor elegido en el trabajo.
        // Solo usuarios habilitados: alguien dado de baja puede seguir teniendo
        // el celular suscripto.
        const supervisoresIds = [...new Set(aMandar.map((x) => x.t.supervisors?.app_user_id).filter(Boolean))];
        const [{ data: ops, error: errOps }, { data: sups, error: errSups }] = await Promise.all([
            supabase.from('app_users').select('id').eq('role', 'operaciones').eq('login_enabled', true),
            supervisoresIds.length
                ? supabase.from('app_users').select('id').in('id', supervisoresIds).eq('login_enabled', true)
                : Promise.resolve({ data: [] }),
        ]);
        if (errOps) throw errOps;
        if (errSups) throw errSups;

        const operaciones = (ops || []).map((u) => u.id);
        const supervisoresActivos = new Set((sups || []).map((u) => u.id));

        const resultados = [];
        for (const { avisoId, t, dias, actual } of aMandar) {
            const supervisor = t.supervisors?.app_user_id;
            const destinatarios = [...new Set([
                ...operaciones,
                ...(supervisoresActivos.has(supervisor) ? [supervisor] : []),
            ])];

            let cambios;
            let r = null;
            try {
                if (!destinatarios.length) {
                    throw new Error('No hay a quién avisarle: no hay usuarios de Operaciones habilitados ni supervisor en el trabajo.');
                }
                r = await enviarA(destinatarios, armarAviso(t, dias));
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
                            : 'Ninguno de los destinatarios tiene las notificaciones activadas.',
                    };
            } catch (e) {
                cambios = { estado: 'fallido', ultimo_error: e?.message || String(e) };
            }

            const { error: errMarcar } = await supabase.from('trabajos_avisos').update(cambios).eq('id', avisoId);
            // Si no se pudo marcar, el aviso queda 'enviando' y no se reintenta:
            // es preferible eso a mandarlo dos veces.
            if (errMarcar) console.error('No se pudo marcar el aviso', avisoId, errMarcar.message);

            resultados.push({
                trabajo_id: t.id,
                titulo: t.titulo,
                fecha: t.fecha,
                dias_antes: actual,
                estado: cambios.estado,
                destinatarios: destinatarios.length,
                dispositivos: r?.enviados || 0,
                limpiados: r?.limpiados || 0,
                error: cambios.ultimo_error || null,
            });
        }

        return Response.json({ hoy, revisados: trabajos.length, avisos: resultados });
    } catch (error) {
        console.error('Error en el cron de avisos:', error);
        return Response.json(
            { error: `Falló el cron de avisos: ${error.message || 'error desconocido'}` },
            { status: 500 }
        );
    }
}
