# Estado: trabajos programados con aviso push

Actualizado el 2026-10-05. El plan completo está en `plan_trabajos_programados.md`.

## Dónde estamos

| Sprint | Qué | Estado |
|---|---|---|
| 1 | Agenda de trabajos, sin push | **EN PRODUCCIÓN** |
| 2 | Service worker, VAPID, suscripciones, botón activar | **EN PRODUCCIÓN y PROBADO** |
| 3 | Cron diario que manda los avisos | **EN PRODUCCIÓN y PROBADO** (PC y celular, 2026-10-05) |
| 4 | Coordinar eligiendo operarios + historial + estado de avisos | **EN PRODUCCIÓN** (migración corrida y publicado el 2026-10-05) |
| 5 | Aviso del día anterior con quiénes van | **HECHO EN DEV, probado en local. Falta publicar** (no lleva migración) |

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

## Sprint 4: coordinar eligiendo operarios (en producción)

Decidido el 2026-10-05, al ver que los que coordinan son las de Operaciones:

- **Coordinar = elegir qué operarios van**, del legajo (empleados sin fecha de
  baja). El botón dejó de ser un "ya está" sin saber con quién. Se puede:
  - **Guardar sin coordinar**: anota a los que ya confirmaron; el trabajo
    muestra "2 de 3" y los avisos siguen (y dicen "2 de 3 operarios").
  - **Marcar como coordinado**, aunque sean menos de los necesarios.
  - Ya coordinado: cambiar operarios (botón "Operarios") o volver a sin coordinar.
- **La notificación**: a Operaciones le llega con el botón **"Coordinar"**, que
  abre `/trabajos?coordinar=<id>` con ese trabajo listo para elegir. Si la
  sesión venció, el login la devuelve ahí (`/login?volver=…`, solo rutas de la
  propia app). Al supervisor le llega igual pero sin el botón. En iPhone no hay
  botones (Apple no los muestra): tocar la notificación hace lo mismo.
- **Estado de los avisos en cada tarjeta**, en cantidades: "7 días: enviado el
  5/10 a 3 personas (3 dispositivos) · 2 días: sale el 10/10", o en rojo "no
  llegó: …" con el motivo.
- **Historial de cada trabajo** (botón "Historial", lo ve todo el que ve el
  trabajo): alta, cada campo editado (antes → después), operarios que entran y
  salen, cambios de estado y anulación, con quién y cuándo. Tabla
  `trabajos_historial`. Los trabajos cargados antes no tienen sus cambios
  anteriores: muestra el alta y lo aclara.
- **Arreglado**: todo se firmaba "operaciones" o "admin" porque la sesión no
  trae el nombre. Ahora se busca en `app_users` (como en faltas) y queda
  "Silvina Díaz". Lo cargado antes sigue diciendo el rol.
- **Arreglado**: `/trabajos` calculaba "hoy" en UTC y de noche la cuenta
  regresiva quedaba corrida un día.
- La API ya no acepta `estado: 'coordinado'` por PATCH: se coordina por
  `/api/trabajos-programados/coordinar`, que exige al menos un operario.

Publicado el 2026-10-05, con la migración
`20261005_trabajos_operarios_historial.sql` corrida y verificada. Falta ver
llegar el botón "Coordinar" en una notificación real de Operaciones.

## Sprint 5: aviso del día anterior (en dev, falta publicar)

**Para publicar no hace falta migración**: es mergear `dev` en `main` (sección
"Publicar"). Para probarlo: un trabajo coordinado para mañana tiene que
mostrar "Día anterior: sale hoy a las 8 h" y, después del cron, la
notificación "Mañana: …" con quiénes van.


Decidido el 2026-10-05: el sprint 5 es **solo el aviso del día anterior**. Los
avisos de otros módulos interesan pero van más adelante (ver "Pendiente"), y
la repetición automática queda descartada (fechas sueltas, como siempre).

- El mismo cron de las 8, el día anterior a cada trabajo **ya coordinado**,
  les avisa a Operaciones y al supervisor quiénes van:
  `Mañana: Limpieza de vidrios` / `CONS. LACROZE 2252 · Van 2 de 3: Ana Gómez y Pedro Ruiz`.
  Es igual para todos y no tiene botón: ya no hay nada que coordinar.
- Los que siguen sin coordinar no la reciben: a esa altura ya les llegó el
  "⚠ Pasado mañana y sin coordinar".
- Se guarda en `trabajos_avisos` como el aviso de 1 día antes
  (`VISPERA_DIAS_ANTES` en `src/lib/trabajos.js`), con la misma protección
  contra duplicados y los mismos reintentos. **No necesita migración.**
  Por eso `AVISOS_DIAS_ANTES` no puede incluir el 1.
- En la tarjeta: "Día anterior: sale el 06/10" o "enviado el 5/10 a 3
  personas". Si se coordina el mismo día anterior después de las 8, ese día
  ya no sale, y la tarjeta lo dice.

## Ajustes del 2026-10-06 (en dev, falta publicar)

- **Buscar operarios en «Coordinar» pide 3 letras**, como los buscadores de
  servicios. Antes la ventana traía el legajo entero (más de mil personas) al
  abrirse y tardaba. Ahora busca en la base mientras se escribe
  (`/api/trabajos-programados/operarios?q=…`): sin acentos ("nunez" encuentra
  NÚÑEZ), por apellido, nombre o legajo, solo activos, los del servicio
  primero, hasta 25.
- **Hora de inicio del trabajo**, obligatoria al cargarlo (y al editar uno
  viejo que no la tenga). Sale en la tarjeta, en «Coordinar», en los avisos
  («martes 13/10 · 7:00 h») y en el historial cuando cambia.
  **Migración `20261006_trabajos_hora_inicio.sql`: correrla antes de probar
  en localhost y antes de publicar.**
- **Nunca más operarios de los que hacen falta.** Si hacen falta 3, en
  «Coordinar» se eligen 3 y el buscador desaparece; el servidor rechaza más.
  Al editar, no se puede bajar «operarios que hacen falta» por debajo de los ya
  asignados: primero se quita a alguien. Un trabajo viejo con gente de más
  muestra «Sobran N» y no deja guardar hasta quitarlos.
- Al volver a entrar desde «Tu sesión expiró» se vuelve a la misma pantalla
  (el botón «Coordinar» del aviso de las 8 caía en la de inicio).

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
- [x] `/trabajos` calculaba "hoy" en UTC (arreglado en el sprint 4, en dev).
- [ ] **Avisos de otros módulos** con el mismo sistema (interesa, más
      adelante). Candidatos con fecha: pedidos de personal sin cubrir, fin de
      licencias, vacaciones que empiezan, audiencias de casos legales.

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
- **Coordinan las de Operaciones, no los supervisores** (decidido el
  2026-10-05). Las dos reciben todos los avisos y cualquiera de las dos
  confirma. El supervisor sigue recibiendo los mismos avisos, solo para estar
  al tanto: **no** puede marcar "Ya lo coordiné".
- La pantalla de estado (sprint 4) muestra **cantidades** ("le llegó a 3
  personas, 4 dispositivos"), no nombres.
- **Coordinar es elegir los operarios**, solo del legajo. Se puede dar por
  coordinado aunque sean menos de los necesarios: lo deciden ellas.
- **Cada cambio queda en el historial** del trabajo, con quién y cuándo.
- **El día anterior** a un trabajo coordinado les llega a Operaciones y al
  supervisor quiénes van (sprint 5). **Sin repetición automática.**
- **Fechas sueltas cargadas a mano**, sin recurrencia automática.
- **Riesgo principal**: que nadie instale la app. Son 8 personas (2 de
  Operaciones + 6 supervisores) y conviene instalárselas en persona.

## Publicar

Desde el 2026-10-05 **`dev` y `main` tienen lo mismo** salvo lo que todavía no
se publicó: ya no hay que sacar nada a mano. Publicar es mergear `dev` en
`main` y verificar el build antes de subir:

```
git checkout main && git pull origin main
git merge dev
npm run build                 # verificar antes de publicar
git push origin main
```

**`/operativo` vive en la rama `feature/operativo`** (es `dev` tal como estaba
el 2026-10-05, con la pantalla incluida). No está ni en `dev` ni en
producción: la pantalla todavía no la probaron usuarios reales. Las rutas de
API `/api/operativo` sí están en las dos, como siempre.

Para traerla de vuelta a `dev`, revertir el commit que la sacó (devuelve la
pantalla, el menú y los permisos): `git revert 7decdce`.
**No** hacer `git merge dev` sobre `feature/operativo`: trae ese mismo commit y
borra la pantalla también ahí.

## Archivos del sistema

- `src/lib/trabajos.js` — fechas en hora argentina, días de aviso, nombres
- `src/lib/trabajos-server.js` — quién hace la acción (nombre real) e historial
- `src/app/api/trabajos-programados/coordinar/route.js` — elegir operarios
- `src/app/api/trabajos-programados/operarios/route.js` — legajo activo (solo
  Operaciones/admin, sin datos personales)
- `src/app/api/trabajos-programados/historial/route.js`
- `supabase/migrations/20261005_trabajos_operarios_historial.sql` (corrida)
- `supabase/migrations/20261006_trabajos_hora_inicio.sql` (**sin correr**)
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
