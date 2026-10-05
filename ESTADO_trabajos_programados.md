# Estado: trabajos programados con aviso push

Actualizado el 2026-10-05. El plan completo está en `plan_trabajos_programados.md`.

## Dónde estamos

| Sprint | Qué | Estado |
|---|---|---|
| 1 | Agenda de trabajos, sin push | **EN PRODUCCIÓN** |
| 2 | Service worker, VAPID, suscripciones, botón activar | **EN PRODUCCIÓN y PROBADO** |
| 3 | Cron diario que manda los avisos | **EN PRODUCCIÓN y PROBADO** (PC y celular, 2026-10-05) |
| 4 | Confirmar desde la notificación + pantalla de estado | pendiente |
| 5 | Ampliar a otros eventos | pendiente |

El circuito de punta a punta **ya se probó en un celular Android el 2026-10-01**:
permiso, service worker, suscripción guardada, envío y notificación recibida.

- Tabla `push_suscripciones` creada en Supabase.
- Las 3 variables VAPID cargadas en Vercel.
- Desde el 2026-10-05 **los avisos se mandan solos** (sprint 3). Se probó
  corriendo el cron a mano en producción: llegó a la PC y al celular.
- Falta confirmar la primera corrida **automática** (ver "Pendiente").

## Sprint 3: el cron que manda los avisos (en producción)

Todos los días a las **8 de Argentina** (en `vercel.json` dice `0 11 * * *`
porque Vercel usa UTC; en Hobby sale entre las 8:00 y las 8:59) se llama a
`/api/cron/avisos`, que:

1. Busca los trabajos `pendiente`, no anulados, de hoy a 7 días.
2. Les manda **un aviso 7 días antes y otro 2 días antes**. Como solo mira los
   `pendiente`, el de 2 días sale únicamente si nadie marcó "Ya lo coordiné".
   A 2 días o menos el título cambia de tono:
   `⚠ Pasado mañana y sin coordinar: Limpieza de vidrios`.
3. Le llega a **Operaciones** (todos los usuarios con rol `operaciones`
   habilitados) **+ el supervisor elegido en el trabajo**, si está habilitado.
4. Registra cada aviso en `trabajos_avisos` con su resultado.

**El supervisor se elige al cargar el trabajo** (campo nuevo, opcional). Se
decidió así el 2026-10-01 porque el sistema no tiene un supervisor por servicio
confiable: `supervisor_routes` existe pero ninguna pantalla la carga. Sin
supervisor, el aviso le llega solo a Operaciones. Los trabajos que ya estaban
cargados quedan sin supervisor: **hay que editarlos y elegírselo**.

Cómo se comporta en los casos raros (todos probados en local):

- **El cron corre dos veces** (o se pisan dos corridas): no duplica. El aviso se
  "reclama" insertando en `trabajos_avisos`, que tiene
  `UNIQUE (trabajo_id, fecha_trabajo, dias_antes)`; solo manda quien lo insertó.
  Se probó con 5 corridas simultáneas: cada aviso salió una sola vez.
- **Se carga tarde** (a 5 días): sale el de 7 ese mismo día, diciendo "En 5
  días". A 1 día: sale solo el de 2 y el de 7 queda como `omitido`.
- **Se reprograma la fecha**: la fecha nueva genera sus propios avisos.
- **Nadie tiene las notificaciones activadas**: queda `fallido` con el motivo y
  se reintenta en las corridas siguientes, hasta 3 intentos.
- **Suscripción muerta** (410/404): se borra sola (ya lo hacía `enviarA`).
- **Usuario dado de baja** (`login_enabled = false`): no recibe.
- Si queda `enviando`, el envío se cortó a la mitad: no se reintenta solo, para
  no mandarlo dos veces.

Hasta que exista la pantalla de estado (sprint 4), lo que se mandó se mira en
Supabase:

```sql
select t.titulo, a.fecha_trabajo, a.dias_antes, a.estado, a.intentos,
       a.destinatarios, a.dispositivos, a.ultimo_error, a.enviado_at
from trabajos_avisos a join trabajos_programados t on t.id = a.trabajo_id
order by a.created_at desc;
```

## Correr el cron a mano

`CRON_SECRET` está en Vercel (Production, sensible) desde el 2026-10-05. Vercel
lo manda solo en cada llamada del cron; sin él la ruta responde 401 y no manda
nada. El cron **solo corre en producción**: los deploys de `dev` no lo ejecutan
(y además Preview no tiene las variables de Supabase).

Se puede correr las veces que haga falta, no duplica. Manda lo mismo que
mandaría a las 8: los avisos reales que tocan hoy.

```powershell
Invoke-RestMethod -Uri "https://<dominio>/api/cron/avisos" -Headers @{ Authorization = "Bearer <CRON_SECRET>" } | ConvertTo-Json -Depth 5
```

La respuesta dice qué mandó, a cuántos dispositivos y, si falló, por qué.

**No correrlo contra la base real desde localhost**: el `.env.local` apunta a
la base de producción, así que manda avisos reales.

## Pendiente (además del sprint 4)

- [ ] **Confirmar la primera corrida automática** (2026-10-06, entre 8 y 9):
      Vercel → Logs filtrando `/api/cron/avisos`, o la consulta SQL de arriba.
      Hasta el 2026-10-05 solo se corrió a mano.
- [ ] **Anular el trabajo de prueba** si quedó: si no, a 2 días de su fecha le
      llega a Operaciones un "⚠ … sin coordinar" de verdad.
- [ ] **Asignar supervisor a los trabajos cargados antes del 2026-10-05**.
- [ ] **Instalar la app y activar las notificaciones en los 8 celulares**
      (2 de Operaciones + 6 supervisores). Es el riesgo principal.
- [ ] `/trabajos` calcula "hoy" en UTC: después de las 21 la cuenta regresiva
      y el cartel de "sin coordinar" quedan corridos un día.

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

**La suscripción es del usuario que estaba logueado al activar**, no del
dispositivo. "Probar" se manda a uno mismo, pero el cron solo les manda a
Operaciones y al supervisor del trabajo: logueado como admin o RRHH, "Probar"
llega y el aviso del cron no. Si en un dispositivo se cambia de usuario, hay
que tocar Activar de nuevo (la suscripción pasa al usuario nuevo).

En la PC el aviso sale como notificación de Windows (abajo a la derecha y en
el centro de notificaciones, `Win + N`). Necesita el navegador abierto (la
pestaña puede estar cerrada) y las notificaciones de Chrome/Edge habilitadas en
Windows.

## Decisiones ya tomadas (no volver a preguntar)

- Avisa a **Operaciones + el supervisor del servicio**. El supervisor se
  **elige en cada trabajo** (decidido el 2026-10-01).
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

- `vercel.json` — el cron diario
- `src/app/api/cron/avisos/route.js` — lo que corre el cron
- `src/lib/cronAuth.js` — chequeo de `CRON_SECRET` (middleware y ruta)
- `supabase/migrations/20261001_trabajos_avisos.sql` (corrida)

- `src/app/trabajos/page.js` — la pantalla
- `src/app/api/trabajos-programados/route.js` — GET/POST/PATCH/DELETE(=anular)
- `src/lib/push.js` — lado navegador (permisos, suscripción)
- `src/lib/push-server.js` — `enviarA(usuarioIds, payload)`
- `src/app/api/push/suscribir/route.js` y `src/app/api/push/probar/route.js`
- `src/components/ActivarNotificaciones.jsx`
- `public/sw.js` — service worker (no cachea nada a propósito)
- `src/middleware.js` — OJO: `sw.js` queda fuera del matcher a propósito, y
  `/api/cron/` no usa sesión sino `CRON_SECRET`
- `supabase/migrations/20260928_trabajos_programados.sql` (corrida)
- `supabase/migrations/20260928_push_suscripciones.sql` (corrida)
