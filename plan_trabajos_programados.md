# Trabajos programados con aviso anticipado

Plan para cargar trabajos especiales (limpieza de vidrios, tanques, pisos) con
fecha, servicio y cantidad de operarios, y que el sistema avise por notificación
push unos días antes para que nadie se olvide de coordinarlos.

---

## 1. El problema

Hoy estos trabajos se acuerdan con el cliente y quedan en la cabeza de alguien
(o en un WhatsApp). El riesgo no es no saber hacerlos: es **llegar a la fecha sin
haber conseguido a los 3 operarios**, porque nadie se acordó con tiempo.

Lo que hace falta no es un calendario más — es un **recordatorio que persiga**
hasta que alguien diga "ya lo coordiné".

## 2. Decisiones ya tomadas

| Tema | Decisión |
|---|---|
| Quién recibe el aviso | **Operaciones** (las 2) + **el supervisor del servicio** |
| Qué pasa al recibirlo | Hay que confirmar: **"ya lo coordiné"** |
| Si nadie confirma | El sistema **vuelve a avisar** más cerca de la fecha |
| Cómo se cargan | **Fechas sueltas, a mano**. Sin recurrencia automática |

## 3. Qué encontré investigando

**Cómo lo resuelven en el rubro** (ServiceTitan, Jobber, Servgrow): el patrón es
siempre el mismo — el trabajo se agenda, el sistema avisa al equipo, y los
cambios de agenda re-notifican. Nada exótico; lo valioso es la **confirmación**,
que es lo que convierte un aviso en un seguimiento.

**La restricción de iOS** (confirmada, y es la que condiciona todo): desde iOS
16.4 se pueden mandar push a una web app, **pero solo si está agregada a la
pantalla de inicio**. Una pestaña abierta en Safari no recibe nada. En Android y
escritorio funciona con el navegador normal.

**Vercel Cron en plan Hobby**: corre **una vez por día** y con ±59 minutos de
imprecisión. Para "avisar 7 días antes" alcanza de sobra. Si algún día hiciera
falta precisión de minutos, hay que pasar a Pro.

**Referencia técnica**: el proyecto `nothing-slips` resuelve los problemas
difíciles de un scheduler de recordatorios (idempotencia, ticks superpuestos,
avisos atrasados). Vale la pena copiarle tres ideas concretas:
- **Idempotencia por índice único**, no por lógica: si el cron corre dos veces,
  el segundo insert no hace nada. Es la diferencia entre "no debería duplicar" y
  "no puede duplicar".
- **Estados explícitos** del aviso (pendiente → enviado → confirmado), para poder
  responder "¿por qué no llegó?".
- **410 = borrar la suscripción**: cuando el navegador devuelve ese código, esa
  suscripción murió (desinstalaron la app, limpiaron datos) y hay que sacarla o
  el sistema intenta para siempre.

## 4. La app ya tiene la mitad del camino hecho

- `public/manifest.json` existe y tiene `display: standalone` → **la app ya es
  instalable**. No hay que construir la PWA desde cero.
- Los 6 supervisores tienen usuario en el sistema → se les puede notificar.
- Operaciones son 2 personas conocidas (Silvina Díaz y Gabriela García).
- 164 servicios cargados con nombre y dirección.

**Lo que falta**: service worker, tabla de suscripciones, claves VAPID, y el cron.

## 5. Modelo de datos

Tres tablas. La clave del diseño es que **el trabajo y el aviso son cosas
separadas**: un trabajo puede tener varios avisos (7 días antes, 2 días antes),
y hay que poder responder "¿este aviso salió?" sin mirar el trabajo.

```
trabajos_programados
  id, service_id, titulo, descripcion
  fecha                      cuándo se hace
  operarios_necesarios       cuántos hacen falta
  estado                     pendiente | coordinado | hecho | cancelado
  coordinado_por, coordinado_at
  creado_por, created_at
  anulado_at, anulado_por    (borrar = anular, como en faltas y uniformes)

trabajos_avisos
  id, trabajo_id
  dias_antes                 7, 2, ...
  programado_para            fecha calculada del envío
  estado                     pendiente | enviado | fallido
  enviado_at, intentos, ultimo_error
  UNIQUE (trabajo_id, dias_antes)      <- la idempotencia va acá

push_suscripciones
  id, app_user_id
  endpoint (UNIQUE), p256dh, auth
  user_agent, created_at, ultimo_uso_at
```

**Por qué `UNIQUE (trabajo_id, dias_antes)`**: si el cron se ejecuta dos veces el
mismo día —cosa que pasa— el segundo intento choca contra el índice y no manda
nada. Sin eso, el aviso duplicado es cuestión de tiempo.

## 6. Cómo funciona, de punta a punta

```
1. Operaciones carga el trabajo
   "Limpieza de vidrios · CONS. LACROZE 2252 · 15/10 · 3 operarios"
   El sistema crea los avisos: uno a 7 días (08/10), otro a 2 días (13/10)

2. Todos los días a las 8am, el cron pregunta:
   ¿hay avisos con programado_para <= hoy y estado = pendiente?

3. Por cada uno:
   - Busca a quién notificar: Operaciones + el supervisor de ese servicio
   - Busca sus suscripciones push
   - Manda la notificación
   - Marca el aviso como enviado

4. Llega al celular:
   🔔 En 7 días: limpieza de vidrios
      CONS. LACROZE 2252 · 3 operarios
      [ Ya lo coordiné ]

5. Si alguien toca "Ya lo coordiné":
   El trabajo pasa a estado = coordinado
   Los avisos que quedaban se cancelan

6. Si nadie confirma:
   El aviso de 2 días sale igual, con otro tono:
   ⚠ PASADO MAÑANA y sin coordinar: vidrios en LACROZE 2252
```

## 7. Los sprints

Cada uno deja algo funcionando y verificable. No se arranca el siguiente sin
probar el anterior en el local.

### Sprint 1 — El trabajo, sin notificaciones
*Que se puedan cargar y ver los trabajos. Sin push todavía.*

- Migración: `trabajos_programados` (RLS + los 3 GRANT de siempre)
- `/api/trabajos-programados` (GET, POST, PATCH, DELETE=anular)
- Pantalla `/trabajos`: lista, alta, editar, marcar como coordinado
- Sidebar para admin, operaciones y supervisor
- **Verificable**: cargar un trabajo real, verlo en la lista, confirmarlo

Esto ya sirve solo, aunque nunca llegue una push: es la agenda de trabajos
especiales, que hoy no existe en ningún lado.

### Sprint 2 — Que el celular pueda recibir
*La plomería del push, sin usarla todavía.*

- Service worker (`public/sw.js`) y su registro
- Migración `push_suscripciones`
- Claves VAPID (variables de entorno) e instalar `web-push`
- `/api/push/suscribir` y `/api/push/probar`
- Botón "Activar notificaciones" en la configuración del usuario, con
  instrucciones distintas para iPhone (hay que agregar a la pantalla de inicio
  primero) y para Android/PC
- **Verificable**: activar en tu celular y que llegue una push de prueba

### Sprint 3 — El envío automático
*Unir las dos mitades.*

- Migración `trabajos_avisos`
- `vercel.json` con el cron diario
- `/api/cron/avisos`: busca pendientes, manda, marca. Protegido con secreto
- Manejo de 410: borrar la suscripción muerta
- Supervisor elegido en el trabajo (no hay un supervisor por servicio confiable)
- Segundo aviso a 2 días con tono de urgencia si sigue sin coordinar (se adelantó
  del sprint 4: es el mismo cron)
- **Verificable**: cargar un trabajo para dentro de 7 días, correr el cron a
  mano y ver que llega

### Sprint 4 — El seguimiento
*Que el aviso persiga.*

- Botón "Coordinar" en la notificación de Operaciones: abre el trabajo para
  elegir los operarios (el supervisor la recibe sin botón)
- Coordinar = elegir qué operarios van, del legajo (se adelantó del "fuera de
  alcance": decidido el 2026-10-05)
- Historial de cambios de cada trabajo
- Estado de los avisos en cada trabajo: qué se mandó, a cuántos, si llegó
- **Verificable**: tocar "Ya lo coordiné" en la notificación lo marca como
  coordinado y el aviso de 2 días ya no sale

### Sprint 5 — El día anterior
- Aviso del día anterior a los trabajos coordinados, a Operaciones y al
  supervisor, con quiénes van (hecho)
- Otros tipos de evento, no solo trabajos: interesa, más adelante
- Repetición automática: descartada (decidido el 2026-10-05)

## 8. Riesgos, dichos de frente

**El más probable: que nadie instale la app.** En iPhone hay que agregarla a la
pantalla de inicio *y después* aceptar el permiso. Son dos pasos que la gente no
hace sola. Mitigación: instalárselo vos a Operaciones y a los supervisores en
persona, que son 8 personas.

**El silencioso: que la push se mande y nadie la vea.** Si el celular está en
silencio o la notificación se va entre 40 de WhatsApp, el aviso no sirvió. Por
eso el Sprint 1 va primero: la lista dentro de la app funciona aunque el push
falle, y es la red de seguridad.

**El de siempre: suscripciones que mueren.** Cambian de celular, reinstalan,
limpian datos. Sin el manejo del 410 el sistema queda intentando mandar a
fantasmas. Va en el Sprint 3, no después.

**Lo que NO es un riesgo**: el costo. Web Push es gratis y el cron de Vercel
entra en el plan actual.

## 9. Fuera de alcance

- Notificaciones por WhatsApp o mail (otro camino, otro costo)
- App nativa en las tiendas
- Recurrencia automática
