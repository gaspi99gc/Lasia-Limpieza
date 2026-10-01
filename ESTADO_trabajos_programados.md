# Estado: trabajos programados con aviso push

Actualizado el 2026-10-01. El plan completo está en `plan_trabajos_programados.md`.

## Dónde estamos

| Sprint | Qué | Estado |
|---|---|---|
| 1 | Agenda de trabajos, sin push | **hecho**, en `dev` |
| 2 | Service worker, VAPID, suscripciones, botón activar | **hecho**, en `dev` |
| 3 | Cron diario que manda los avisos | pendiente |
| 4 | Confirmar desde la notificación + re-aviso | pendiente |
| 5 | Ampliar a otros eventos | pendiente |

**Nada de esto está en producción.** `main` no tiene `/trabajos` ni el código de
push: se excluyen a mano en cada publicación (ver abajo).

## Dos cosas bloquean el Sprint 3

1. **Correr `supabase/migrations/20260928_push_suscripciones.sql`** en Supabase.
   Sin la tabla, activar las notificaciones falla.
2. **Probar que llegue la notificación**: entrar a Trabajos programados →
   Activar notificaciones → aceptar el permiso → Probar. Hasta que eso funcione
   no tiene sentido construir el envío automático, porque no habría forma de
   saber si el problema es del cron o del circuito de abajo.

## Decisiones ya tomadas (no volver a preguntar)

- Avisa a **Operaciones + el supervisor del servicio**.
- Hay que **confirmar "ya lo coordiné"**; si nadie confirma, re-avisa más cerca.
- **Fechas sueltas cargadas a mano**, sin recurrencia automática.

## Cosas ya investigadas (no volver a investigar)

- **iOS**: desde 16.4 se puede, pero SOLO con la app agregada a la pantalla de
  inicio. Una pestaña de Safari no recibe nada. `ActivarNotificaciones` ya
  detecta el caso y muestra los 3 pasos.
- **Vercel Cron en plan Hobby**: corre **1 vez por día**, con ±59 min de
  imprecisión. Para "avisar 7 días antes" alcanza de sobra.
- **Riesgo principal**: que nadie instale la app. Son 8 personas (2 de
  Operaciones + 6 supervisores) y conviene instalárselas en persona.

## ANTES de publicar push a producción

Cargar a mano en Vercel (Settings → Environment Variables) las tres variables
VAPID que están en `.env.local`, y **redeployar**. Sin eso el envío falla en
producción aunque ande en local: `.env.local` no se sube al repo.

Los valores están en `.env.local`. **La privada no va al repo ni a un chat.**

## Cómo publicar algo mientras esto siga en dev

`/operativo` y `/trabajos` **no van a producción todavía**. Entonces NO mergear
`dev` → `main`. En su lugar:

```
git checkout main
git cherry-pick <commit>      # solo lo que sí va
npm run build                 # verificar
git push origin main
git checkout dev
git merge main                # resolver el conflicto de middleware.js
```

Ese merge de vuelta **da conflicto en `src/middleware.js`** (main no tiene
`/operativo` ni `/trabajos` en `ALLOWED_PREFIXES_BY_ROLE`) y además intenta
borrar `src/app/operativo/page.js` y pisar `MainLayout.jsx`. Resolver quedándose
con la versión de dev: `git checkout HEAD -- <archivos>`.

## Archivos del sistema

- `src/app/trabajos/page.js` — la pantalla
- `src/app/api/trabajos-programados/route.js` — GET/POST/PATCH/DELETE(=anular)
- `src/lib/push.js` — lado navegador (permisos, suscripción)
- `src/lib/push-server.js` — `enviarA(usuarioIds, payload)`
- `src/app/api/push/suscribir/route.js` y `src/app/api/push/probar/route.js`
- `src/components/ActivarNotificaciones.jsx`
- `public/sw.js` — service worker (no cachea nada a propósito)
- `supabase/migrations/20260928_trabajos_programados.sql` (ya corrida)
- `supabase/migrations/20260928_push_suscripciones.sql` (**PENDIENTE**)
