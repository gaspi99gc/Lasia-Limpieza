import { supabase } from '@/lib/db';
import { cronAutorizado } from '@/lib/cronAuth';
import { enviarA } from '@/lib/push-server';
import {
    AVISOS_DIAS_ANTES, MAX_INTENTOS_AVISO, VISPERA_DIAS_ANTES, diasEntre, fmtHora, hoyArgentina, sumarDias,
} from '@/lib/trabajos';

// Avisos automaticos de los trabajos programados.
//
// Lo llama el cron de Vercel una vez por dia: en vercel.json dice '0 11 * * *'
// porque Vercel lo interpreta en UTC, y 11 UTC son las 8 de Argentina. En el
// plan Hobby puede salir en cualquier momento de esa hora (8 a 8:59).
//
// Manda dos clases de aviso:
//   - Para coordinar (sprint 3): trabajos SIN COORDINAR, 7 y 2 dias antes, a
//     Operaciones (con el boton "Coordinar") y al supervisor del trabajo.
//   - La vispera (sprint 5): trabajos YA COORDINADOS, el dia anterior, a
//     Operaciones y al supervisor, con quienes van. Solo informa.
//
// Para correrlo a mano (es seguro: no duplica):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/avisos
//
// El cron no tiene sesion: el middleware lo deja pasar solo con CRON_SECRET.

export const runtime = 'nodejs';
// El envio tarda: cada push es una llamada a Google o Apple.
export const maxDuration = 60;

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function cuandoEs(dias) {
    if (dias === 0) return 'Hoy';
    if (dias === 1) return 'Mañana';
    if (dias === 2) return 'Pasado mañana';
    return `En ${dias} días`;
}

// "Ana, Pedro y María"
const listaConY = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

// "En 7 días: Limpieza de vidrios" / "CONS. LACROZE 2252 · jueves 15/10 · 8:00 h · 3 operarios"
// Cerca de la fecha cambia el tono: a 2 dias o menos, sin coordinar, ya es un
// problema y la notificacion lo tiene que decir.
//
// Coordinan las de Operaciones: a ellas les llega con el boton "Coordinar",
// que abre el trabajo para elegir quienes van. El supervisor recibe lo mismo
// sin el boton, para estar al tanto (decidido el 2026-10-05).
function armarAvisoCoordinar(t, dias, { paraOperaciones }) {
    const cuando = cuandoEs(dias);
    const [, m, d] = t.fecha.split('-');
    const diaSemana = DIAS_SEMANA[new Date(`${t.fecha}T12:00:00Z`).getUTCDay()];
    const n = t.operarios_necesarios;
    // Si ya anotaron a algunos (sin darlo por coordinado), se dice cuantos.
    const asignados = t.trabajos_operarios?.[0]?.count || 0;
    const gente = asignados
        ? `${asignados} de ${n} operarios`
        : `${n} ${n === 1 ? 'operario' : 'operarios'}`;

    return {
        titulo: dias <= 2 ? `⚠ ${cuando} y sin coordinar: ${t.titulo}` : `${cuando}: ${t.titulo}`,
        cuerpo: [t.services?.name, `${diaSemana} ${d}/${m}`, fmtHora(t.hora_inicio), gente].filter(Boolean).join(' · '),
        // A Operaciones la lleva directo a coordinar ese trabajo. Tocar la
        // notificacion o el boton hace lo mismo: el service worker abre `url`.
        url: paraOperaciones ? `/trabajos?coordinar=${t.id}` : '/trabajos',
        acciones: paraOperaciones ? [{ action: 'coordinar', title: 'Coordinar' }] : [],
        // El mismo tag por trabajo: el aviso nuevo reemplaza al anterior en el
        // celular en vez de apilarse.
        tag: `trabajo-${t.id}`,
        requiereAccion: true,
    };
}

// "Mañana: Limpieza de vidrios" / "CONS. LACROZE 2252 · 8:00 h · Van Ana Gómez, Pedro Ruiz y María Pérez"
// Es el mismo mensaje para todos: ya no hay nada que coordinar, es para que el
// supervisor sepa quien va a aparecer y Operaciones lo tenga presente.
function armarAvisoVispera(t) {
    const nombres = (t.trabajos_operarios || [])
        .map((o) => [o.employees?.nombre, o.employees?.apellido].filter(Boolean).join(' '))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'es'));
    const n = t.operarios_necesarios;
    const van = nombres.length
        ? `Van ${nombres.length < n ? `${nombres.length} de ${n}: ` : ''}${listaConY(nombres)}`
        : `${n} ${n === 1 ? 'operario' : 'operarios'}`;

    return {
        titulo: `Mañana: ${t.titulo}`,
        cuerpo: [t.services?.name, fmtHora(t.hora_inicio), van].filter(Boolean).join(' · '),
        url: '/trabajos',
        acciones: [],
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
        const manana = sumarDias(hoy, VISPERA_DIAS_ANTES);

        const [
            { data: pendientes, error: errPend },
            { data: deManana, error: errManana },
        ] = await Promise.all([
            supabase
                .from('trabajos_programados')
                .select('id, titulo, fecha, hora_inicio, operarios_necesarios, services:service_id (name), supervisors:supervisor_id (app_user_id), trabajos_operarios (count)')
                .is('anulado_at', null)
                .eq('estado', 'pendiente')
                .gte('fecha', hoy)
                .lte('fecha', sumarDias(hoy, Math.max(...AVISOS_DIAS_ANTES))),
            supabase
                .from('trabajos_programados')
                .select('id, titulo, fecha, hora_inicio, operarios_necesarios, services:service_id (name), supervisors:supervisor_id (app_user_id), trabajos_operarios (employees:employee_id (nombre, apellido))')
                .is('anulado_at', null)
                .eq('estado', 'coordinado')
                .eq('fecha', manana),
        ]);
        if (errPend) throw errPend;
        if (errManana) throw errManana;
        const revisados = (pendientes?.length || 0) + (deManana?.length || 0);

        // Que aviso le toca hoy a cada trabajo.
        //
        // Sin coordinar: el mas cercano a la fecha de los que ya llegaron a su
        // dia. Si el trabajo se cargo tarde (a 5 dias), el de 7 sale igual, ese
        // mismo dia. Si se cargo muy tarde (a 1 dia), sale solo el de 2 y el de
        // 7 queda como omitido.
        //
        // Coordinados para mañana: la vispera.
        const tocan = [];
        for (const t of pendientes || []) {
            const dias = diasEntre(hoy, t.fecha);
            const llegados = AVISOS_DIAS_ANTES.filter((d) => dias <= d);
            if (!llegados.length) continue;
            const actual = Math.min(...llegados);
            tocan.push({ t, dias, tipo: 'coordinar', diasAntes: actual, salteados: llegados.filter((d) => d !== actual) });
        }
        for (const t of deManana || []) {
            tocan.push({ t, dias: VISPERA_DIAS_ANTES, tipo: 'vispera', diasAntes: VISPERA_DIAS_ANTES, salteados: [] });
        }

        if (!tocan.length) return Response.json({ hoy, revisados, avisos: [] });

        // Reclamar los avisos de hoy: insertar y que la base descarte los que
        // ya existen. Solo se manda lo que este insert creo de verdad, asi que
        // si el cron corre dos veces (o dos corridas se pisan), la segunda no
        // encuentra nada nuevo y no manda nada.
        const filas = tocan.flatMap(({ t, diasAntes, salteados }) => [
            { trabajo_id: t.id, fecha_trabajo: t.fecha, dias_antes: diasAntes, estado: 'enviando', intentos: 1, ultimo_error: null },
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

        // Un trabajo esta sin coordinar o coordinado, no las dos cosas: el id
        // alcanza para encontrar que le tocaba.
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
            .lt('intentos', MAX_INTENTOS_AVISO)
            .in('trabajo_id', [...porTrabajo.keys()]);
        if (errFallidos) throw errFallidos;

        for (const f of fallidos || []) {
            const x = porTrabajo.get(f.trabajo_id);
            // Solo si sigue siendo el aviso que corresponde hoy: un "en 7 dias"
            // que fallo no se reintenta cuando ya toca el de 2.
            if (!x || x.t.fecha !== f.fecha_trabajo || x.diasAntes !== f.dias_antes) continue;
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

        if (!aMandar.length) return Response.json({ hoy, revisados, avisos: [] });

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
        for (const { avisoId, t, dias, tipo, diasAntes } of aMandar) {
            const supervisor = t.supervisors?.app_user_id;
            const alSupervisor = supervisoresActivos.has(supervisor) && !operaciones.includes(supervisor)
                ? [supervisor]
                : [];
            const destinatarios = [...operaciones, ...alSupervisor];

            let cambios;
            let r = null;
            try {
                if (!destinatarios.length) {
                    throw new Error('No hay a quién avisarle: no hay usuarios de Operaciones habilitados ni supervisor en el trabajo.');
                }
                // Para coordinar, dos envios porque el mensaje no es el mismo:
                // Operaciones recibe el boton y el supervisor no. La vispera es
                // igual para todos.
                const [rOps, rSup] = await Promise.all(tipo === 'vispera'
                    ? [enviarA(destinatarios, armarAvisoVispera(t)), Promise.resolve({ enviados: 0, fallidos: 0, limpiados: 0 })]
                    : [
                        enviarA(operaciones, armarAvisoCoordinar(t, dias, { paraOperaciones: true })),
                        enviarA(alSupervisor, armarAvisoCoordinar(t, dias, { paraOperaciones: false })),
                    ]);
                r = {
                    enviados: rOps.enviados + rSup.enviados,
                    fallidos: rOps.fallidos + rSup.fallidos,
                    limpiados: rOps.limpiados + rSup.limpiados,
                    error: rOps.error || rSup.error,
                };
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
                tipo,
                dias_antes: diasAntes,
                estado: cambios.estado,
                destinatarios: destinatarios.length,
                dispositivos: r?.enviados || 0,
                limpiados: r?.limpiados || 0,
                error: cambios.ultimo_error || null,
            });
        }

        return Response.json({ hoy, revisados, avisos: resultados });
    } catch (error) {
        console.error('Error en el cron de avisos:', error);
        return Response.json(
            { error: `Falló el cron de avisos: ${error.message || 'error desconocido'}` },
            { status: 500 }
        );
    }
}
