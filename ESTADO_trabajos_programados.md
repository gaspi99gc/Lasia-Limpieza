# Estado: trabajos programados con aviso push

Actualizado el 2026-10-01. El plan completo está en `plan_trabajos_programados.md`.

## Dónde estamos

| Sprint | Qué | Estado |
|---|---|---|
| 1 | Agenda de trabajos, sin push | **EN PRODUCCIÓN** |
| 2 | Service worker, VAPID, suscripciones, botón activar | **EN PRODUCCIÓN y PROBADO** |
| 3 | Cron diario que manda los avisos | **es lo que sigue** |
| 4 | Confirmar desde la notificación + re-aviso | pendiente |
| 5 | Ampliar a otros eventos | pendiente |

El circuito de punta a punta **ya se probó en un celular Android el 2026-10-01**:
permiso, service worker, suscripción guardada, envío y notificación recibida.

- Tabla `push_suscripciones` creada en Supabase.
- Las 3 variables VAPID cargadas en Vercel.
- **Las notificaciones todavía no se mandan solas**: el único envío es el botón
  "Probar", que se manda a uno mismo. Eso es el sprint 3.

## Lo que sigue: Sprint 3

Un cron diario que mire los trabajos `pendiente` con fecha cercana y avise a
Operaciones + el supervisor del servicio. Ver `plan_trabajos_programados.md`.

Vercel Cron en plan Hobby corre **1 vez por día**, con ±59 min de imprecisión.
Para "avisar 7 días antes" alcanza de sobra; precisión al minuto necesita Pro.

`src/lib/push-server.js` ya expone `enviarA(usuarioIds, payload)`, que es lo que
el cron tiene que llamar. Ya borra solas las suscripciones muertas (404/410).

## Tres bugs que costó encontrar (no repetirlos)

Los tres daban el mismo síntoma: el botón parecía no hacer nada.

1. **`/sw.js` estaba protegido por el middleware.** El navegador recibía el
   redirect al login en vez del archivo, no podía registrar el service worker y
   nunca se activaba nada. El service worker TIENE que quedar fuera del
   `matcher`: el navegador lo pide por fuera de la navegación normal y sin
   garantía de mandar la cookie.
2. **Se pedía el permiso ANTES de mirar si el servidor tenía las claves.** El
   usuario aceptaba, el permiso quedaba dado al pedo y recién después abortaba.
   La clave se chequea primero.
3. **La pantalla preguntaba solo al navegador si había suscripción.** Decía
   "activadas" mientras el servidor no tenía ninguna fila, y "Probar" contestaba
   "no hay ningún dispositivo suscripto". Ahora compara el endpoint local contra
   los que devuelve el servidor, y si la suscripción local se hizo con otra
   clave, la da de baja y la rehace.

Además, `navigator.serviceWorker.ready` **no tiene timeout propio**: si el worker
no activa, la promesa no se resuelve nunca y el botón queda en "Activando…" sin
error. Tiene un límite de 10 segundos.

## Para probar en un dispositivo nuevo

**En iPhone es obligatorio agregar la app a la pantalla de inicio** (Compartir →
Agregar a inicio) y abrirla desde ese ícono. Una pestaña de Safari no recibe
nada: lo impone Apple desde iOS 16.4, no es un bug. La pantalla ya explica los
3 pasos cuando detecta el caso. En Android funciona directo desde Chrome.

Después: Trabajos programados → Activar notificaciones → aceptar → Probar.

## Decisiones ya tomadas (no volver a preguntar)

- Avisa a **Operaciones + el supervisor del servicio**.
- Hay que **confirmar "ya lo coordiné"**; si nadie confirma, re-avisa más cerca.
- **Fechas sueltas cargadas a mano**, sin recurrencia automática.
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
que revertirla:
`git checkout HEAD -- src/app/operativo src/components/MainLayout.jsx`

## Archivos del sistema

- `src/app/trabajos/page.js` — la pantalla
- `src/app/api/trabajos-programados/route.js` — GET/POST/PATCH/DELETE(=anular)
- `src/lib/push.js` — lado navegador (permisos, suscripción)
- `src/lib/push-server.js` — `enviarA(usuarioIds, payload)`
- `src/app/api/push/suscribir/route.js` y `src/app/api/push/probar/route.js`
- `src/components/ActivarNotificaciones.jsx`
- `public/sw.js` — service worker (no cachea nada a propósito)
- `src/middleware.js` — OJO: `sw.js` queda fuera del matcher a propósito
- `supabase/migrations/20260928_trabajos_programados.sql` (corrida)
- `supabase/migrations/20260928_push_suscripciones.sql` (corrida)
