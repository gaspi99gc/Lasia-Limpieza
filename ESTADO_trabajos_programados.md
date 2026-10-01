# Estado: trabajos programados con aviso push

Actualizado el 2026-10-01. El plan completo está en `plan_trabajos_programados.md`.

## Dónde estamos

| Sprint | Qué | Estado |
|---|---|---|
| 1 | Agenda de trabajos, sin push | **EN PRODUCCIÓN** |
| 2 | Service worker, VAPID, suscripciones, botón activar | **EN PRODUCCIÓN** |
| 3 | Cron diario que manda los avisos | pendiente |
| 4 | Confirmar desde la notificación + re-aviso | pendiente |
| 5 | Ampliar a otros eventos | pendiente |

La tabla `push_suscripciones` ya está creada en Supabase.

**Las notificaciones todavía no se mandan solas**: eso es el sprint 3. Por ahora
el único envío es el botón "Probar", que se manda a uno mismo.

## Antes de que funcione en producción

Las **3 variables VAPID** tienen que estar cargadas en Vercel (Settings →
Environment Variables) y hace falta un **redeploy** para que las tome:

    NEXT_PUBLIC_VAPID_PUBLIC_KEY
    VAPID_PRIVATE_KEY
    VAPID_SUBJECT

Los valores están en `.env.local`, que no se sube al repo. Si faltan, el botón
"Probar" devuelve "Faltan las claves VAPID en el servidor".

## Para probar en el celular

1. Abrir la app en el celular.
2. **En iPhone es obligatorio agregarla a la pantalla de inicio** (Compartir →
   Agregar a inicio) y abrirla desde ese ícono. Una pestaña de Safari no recibe
   nada: lo impone Apple, no es un bug. La pantalla ya explica los 3 pasos.
3. Trabajos programados → Activar notificaciones → aceptar el permiso → Probar.

## Decisiones ya tomadas (no volver a preguntar)

- Avisa a **Operaciones + el supervisor del servicio**.
- Hay que **confirmar "ya lo coordiné"**; si nadie confirma, re-avisa más cerca.
- **Fechas sueltas cargadas a mano**, sin recurrencia automática.

## Cosas ya investigadas (no volver a investigar)

- **iOS**: desde 16.4 se puede, pero SOLO con la app en la pantalla de inicio.
- **Vercel Cron en plan Hobby**: corre **1 vez por día**, ±59 min de imprecisión.
  Para "avisar 7 días antes" alcanza de sobra.
- **Riesgo principal**: que nadie instale la app. Son 8 personas (2 de
  Operaciones + 6 supervisores) y conviene instalárselas en persona.

## Publicar sin que se cuele /operativo

`/trabajos` YA va a producción. `/operativo` **no**: la pantalla todavía no la
probaron usuarios reales. Al mergear `dev` → `main` hay que sacarla a mano:

```
git checkout main && git merge dev --no-commit --no-ff
sed -i "/{ href: '\/operativo', label: 'Operativo'/d" src/components/MainLayout.jsx
sed -i "s|, '/operativo'||g" src/middleware.js
git rm -r -f --quiet src/app/operativo
npm run build                 # verificar antes de publicar
git add -A src/ && git commit && git push origin main
```

Después, al volver a `dev`, ese merge trae la eliminación de `/operativo` y hay
que revertirla: `git checkout HEAD -- src/app/operativo src/components/MainLayout.jsx src/middleware.js`.

## Archivos del sistema

- `src/app/trabajos/page.js` — la pantalla
- `src/app/api/trabajos-programados/route.js` — GET/POST/PATCH/DELETE(=anular)
- `src/lib/push.js` — lado navegador (permisos, suscripción)
- `src/lib/push-server.js` — `enviarA(usuarioIds, payload)`
- `src/app/api/push/suscribir/route.js` y `src/app/api/push/probar/route.js`
- `src/components/ActivarNotificaciones.jsx`
- `public/sw.js` — service worker (no cachea nada a propósito)
- `supabase/migrations/20260928_trabajos_programados.sql` (corrida)
- `supabase/migrations/20260928_push_suscripciones.sql` (corrida)
