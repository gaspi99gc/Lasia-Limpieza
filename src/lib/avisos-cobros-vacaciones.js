import { supabase } from '@/lib/db';
import { enviarA } from '@/lib/push-server';
import { MAX_INTENTOS_AVISO, diasEntre, sumarDias } from '@/lib/trabajos';
import { nombreCobro } from '@/lib/quincenas-vacaciones';

// "La semana que viene cobran vacaciones": el recordatorio que pidió el usuario
// el 2026-11-02. Corre dentro del cron diario de las 8 (/api/cron/avisos),
// separado de trabajos y vencimientos: si una parte falla, las otras salen.
//
// Un aviso por quincena de cobro (el 1 o el 16), 7 días antes, con la lista de
// quiénes cobran. Solo los cobros aprobados y de gente que sigue trabajando.
// Le llega a admin y RRHH. Mismo mecanismo que los otros avisos: se "reclama"
// insertando en vacaciones_cobros_avisos (UNIQUE fecha + días antes) para que
// nunca salga dos veces, y si no llegó a nadie se reintenta.

const DIAS_ANTES = 7;
const ENVIANDO_VENCE_MIN = 15;
const ROLES_AVISO = ['admin', 'rrhh'];

function armarAviso(fecha, cobros, dias) {
    const [, m, d] = fecha.split('-');
    const cuando = dias <= 1 ? 'Mañana' : dias <= 2 ? 'Pasado mañana' : 'La semana que viene';
    const lista = cobros.map((c) => `${c.apellido} ${c.cantidad} días`);
    const cuerpo = lista.length > 6 ? `${lista.slice(0, 6).join(' · ')} y ${lista.length - 6} más` : lista.join(' · ');
    return {
        titulo: `${cuando} cobran vacaciones (${cobros.length}) · ${d}/${m}`,
        cuerpo: `${nombreCobro(fecha)}: ${cuerpo}`,
        url: '/vacaciones?tab=aprobadas',
        acciones: [],
        tag: `cobros-vacaciones-${fecha}`,
        requiereAccion: true,
    };
}

export async function avisosCobrosVacaciones(hoy) {
    const vence = new Date(Date.now() - ENVIANDO_VENCE_MIN * 60 * 1000).toISOString();
    const recuperar = () => supabase
        .from('vacaciones_cobros_avisos')
        .update({ estado: 'fallido', ultimo_error: 'El envío se cortó a la mitad.' })
        .eq('estado', 'enviando');
    const [{ error: errA }, { error: errB }] = await Promise.all([
        recuperar().lt('enviado_at', vence),
        recuperar().is('enviado_at', null).lt('created_at', vence),
    ]);
    if (errA) throw errA;
    if (errB) throw errB;

    const { data: cobros, error } = await supabase
        .from('vacaciones_movimientos')
        .select('fecha_cobro, cantidad, employees:employee_id (apellido, estado_empleado)')
        .eq('tipo', 'pagado')
        .eq('estado', 'aprobado')
        .is('anulado_at', null)
        .gt('fecha_cobro', hoy)
        .lte('fecha_cobro', sumarDias(hoy, DIAS_ANTES));
    if (error) throw error;

    const porFecha = new Map();
    for (const c of cobros || []) {
        if (c.employees?.estado_empleado === 'Baja') continue;
        const lista = porFecha.get(c.fecha_cobro) || [];
        lista.push({ apellido: c.employees?.apellido || '?', cantidad: c.cantidad });
        porFecha.set(c.fecha_cobro, lista);
    }
    if (!porFecha.size) return { revisados: 0, avisos: [] };

    const fechas = [...porFecha.keys()];
    const tomadoAt = new Date().toISOString();
    const { data: creados, error: errCrear } = await supabase
        .from('vacaciones_cobros_avisos')
        .upsert(fechas.map((f) => ({ fecha_cobro: f, dias_antes: DIAS_ANTES, estado: 'enviando', intentos: 1, enviado_at: tomadoAt })),
            { onConflict: 'fecha_cobro,dias_antes', ignoreDuplicates: true })
        .select('id, fecha_cobro, estado');
    if (errCrear) throw errCrear;
    const aMandar = (creados || []).filter((a) => a.estado === 'enviando').map((a) => ({ avisoId: a.id, fecha: a.fecha_cobro }));

    // Reintentos de los que no llegaron a nadie.
    const { data: fallidos, error: errF } = await supabase
        .from('vacaciones_cobros_avisos')
        .select('id, fecha_cobro, intentos')
        .eq('estado', 'fallido')
        .lt('intentos', MAX_INTENTOS_AVISO)
        .in('fecha_cobro', fechas);
    if (errF) throw errF;
    for (const f of fallidos || []) {
        const { data: tomado } = await supabase
            .from('vacaciones_cobros_avisos')
            .update({ estado: 'enviando', intentos: f.intentos + 1, enviado_at: tomadoAt })
            .eq('id', f.id).eq('estado', 'fallido').eq('intentos', f.intentos)
            .select('id');
        if (tomado?.length) aMandar.push({ avisoId: f.id, fecha: f.fecha_cobro });
    }
    if (!aMandar.length) return { revisados: porFecha.size, avisos: [] };

    const { data: usuarios, error: errU } = await supabase
        .from('app_users').select('id').in('role', ROLES_AVISO).eq('login_enabled', true);
    if (errU) throw errU;
    const destinatarios = (usuarios || []).map((u) => u.id);

    const resultados = [];
    for (const { avisoId, fecha } of aMandar) {
        let cambios;
        let r = null;
        try {
            if (!destinatarios.length) throw new Error('No hay usuarios de RRHH ni admin habilitados.');
            r = await enviarA(destinatarios, armarAviso(fecha, porFecha.get(fecha) || [], diasEntre(hoy, fecha)));
            if (r.error) throw new Error(r.error);
            cambios = r.enviados > 0
                ? { estado: 'enviado', enviado_at: new Date().toISOString(), destinatarios: destinatarios.length, dispositivos: r.enviados, ultimo_error: r.fallidos ? `${r.fallidos} dispositivo(s) no lo recibieron.` : null }
                : { estado: 'fallido', destinatarios: destinatarios.length, dispositivos: 0, ultimo_error: r.fallidos ? 'El servicio de notificaciones rechazó todos los envíos.' : 'Nadie tiene las notificaciones activadas.' };
        } catch (e) {
            cambios = { estado: 'fallido', ultimo_error: e?.message || String(e) };
        }
        const { error: errMarcar } = await supabase.from('vacaciones_cobros_avisos').update(cambios).eq('id', avisoId);
        if (errMarcar) console.error('No se pudo marcar el aviso de cobros', avisoId, errMarcar.message);
        resultados.push({ fecha_cobro: fecha, cobran: (porFecha.get(fecha) || []).length, estado: cambios.estado, dispositivos: r?.enviados || 0, error: cambios.ultimo_error || null });
    }
    return { revisados: porFecha.size, avisos: resultados };
}
