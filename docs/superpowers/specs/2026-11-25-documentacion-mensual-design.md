# Documentación mensual (ex Vencimientos): diseño

**Fecha:** 2026-11-25
**Estado:** aprobado por el usuario el 2026-11-25. Implementado en `dev` el mismo día (ver "Implementación" al final).
**Base:** [2026-10-26-vencimientos-rrhh-design.md](2026-10-26-vencimientos-rrhh-design.md) (lo que hoy está en producción)

## Para qué

Hoy `/vencimientos` (admin y RRHH) lista la documentación que se presenta todos los meses a los clientes. Son 11, todas mensuales:

- 4 FAO de Zara: TOM, BULL, UNI, AVE.
- 4 de WeWork: Butty, Vte López, Corrientes, Blas Parera.
- 2 de posibles reemplazos de WeWork.
- 1 de Paolini.

Cada una tiene una fecha. Avisa por push 7 días antes, 2 días antes y el mismo día. Al marcarla "Hecho" pasa sola al mes siguiente.

Lo que falta es **quiénes van en cada documentación**. El cliente solo deja entrar a la gente documentada. La nómina no es toda la gente del servicio: también entran los posibles reemplazos, que se documentan de antemano para tenerlos autorizados.

Hoy esa lista no está en la app. La arman Operaciones y la jefa operativa, que son las que saben a quién mandan a cada servicio. La documentación la manda el usuario (admin) o RRHH.

## Qué decidió el usuario

1. **Nombre.** La pantalla se llama **Documentación mensual**.
2. **Quién la ve.** Además de admin y RRHH, la ven **Operaciones** (rol `operaciones`) y la **jefa operativa** (rol `jefe_operativo`).
3. **Nómina por documentación.** Cada documentación se abre y adentro tiene **su propia nómina**. Son servicios distintos, y un mismo operario puede estar en varias.
4. **Quién arma la nómina.** Operaciones y la jefa operativa, eligiendo a mano. No sale del operativo.
5. **Datos de cada persona.** Apellido, nombre y **DNI**, conectados al legajo. No va el "también está en…".
6. **El legajo no muestra nada nuevo.**
7. **Un solo "Hecho" por documentación.** La documentación se manda con la nómina completa a la vez, no de a uno. Al marcar "Hecho" pasa sola al mes siguiente, como hoy.
8. **No hay pestaña de Hechos.** Si no se hace, se nota porque la gente no puede entrar a trabajar.
9. **Registro oculto.** Se guarda quién marcó "Hecho" y cuándo, sin mostrarlo, por si algún día se necesita.
10. **Quién manda.** Admin o RRHH mandan la documentación y marcan "Hecho".
11. **Agregar a mitad de mes.** Se puede agregar gente en cualquier momento. Quien no entró en el último envío aparece como **pendiente**.
12. **Sin urgencias en la app.** No hay marca de urgencia ni aviso al agregar gente: si es urgente se avisa por WhatsApp, y en la app se maneja normal.
13. **Enfoque A** (ver abajo): se suma a lo que ya existe y no se arma un módulo nuevo.
14. **Primera carga desde Excel.** El usuario pasa los Excel de las nóminas y se cargan por script, sin que Operaciones las tipee. Primero Zara (`NOMINAS ZARA.xlsx`) y después WeWork, con el mismo proceso. Lo que se carga así ya está documentado, así que **no** queda como pendiente.
15. **El DNI siempre está.** Todos los de la nómina salen de gente cargada en el legajo. Verificado el 2026-11-25: de 326 activos, 0 sin DNI.

## Propuestas mías

El usuario las vio y no las objetó. Si alguna no va, se saca.

- **Snapshot en el registro oculto.** Cada envío guarda también la foto de quiénes estaban en la nómina (apellido, nombre, DNI). Así se puede responder "¿a quién se documentó en noviembre para Zara TOM?" aunque la nómina haya cambiado.
- **Botón "Ya la mandé".** Admin y RRHH lo usan para los pendientes que se mandaron sueltos a mitad de mes. Marca como enviados a todos los pendientes de esa documentación y **no** mueve la fecha. Queda en el registro oculto como envío parcial.
- **Permisos de Operaciones y la jefa operativa.** Ven todo y arman la nómina: agregar y sacar. **No** crean documentaciones, no cambian fechas, no marcan "Hecho" ni "Ya la mandé" y no borran.
- **Bajas.** Cuando alguien se da de baja en el legajo, sale solo de todas las nóminas. El registro oculto conserva que estuvo.
- **Excel.** Botón para bajar la nómina en Excel, con apellido, nombre y DNI, por si hay que pasarla a lo que se manda al cliente.

## Enfoques considerados

- **A. Sumar la nómina a las tablas actuales** (elegido por el usuario). Se mantienen `rrhh_vencimientos` y compañía y se agregan dos tablas: la nómina y el registro de envíos. En pantalla todo pasa a llamarse Documentación mensual. Las 11 documentaciones, sus fechas, sus avisos y la tarjeta del inicio siguen andando sin migrar nada. Contra: el nombre interno sigue siendo "vencimientos", pero solo se ve en el código.
- **B. Módulo nuevo con tablas nuevas y migrar lo existente.** Los nombres quedan más prolijos, pero obliga a pasar los datos y reescribir el cron y la tarjeta del inicio. Es más riesgo sin nada visible a cambio. Descartado.
- **C. Atar la nómina al servicio.** Descartado: "POSIBLES REEMPLAZOS WE WORK BUTTY / CORRIENTES" abarca dos servicios, y los reemplazos no son gente fija de ningún servicio. La nómina es de la documentación, no del servicio.

## Datos

Una migración nueva, `supabase/migrations/2026112X_documentacion_nomina.sql`, idempotente como la del 26/10.

### `rrhh_vencimientos_nomina`

Una fila por persona en una documentación.

| columna | tipo | |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `vencimiento_id` | BIGINT → `rrhh_vencimientos(id)` ON DELETE CASCADE | |
| `employee_id` | BIGINT → `employees(id)` | |
| `agregado_por` | TEXT | nombre del usuario, sale de la sesión (como `quienEs()`) |
| `agregado_at` | TIMESTAMPTZ DEFAULT now() | |
| `enviado_at` | TIMESTAMPTZ NULL | NULL = **pendiente** |
| `quitado_at` | TIMESTAMPTZ NULL | borrar es anular, como en el resto del sistema |
| `quitado_por` | TEXT | usuario, o `'Baja del legajo'` |

- Índice único parcial `(vencimiento_id, employee_id) WHERE quitado_at IS NULL`: la misma persona no puede estar dos veces en la misma nómina.
- Sí puede estar en varias nóminas.
- Si se saca a alguien y se lo vuelve a agregar, es una fila nueva y vuelve a quedar pendiente.

### `rrhh_vencimientos_envios`

El registro oculto. No se muestra en ninguna pantalla.

| columna | tipo | |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `vencimiento_id` | BIGINT → `rrhh_vencimientos(id)` ON DELETE CASCADE | |
| `tipo` | TEXT CHECK IN (`'mensual'`, `'parcial'`, `'inicial'`) | `mensual` = "Hecho", `parcial` = "Ya la mandé", `inicial` = la carga desde el Excel |
| `fecha_vencimiento` | DATE | la fecha que tenía la documentación en ese momento |
| `enviado_por` | TEXT | |
| `enviado_at` | TIMESTAMPTZ DEFAULT now() | |
| `nomina` | JSONB | `[{ employee_id, apellido, nombre, dni }]`: en `mensual` la nómina completa, en `parcial` solo los que se mandaron |

- `rrhh_vencimientos_hechos` queda como está. Su UNIQUE es lo que frena el doble clic en "Hecho", y el envío `mensual` se graba **después** de que ese insert pasó.
- Ambas tablas llevan RLS activado y GRANT a `service_role`, como todas (ver la migración del 26/10).
- Si se crea alguna función en la base, hay que volver a correr `20261112_cerrar_funciones_publicas.sql`.

## Reglas

- **Pendiente.** Una persona está pendiente cuando su fila tiene `quitado_at` y `enviado_at` en NULL.
- **"Hecho"** (admin y RRHH). Hace lo mismo que hoy: inserta en `_hechos` y avanza la fecha. Además:
  1. A todas las filas vigentes de esa documentación les pone `enviado_at = now()` si lo tenían en NULL.
  2. Graba un envío `mensual` con el snapshot de la nómina vigente.
  3. Si el doble clic se frena con 409, nada de esto se repite.
- **"Ya la mandé"** (admin y RRHH). Pone `enviado_at = now()` en las filas pendientes de esa documentación y graba un envío `parcial` con solo esas personas. No toca la fecha ni `_hechos`. Si no hay pendientes, el botón no aparece.
- **Bajas.**
  - Una persona está "dada de baja" si `employees.estado_empleado <> 'Activo'` o si `employees.fecha_baja` tiene valor.
  - Al leer una nómina, sus filas vigentes se marcan `quitado_at = now()` y `quitado_por = 'Baja del legajo'`. Esa limpieza se hace al leer y no en cada lugar donde se da de baja, porque esos lugares son varios (pantalla del legajo, scripts de bajas). Así no se escapa ninguno.
  - Con la fila ya quitada, si la persona reingresa no vuelve sola a la nómina.
- **Agregar.**
  - Solo operarios activos.
  - Si la persona ya está en esa nómina, se responde un error claro y no se agrega dos veces.
- **Borrar una documentación** (anular, como hoy). Su nómina queda en la base y deja de verse.
- **Los avisos al celular no cambian.** Les llegan a los responsables elegidos, que siguen siendo solo admin y RRHH. Operaciones y la jefa operativa no reciben avisos, y agregar gente no avisa a nadie.

## Permisos

En `src/lib/vencimientos.js`, `ROLES_VENCIMIENTOS` se divide en tres:

| constante | roles | para |
|---|---|---|
| `ROLES_VER` | admin, rrhh, operaciones, jefe_operativo | ver la lista, el detalle y la nómina; bajar el Excel |
| `ROLES_NOMINA` | admin, rrhh, operaciones, jefe_operativo | agregar y sacar personas |
| `ROLES_GESTION` | admin, rrhh | crear, editar, "Hecho", "Ya la mandé", borrar; los únicos que pueden ser responsables de los avisos |

- **Middleware** (`src/middleware.js`): el prefijo `/api/vencimientos` pasa a `ROLES_VER`. Cada ruta corta la escritura por su cuenta, como hace `/api/trabajos-programados`. Además se agrega `/vencimientos` a `operaciones` y `jefe_operativo` en `ALLOWED_PREFIXES_BY_ROLE`.
- **Menú** (`MainLayout.jsx`): "Vencimientos" pasa a llamarse "Documentación mensual" en admin y RRHH, y se agrega la entrada para operaciones (en su grupo "Operaciones") y para la jefa operativa (en su grupo "RRHH"). También cambia el título de la pestaña del navegador (línea ~568).

## Pantallas

### Lista: `/vencimientos`

- El título pasa a **Documentación mensual**.
- **Se saca la pestaña Hechos.** El GET `?hechos=1` puede quedar o borrarse; nadie lo usa.
- Las filas siguen como hoy: grupos Vencidos / Esta semana / Más adelante, la hoja de la fecha y los avisos que salieron.
- Cada fila suma:
  - Un contador de la nómina: "8 en la nómina".
  - Si hay pendientes, un "2 pendientes" en ámbar.
- Tocar el título (o la fila) abre el detalle.
- Para Operaciones y la jefa operativa no aparecen "+ Nuevo", "✓ Hecho", "Editar" ni "Borrar".
- Los textos que dicen "vencimiento" pasan a "documentación": vacío, confirmaciones, modal, toasts.

### Detalle: `/vencimientos/[id]` (ruta nueva, mi decisión)

Es una ruta propia y no un modal, para que el Volver del navegador funcione y se pueda pasar el link.

```
← Volver
FAO ZARA TOM                         vence 06/12 · todos los meses
Nómina (9)                          [Bajar Excel]   [+ Agregar]
  GÓMEZ, ANA          DNI 23.456.789                         ✕
  PÉREZ, JUAN         DNI 12.345.678                         ✕
  RÍOS, CARLA         DNI 34.567.890   Pendiente             ✕
                                       agregó Romina el 25/11
  ──────────────────────────────────────────────────────────
  1 pendiente de enviar                         [Ya la mandé]
[✓ Hecho]   Editar
```

- **La nómina.** Ordenada por apellido. Cada fila muestra apellido y nombre, DNI y la ✕ para sacar.
  - Los pendientes llevan además la marca **Pendiente** y quién los agregó y cuándo.
  - Los enviados no muestran fecha de envío: el registro es oculto.
- **"+ Agregar".** Abre el buscador de operarios activos.
  - Reutiliza `src/lib/buscar-operarios.js` y `BuscadorOperario.jsx`.
  - Hoy busca por apellido, nombre o legajo. Para esta pantalla conviene sumar el **DNI**.
  - Quien ya está en la nómina aparece deshabilitado ("ya está").
- **Sacar.** Pide confirmación.
- **"Ya la mandé" y "✓ Hecho".** Solo admin y RRHH. "Hecho" usa la misma confirmación de hoy, más una línea que dice que la nómina completa queda como enviada.
- **Excel.** Columnas Apellido, Nombre y DNI, con nombre de archivo `Nomina FAO ZARA TOM 2026-12.xlsx`. Se baja con `downloadWorkbook` de `src/lib/xlsx-download.js` (nunca `XLSX.writeFile`) y se importa xlsx de forma dinámica.
- **Volver.** Usa `router.back()` con fallback a `/vencimientos`, como el detalle de vacaciones.

### Tarjeta del inicio (`VencimientosSemana.jsx`)

- Sigue siendo solo de admin y RRHH.
- Cambian los textos: "Ver vencimientos" pasa a "Ver documentación".
- Si se toca una línea de documentación, abre su detalle.

### Avisos al celular (`avisos-vencimientos.js`)

- Mismo mecanismo y mismos destinatarios.
- `url` pasa a `/vencimientos/<id>`, para que el aviso abra el detalle de esa documentación.

## API (`/api/vencimientos`)

- **GET (lista).** Para cada documentación suma `nomina_total` y `pendientes`. Es una consulta a `_nomina` agrupada en JS, no N consultas. Los usuarios posibles para responsables solo se mandan a `ROLES_GESTION`.
- **GET `?id=N`.** Devuelve la documentación y su nómina vigente, con `employee_id`, apellido, nombre, DNI, `enviado_at` (solo para saber si está pendiente), `agregado_por` y `agregado_at`. Antes de responder hace la limpieza de bajas.
- **POST, PATCH y DELETE de la documentación.** Igual que hoy, pero con `ROLES_GESTION`. El PATCH `accion: 'hecho'` suma lo de las Reglas.
- **PATCH `accion: 'enviados'`** ("Ya la mandé"). `ROLES_GESTION`.
- **Nómina.** Ruta nueva `/api/vencimientos/nomina`:
  - POST `{ vencimiento_id, employee_id }` para agregar.
  - DELETE `?id=` para sacar (anula).
  - Ambos con `ROLES_NOMINA`.
- **Buscador.** Endpoint que llame a `buscarOperarios`, con `ROLES_NOMINA`. Puede ser `/api/vencimientos/operarios`, como el de trabajos.

## Fuera de alcance

- Mostrar en el legajo en qué documentaciones está alguien.
- El "también está en…" dentro de la nómina.
- Avisos a Operaciones o a la jefa operativa.
- Marca de urgencia.
- Vencimiento de la documentación de cada persona.
- Atar documentaciones a servicios de la app.
- Cambiar el nombre de las tablas o de la URL `/vencimientos`.

## Detalles que resolví yo en la revisión

- **"Hecho" con la nómina vacía.** Se puede marcar igual. Las 11 documentaciones arrancan sin nómina, y no puede trabarse el envío del mes. El snapshot queda como `[]`.
- **Botón de notificaciones.** "Activar notificaciones" no se muestra a Operaciones ni a la jefa operativa, porque no reciben avisos de esta pantalla.
- **Buscar por DNI.** Antes de sumarlo a `buscarOperarios`, verificar el tipo de `employees.dni`: `ilike` no anda sobre columnas numéricas. Si es numérica, comparar por igualdad cuando lo escrito sean solo dígitos.
- **Menú de la jefa operativa.** La entrada va en su grupo "RRHH", junto a Personal.

## Primera carga: Zara

Archivo: `NOMINAS ZARA.xlsx`, en la raíz del repo. Los `.xlsx` están en `.gitignore`, así que **no se commitea**: tiene datos personales.

- **Estructura.**
  - Una hoja por FAO: `ZARA AVE`, `ZARA BULL`, `ZARA TOM`, `ZARA UNI`. Corresponden a las documentaciones 9, 7, 6 y 8 de `rrhh_vencimientos`.
  - La columna A es el DNI. El nombre viene en una o dos columnas según la hoja.
- **Cruce por DNI con `employees`.**
  - En 5 filas (AVE y BULL) la columna "DNI" trae el **CUIL** completo, de 11 dígitos. En esas se usa el DNI del medio (dígitos 3 a 10).
  - Con eso aparecen todos.
- **Resultado del cruce del 2026-11-25** (solo lectura, todavía no se cargó nada):

  | hoja | filas | se cargan | quedan afuera (dados de baja) |
  |---|---|---|---|
  | ZARA AVE | 25 | 24 | Carabajal Karina Gisela (baja 20/11) |
  | ZARA BULL | 36 | 36 | — |
  | ZARA TOM | 31 | 30 | Ramírez Florencia Aldana (baja 19/11) |
  | ZARA UNI | 45 (Orrego Soraya figura dos veces) | 41 | González Silvina Ester (19/11), Chocobar Morena (3/11), Ramírez Florencia Aldana (19/11) |

- **Cómo se carga.**
  - Script en `scripts/` con `--aplicar`, como el de bajas.
  - Sin `--aplicar` solo muestra el cruce.
  - Inserta las filas de nómina con `agregado_por = 'Carga inicial (Excel)'` y `enviado_at` = el momento de la carga, y graba un envío `inicial` por documentación con el snapshot.
  - Si se corre dos veces, no duplica nada (lo frena el índice único).
- **WeWork.** Después, con el mismo script o uno igual, cuando el usuario pase el Excel.
- **Fechas.** Pedido del usuario: la fecha de cada documentación va **un día antes** del vencimiento de la FAO, para organizarse con tiempo. Aplicado el 2026-11-25:
  - TOM: 06/12 → 04/12.
  - UNI: 11/12 → 19/12.
  - AVE: 18/12 → 17/12.
  - BULL: queda 11/12. Su Excel tiene dos vencimientos, 12/12 y 17/12, y se toma el primero.

  Con WeWork se hace igual cuando llegue su Excel.

**Estado:** aprobado por el usuario el 2026-11-25.

## Lo que queda para quien construye

- Nombres exactos de componentes y estilos. Tiene que respetar la agenda actual (`.agenda-*` y `HojaFecha`) y verse prolijo en celular. Antes de entregar se sacan capturas con Chrome headless contra el localhost.
- Si el "Hecho" con nómina conviene hacerlo en una función de la base (transacción) o en pasos desde la ruta, como hoy. Si se hace en pasos, el orden es el de Reglas, para que un doble clic no grabe dos envíos.

## Pruebas y publicación

- **Pruebas contra la base real.** Están permitidas si se borra todo después (crear una documentación "(prueba)" con su nómina). **No** correr el cron desde localhost: `.env.local` apunta a producción y manda pushes reales.
- **Probar con cada rol:** admin, RRHH, operaciones y jefa operativa. Operaciones no tiene que poder crear ni marcar "Hecho", y eso se prueba también contra la API, no solo ocultando botones.
- **Probar las reglas:** agregar a mitad de mes deja pendiente; "Ya la mandé" lo saca de pendiente sin mover la fecha; "Hecho" deja todo enviado y graba el snapshot; la baja saca a la persona de la nómina; no se puede agregar a alguien dos veces.
- **Publicación.** Primero se corre la migración en producción. Después se hace cherry-pick a `main` (nunca merge de dev), se compila con `next build --webpack` en un worktree y se verifica el deploy de Vercel.

## Implementación (2026-11-25)

En `dev`, con el plan `docs/superpowers/plans/2026-11-25-documentacion-mensual.md`:

- `179c1aa` localhost con webpack (aparte, ya aprobado el 24/11)
- `4fd9bb7` lógica pura y `npm test`
- `8f011d9` tablas (migración corrida en producción por el usuario)
- `218acef` nómina, permisos y búsqueda por DNI
- `e155c6f` "✓ Hecho" y "Ya la mandé" con el registro oculto
- `969c3e7` script de carga por Excel. **Zara cargada:** AVE 24, BULL 36, TOM 30, UNI 41, sin pendientes.
- `20d7b4e` lista "Documentación mensual", menús, tarjeta del inicio y avisos
- `9e1dfa2` detalle con la nómina, buscador y Excel
- `6f56c7a` **pedido aparte del usuario:** Operaciones ve Personal (la nómina general de la empresa) en solo lectura

Diferencias con el boceto del detalle:
- "✓ Hecho" y "Editar" van en la cabecera, no al pie. Con nóminas de 40 personas, el pie queda lejos.
- La barra de pendientes va arriba de la lista.
- En la lista, Operaciones y la jefa ven la repetición ("Todos los meses") en lugar de "Avisa a…".
