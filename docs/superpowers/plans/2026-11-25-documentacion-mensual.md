# Documentación mensual: plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** que Vencimientos pase a ser "Documentación mensual", con una nómina de operarios por documentación (con DNI y pendientes), que la vean y la armen Operaciones y la jefa operativa, y cargar las nóminas de Zara desde el Excel.

**Arquitectura:** se suma a las tablas `rrhh_vencimientos*` (enfoque A del diseño) dos tablas nuevas:

- `rrhh_vencimientos_nomina`: quién está en cada documentación.
- `rrhh_vencimientos_envios`: el registro oculto de cada envío, con su snapshot.

La lógica pura (DNI, snapshot, conteos, bajas) va en un módulo sin imports, para poder probarla con `node --test`. Lo que toca la base va en un módulo de servidor que usan las rutas. La URL sigue siendo `/vencimientos`; el detalle es la ruta nueva `/vencimientos/[id]`.

**Stack:** Next 16 (app router, JS sin TypeScript), Supabase (`supabase-js` con service_role), `xlsx` (importación dinámica), `node --test` (Node 24), Chrome headless por CDP para las capturas.

**Spec:** [docs/superpowers/specs/2026-11-25-documentacion-mensual-design.md](../specs/2026-11-25-documentacion-mensual-design.md). Quien ejecuta lee los dos documentos.

## Restricciones globales

- **Roles** (`src/lib/vencimientos.js`):
  - `ROLES_VER` = `ROLES_NOMINA` = `['admin', 'rrhh', 'operaciones', 'jefe_operativo']`.
  - `ROLES_GESTION` = `['admin', 'rrhh']`.
  - Desaparece `ROLES_VENCIMIENTOS`.
- **Baja.** Alguien está dado de baja si `estado_empleado !== 'Activo'` o si `fecha_baja` tiene valor.
- **Pendiente.** Una fila de nómina vigente (`quitado_at` NULL) con `enviado_at` NULL.
- **Tipos de envío:** `'mensual'` ("Hecho"), `'parcial'` ("Ya la mandé"), `'inicial'` (carga desde el Excel).
- **`agregado_por` de la carga inicial:** `'Carga inicial (Excel)'`.
- **`quitado_por` de la limpieza de bajas:** `'Baja del legajo'`.
- **Textos de pantalla.** Castellano rioplatense, como el resto de la app:
  - título: "Documentación mensual";
  - botones: "✓ Hecho", "Ya la mandé", "+ Agregar", "Bajar Excel";
  - marca: "Pendiente";
  - contadores: "N en la nómina", "1 pendiente" / "N pendientes";
  - en el buscador: "ya está";
  - DNI con puntos: "DNI 23.456.789".
- **Excel.** Nombre `Nomina <título> <AAAA-MM>.xlsx`, con los caracteres `\ / : * ? " < > |` cambiados por `-`. Columnas Apellido, Nombre y DNI. Se baja con `downloadWorkbook(XLSX, wb, nombre)` de `src/lib/xlsx-download.js` y `import('xlsx')` dinámico. **Nunca** `XLSX.writeFile`.
- **Base.**
  - Las tablas nuevas llevan RLS activado y `GRANT` a `service_role`.
  - No se crean funciones en la base. Si se creara alguna, hay que volver a correr `supabase/migrations/20261112_cerrar_funciones_publicas.sql`.
- **`.env.local` apunta a PRODUCCIÓN.** Las pruebas crean datos `(prueba)` y los borran al final.
  - Las documentaciones de prueba van con fecha a +60 días, para que el cron de las 8 no mande pushes reales.
  - Nunca correr `/api/cron/avisos` desde localhost.
- **Localhost.** Es el `npm run dev` del usuario (`next dev --webpack`, puerto 3000).
  - No matar procesos de node.
  - Si no responde, pedirle al usuario que lo levante.
- **UI.** Respeta las clases `.agenda-*`, `HojaFecha` y los tokens de color existentes, y se ve bien en celular (375 px). Antes de dar una pantalla por terminada se sacan capturas con Chrome headless (claro y oscuro).
- **Git.**
  - Se trabaja en `dev`, con `git add` de archivos puntuales.
  - No se commitean `.claude/*`, `NOMINAS ZARA.xlsx` ni el cambio ajeno a este plan que ya estaba en `src/app/vacaciones/[id]/page.js`.
  - El cambio de `dev` en `package.json` va en su propio commit (Tarea 1).
  - No se usan comandos interactivos (`git add -p`, `-i`).
  - Publicar es cherry-pick a `main`, nunca merge de dev a main, y **solo con el OK del usuario**.

## Foco de revisión

Lo que el spec implica pero ninguna prueba de una sola tarea cubre por sí sola. Cada línea tiene su prueba en la tarea indicada.

1. **Doble clic en "✓ Hecho".** Se graba un solo envío `mensual`, y el segundo pedido responde 409 sin tocar la nómina. Prueba en la Tarea 4.
2. **Operaciones o la jefa operativa llamando a la API directo** (crear, editar, "Hecho", "Ya la mandé", borrar). Tiene que responder 403 aunque los botones estén ocultos. Prueba en las Tareas 3 y 4.
3. **La misma persona agregada dos veces a la misma nómina**, incluso con dos pedidos simultáneos. Queda una sola fila y el segundo pedido recibe 409 "Ya está en la nómina." Prueba en la Tarea 3.
4. **Alguien de la nómina se da de baja.** Desaparece del detalle **y** de los contadores de la lista, aunque nadie haya abierto el detalle. Si reingresa, no vuelve solo. Prueba en la Tarea 3.
5. **Título con "/"** ("POSIBLES REEMPLAZOS WE WORK BUTTY / CORRIENTES"). El Excel se baja con un nombre válido. Prueba en la Tarea 1.

---

### Task 1: Lógica pura de la nómina y prueba con `node --test`

**Archivos:**
- Crear: `src/lib/nomina-documentacion.js` (sin imports: corre en navegador, servidor y scripts)
- Crear: `tests/nomina-documentacion.test.mjs`
- Modificar: `package.json` (agregar `"test": "node --test tests/"` en `scripts`)

**Interfaces que produce:**
- `estaDeBaja(emp: { estado_empleado?: string, fecha_baja?: string|null }) -> boolean`
- `dniDeCelda(valor: any) -> string|null`
  - Toma solo los dígitos.
  - Si son 11 (un CUIL), usa los dígitos 3 a 10.
  - Saca los ceros de adelante.
  - Es válido si quedan 7 u 8 dígitos; si no, devuelve `null`.
- `formatearDni(dni: string) -> string`: `'23456789'` → `'23.456.789'`, `'5123456'` → `'5.123.456'`.
- `snapshotNomina(filas: Array<{ employee_id, apellido, nombre, dni }>) -> Array<{ employee_id, apellido, nombre, dni }>`: copia solo esos 4 campos, ordenada por apellido y después nombre (`localeCompare` en `'es'`).
- `resumenNomina(filas: Array<{ vencimiento_id: number, enviado_at: string|null }>) -> Record<number, { total: number, pendientes: number }>`: recibe filas ya vigentes.
- `nombreArchivoNomina(titulo: string, fecha: 'AAAA-MM-DD') -> string`

- [ ] **Paso 1: Escribir las pruebas**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { estaDeBaja, dniDeCelda, formatearDni, snapshotNomina, resumenNomina, nombreArchivoNomina } from '../src/lib/nomina-documentacion.js';

test('estaDeBaja', () => {
    assert.equal(estaDeBaja({ estado_empleado: 'Activo', fecha_baja: null }), false);
    assert.equal(estaDeBaja({ estado_empleado: 'Baja', fecha_baja: null }), true);
    assert.equal(estaDeBaja({ estado_empleado: 'Activo', fecha_baja: '2026-11-20' }), true);
});

test('dniDeCelda: DNI, CUIL en la columna DNI, basura', () => {
    assert.equal(dniDeCelda(21307696), '21307696');
    assert.equal(dniDeCelda('27411643609'), '41164360');   // CUIL de DUARTE KAREN
    assert.equal(dniDeCelda('20-26887835-2'), '26887835');
    assert.equal(dniDeCelda(' 5.123.456 '), '5123456');
    assert.equal(dniDeCelda(''), null);
    assert.equal(dniDeCelda('ZARA AVELLANEDA'), null);
    assert.equal(dniDeCelda(123), null);
});

test('formatearDni', () => {
    assert.equal(formatearDni('23456789'), '23.456.789');
    assert.equal(formatearDni('5123456'), '5.123.456');
});

test('snapshotNomina ordena y deja solo los 4 campos', () => {
    const s = snapshotNomina([
        { employee_id: 2, apellido: 'PEREZ', nombre: 'JUAN', dni: '1', enviado_at: null, extra: 1 },
        { employee_id: 1, apellido: 'GOMEZ', nombre: 'ANA', dni: '2' },
    ]);
    assert.deepEqual(s, [
        { employee_id: 1, apellido: 'GOMEZ', nombre: 'ANA', dni: '2' },
        { employee_id: 2, apellido: 'PEREZ', nombre: 'JUAN', dni: '1' },
    ]);
});

test('resumenNomina cuenta total y pendientes por documentación', () => {
    assert.deepEqual(resumenNomina([
        { vencimiento_id: 6, enviado_at: '2026-11-25T10:00:00Z' },
        { vencimiento_id: 6, enviado_at: null },
        { vencimiento_id: 7, enviado_at: null },
    ]), { 6: { total: 2, pendientes: 1 }, 7: { total: 1, pendientes: 1 } });
});

test('nombreArchivoNomina limpia caracteres que Windows no acepta', () => {
    assert.equal(nombreArchivoNomina('FAO ZARA TOM', '2026-12-04'), 'Nomina FAO ZARA TOM 2026-12.xlsx');
    assert.equal(
        nombreArchivoNomina('DOCU POSIBLES REEMPLAZOS WE WORK BUTTY / CORRIENTES', '2026-11-28'),
        'Nomina DOCU POSIBLES REEMPLAZOS WE WORK BUTTY - CORRIENTES 2026-11.xlsx'
    );
});
```

- [ ] **Paso 2:** Correr `npm test`. Resultado esperado: FALLA con `Cannot find module ... nomina-documentacion.js`.
- [ ] **Paso 3:** Implementar las 6 funciones en `src/lib/nomina-documentacion.js`, con un comentario de cabecera que diga para qué sirve el módulo.
- [ ] **Paso 4:** Correr `npm test`. Resultado esperado: `# pass 6`, `# fail 0`.
- [ ] **Paso 5: Commit**

`package.json` ya traía, sin commitear, el cambio de `dev` a `next dev --webpack`, que el usuario aprobó el 2026-11-24. Va en su propio commit **antes** de agregar la línea `test`:

```bash
# antes del Paso 1, con package.json todavía con el cambio de "dev" solamente:
git add package.json
git commit -m "chore(dev): el localhost corre con webpack (Turbopack se quedaba sin memoria)"
# y al terminar la tarea:
git add package.json src/lib/nomina-documentacion.js tests/nomina-documentacion.test.mjs
git commit -m "feat(documentacion): logica pura de la nomina con pruebas"
```

---

### Task 2: Migración de las tablas nuevas

**Archivos:**
- Crear: `supabase/migrations/20261125_documentacion_nomina.sql`
- Crear: `scripts/verificar_tablas_documentacion.mjs` (chequeo de solo lectura)

**Interfaces que produce:** las tablas `rrhh_vencimientos_nomina` y `rrhh_vencimientos_envios`, con las columnas exactas de la sección "Datos" del spec. Además:
- `employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE`: si se elimina un legajo, sus filas de nómina se van con él, y el snapshot de los envíos conserva el nombre.
- `CREATE UNIQUE INDEX IF NOT EXISTS uq_nomina_vigente ON rrhh_vencimientos_nomina (vencimiento_id, employee_id) WHERE quitado_at IS NULL;`
- `CREATE INDEX IF NOT EXISTS idx_nomina_vencimiento ON rrhh_vencimientos_nomina (vencimiento_id) WHERE quitado_at IS NULL;`
- `nomina JSONB NOT NULL DEFAULT '[]'` en envíos.
- Encabezado como el de `20261026_vencimientos_rrhh.sql`: "Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente."
- Al final: `ENABLE ROW LEVEL SECURITY`, `GRANT ALL ... TO service_role` y `GRANT USAGE, SELECT ON SEQUENCE ..._id_seq TO service_role`, igual que la migración del 26/10.

- [ ] **Paso 1: Escribir el chequeo.** `scripts/verificar_tablas_documentacion.mjs`:
  - Lee `.env.local` como los otros scripts.
  - Hace `select('id').limit(1)` en las dos tablas.
  - Si alguna tira error, imprime `FALTA <tabla>: <mensaje>` y sale con código 1. Si no, imprime `OK las dos tablas`.
- [ ] **Paso 2:** Correr `node scripts/verificar_tablas_documentacion.mjs`. Resultado esperado: `FALTA rrhh_vencimientos_nomina` (todavía no existe).
- [ ] **Paso 3:** Escribir la migración.
- [ ] **Paso 4: Correrla en producción.**
  - Primero intentar con la herramienta de Supabase (MCP `plugin:supabase:supabase`, `apply_migration` o `execute_sql`).
  - Si no está conectada, pedirle al usuario que pegue el archivo en Supabase → SQL Editor → Run, y esperar su confirmación.
- [ ] **Paso 5:** Correr `node scripts/verificar_tablas_documentacion.mjs`. Resultado esperado: `OK las dos tablas`.
- [ ] **Paso 6: Commit**

```bash
git add supabase/migrations/20261125_documentacion_nomina.sql scripts/verificar_tablas_documentacion.mjs
git commit -m "feat(documentacion): tablas de nomina y registro de envios"
```

---

### Task 3: Permisos, lectura de la nómina, agregar, sacar y buscar

**Archivos:**
- Modificar: `src/lib/vencimientos.js` (reemplazar `ROLES_VENCIMIENTOS` por `ROLES_VER`, `ROLES_NOMINA` y `ROLES_GESTION`)
- Crear: `src/lib/nomina-documentacion-server.js`
- Modificar: `src/app/api/vencimientos/route.js`:
  - GET de la lista con contadores;
  - GET `?id=` del detalle;
  - se borra la rama `?hechos=1`;
  - POST, PATCH y DELETE pasan a `ROLES_GESTION`.
- Crear: `src/app/api/vencimientos/nomina/route.js` (POST agregar, DELETE sacar)
- Crear: `src/app/api/vencimientos/operarios/route.js` (GET buscar)
- Modificar: `src/lib/buscar-operarios.js` (nueva opción `porDni`)
- Modificar: `src/middleware.js:49` (prefijo `/api/vencimientos` con los 4 roles de `ROLES_VER`; actualizar el comentario)
- Crear: `scripts/probar_documentacion_mensual.mjs` (prueba de integración contra el localhost; la Tarea 4 le suma casos)

**Interfaces:**
- Consume: `estaDeBaja`, `resumenNomina` y `formatearDni` de la Tarea 1, y las tablas de la Tarea 2.
- Produce (`src/lib/nomina-documentacion-server.js`):
  - `limpiarBajas(vencimientoIds?: number[]) -> Promise<number>`: a las filas vigentes cuyo empleado esté de baja les pone `quitado_at = now()` y `quitado_por = 'Baja del legajo'`. Devuelve cuántas quitó. Sin argumento, revisa todas las documentaciones.
  - `nominaVigente(vencimientoId: number) -> Promise<Array<{ id, employee_id, apellido, nombre, dni, enviado_at, agregado_por, agregado_at }>>`: ordenada por apellido y nombre.
  - `resumenVigente() -> Promise<Record<number, { total, pendientes }>>`
  - `quienEs(session) -> Promise<string>`: se mueve acá desde `route.js` y la usan las tres rutas.
- Produce (HTTP):
  - **GET `/api/vencimientos`** → `{ usuarios, vencimientos: [...v, avisos, nomina_total, pendientes], puede_gestionar }`. `usuarios` va vacío si el rol no es de `ROLES_GESTION`.
  - **GET `/api/vencimientos?id=N`** → `{ vencimiento, nomina, puede_gestionar }`, o 404 si no existe o está anulada.
  - **POST `/api/vencimientos/nomina`** con `{ vencimiento_id, employee_id }`:
    - 201 con la fila;
    - 409 `{ error: 'Ya está en la nómina.' }`, que sale del código `23505` del índice único;
    - 400 `'Esa persona está dada de baja.'`;
    - 404 si la documentación no existe o está anulada.
  - **DELETE `/api/vencimientos/nomina?id=N`** → `{ ok: true }`, o 404 si no está o ya estaba quitada.
  - **GET `/api/vencimientos/operarios?q=`**: el mismo formato que `buscarOperarios`, más `dni`.
  - **`buscarOperarios(q, { porDni: true })`**:
    - suma `dni` al `select` y a la salida;
    - si lo escrito son solo dígitos (3 o más), busca `dni.like.<dígitos>%` (la columna es texto, verificado el 2026-11-25);
    - los otros llamadores no cambian.

- [ ] **Paso 1: Escribir la prueba de integración.** `scripts/probar_documentacion_mensual.mjs`, ejecutable con `node --test scripts/probar_documentacion_mensual.mjs`.
  - En el `before`:
    - inicia sesión por rol con `POST http://localhost:3000/api/auth/quick-access` y guarda la cookie de `res.headers.getSetCookie()`;
    - con service_role crea una documentación `"(prueba) Documentación"`, con fecha hoy +60 días, `cada_meses` 1 y `responsables` = [id del admin];
    - crea un empleado de prueba `{ apellido: 'PRUEBA', nombre: 'DOCUMENTACION', dni: '99999901', estado_empleado: 'Activo' }`.
  - En el `after`: borra (`delete`) la documentación de prueba (se lleva por cascada la nómina, los envíos, los hechos y los avisos) y el empleado de prueba.
  - Casos:
    - `operaciones puede ver la lista y el detalle`: GET lista con 200 y `puede_gestionar === false`; GET `?id=` con 200.
    - `operaciones no gestiona` (foco 2): POST `/api/vencimientos` → 403; PATCH con `{ id, titulo, fecha }` → 403; DELETE → 403.
    - `supervisor no entra`: GET `/api/vencimientos` → 403.
    - `jefa operativa agrega y saca`:
      - POST nómina con el empleado de prueba → 201;
      - el detalle lo trae con `enviado_at === null`;
      - la lista muestra `nomina_total: 1, pendientes: 1`;
      - DELETE → 200 y la lista vuelve a `nomina_total: 0`.
    - `no se agrega dos veces` (foco 3): dos POST simultáneos con `Promise.all` para la misma persona dan un 201 y un 409 con `error === 'Ya está en la nómina.'`, y en la base queda 1 fila vigente.
    - `la baja saca de la nómina sin abrir el detalle` (foco 4):
      1. Agregar al empleado de prueba.
      2. Con service_role, `update({ estado_empleado: 'Baja', fecha_baja: hoy })`.
      3. GET de la lista: `nomina_total` vuelve a 0.
      4. Con service_role, reactivarlo (`'Activo'`, `fecha_baja: null`).
      5. GET del detalle: no aparece.
    - `buscar por DNI`: GET operarios `?q=9999990` como operaciones → incluye `dni: '99999901'`.
- [ ] **Paso 2:** Correr `node --test scripts/probar_documentacion_mensual.mjs`, con el localhost levantado. Resultado esperado: FALLAN los casos de nómina (404 en `/api/vencimientos/nomina`) y los de operaciones (403 en la lista).
- [ ] **Paso 3:** Implementar los roles, el módulo de servidor, las tres rutas, `porDni` y el middleware.
  - **Contadores de la lista:** llamar `await limpiarBajas()` antes de `resumenVigente()`. Es una sola consulta de filas vigentes con `employees:employee_id (estado_empleado, fecha_baja)`, más un `update` por lote con `.in('id', ids)` si hay bajas.
  - **POST de nómina:** valida que la documentación exista y no esté anulada, y que el empleado no esté de baja. `agregado_por` sale de `quienEs(session)`.
- [ ] **Paso 4:** Correr `node --test scripts/probar_documentacion_mensual.mjs`. Resultado esperado: todos los casos de esta tarea en PASS. Correr también `npm test`.
- [ ] **Paso 5:** Correr `npx eslint src/lib src/app/api/vencimientos src/middleware.js`. Resultado esperado: sin errores.
- [ ] **Paso 6: Commit**

```bash
git add src/lib/vencimientos.js src/lib/nomina-documentacion-server.js src/lib/buscar-operarios.js \
  src/app/api/vencimientos src/middleware.js scripts/probar_documentacion_mensual.mjs
git commit -m "feat(documentacion): nomina por documentacion con permisos para operaciones y jefa operativa"
```

---

### Task 4: "✓ Hecho" con snapshot y "Ya la mandé"

**Archivos:**
- Modificar: `src/lib/nomina-documentacion-server.js` (agregar `registrarEnvio`)
- Modificar: `src/app/api/vencimientos/route.js` (PATCH `accion: 'hecho'` y la nueva `accion: 'enviados'`)
- Modificar: `scripts/probar_documentacion_mensual.mjs` (casos nuevos)

**Interfaces:**
- Consume: `nominaVigente` (Tarea 3) y `snapshotNomina` (Tarea 1).
- Produce:
  - `registrarEnvio({ vencimientoId, tipo: 'mensual'|'parcial'|'inicial', fechaVencimiento, quien, filas }) -> Promise<{ enviados: number }>`:
    1. Pone `enviado_at = now()` en las filas recibidas que lo tenían NULL. Para `parcial` e `inicial` solo esas; para `mensual`, todas las vigentes.
    2. Inserta un envío con `nomina = snapshotNomina(filas)`.
  - PATCH `{ id, accion: 'hecho' }`: la misma respuesta de hoy. Recién **después** de que el `update` de la fecha devolvió la fila, llama a `registrarEnvio({ tipo: 'mensual', fechaVencimiento: actual.fecha, filas: todas las vigentes })`. Si el doble clic termina en 409, no registra nada.
  - PATCH `{ id, accion: 'enviados' }` (`ROLES_GESTION`):
    - toma las filas pendientes;
    - si no hay, responde 409 `{ error: 'No hay pendientes.' }`;
    - si hay, llama a `registrarEnvio({ tipo: 'parcial', ... })` y responde `{ enviados: N }`;
    - no toca `fecha` ni `rrhh_vencimientos_hechos`.

- [ ] **Paso 1: Agregar los casos al script.**
  - `Ya la mandé envía solo los pendientes y no mueve la fecha`:
    1. Agregar a dos personas.
    2. PATCH `enviados` como rrhh → `{ enviados: 2 }`.
    3. La lista muestra `pendientes: 0` y la `fecha` es la misma de antes.
    4. En la base hay 1 envío `parcial` con 2 elementos en `nomina`.
  - `operaciones no puede marcar enviados ni hecho` (foco 2): los dos PATCH → 403.
  - `Hecho deja todo enviado y graba el snapshot`:
    1. Agregar a una tercera persona (queda pendiente).
    2. PATCH `hecho` como admin → 200; la fecha avanza un mes.
    3. La lista muestra `pendientes: 0`.
    4. En la base, el envío `mensual` tiene en `nomina` las 3 personas, ordenadas por apellido.
  - `doble clic en Hecho graba un solo envío` (foco 1):
    1. Dos PATCH `hecho` simultáneos (`Promise.all`): un 200 y un 409.
    2. La cantidad de envíos `mensual` para esa documentación sube exactamente en 1.
  - `Hecho con la nómina vacía funciona`: en otra documentación de prueba sin nómina, PATCH `hecho` → 200 y un envío `mensual` con `nomina = []`.
- [ ] **Paso 2:** Correr `node --test scripts/probar_documentacion_mensual.mjs`. Resultado esperado: los casos nuevos FALLAN (400 o 409 en `enviados`, y no se graba ningún envío).
- [ ] **Paso 3:** Implementar `registrarEnvio` y las dos acciones.
- [ ] **Paso 4:** Correr `node --test scripts/probar_documentacion_mensual.mjs` y `npm test`. Resultado esperado: todo en PASS.
- [ ] **Paso 5: Commit**

```bash
git add src/lib/nomina-documentacion-server.js src/app/api/vencimientos/route.js scripts/probar_documentacion_mensual.mjs
git commit -m "feat(documentacion): Hecho y Ya la mande registran el envio con la nomina"
```

---

### Task 5: Lista "Documentación mensual", menús, tarjeta del inicio y avisos

**Archivos:**
- Modificar: `src/app/vencimientos/page.js`:
  - título;
  - se borran la pestaña Hechos y `ListaHechos`;
  - contadores en cada fila;
  - el título abre el detalle;
  - los botones de gestión solo si `puede_gestionar`;
  - `ActivarNotificaciones` solo si `puede_gestionar`;
  - "vencimiento" pasa a "documentación" en vacío, confirmaciones y toasts.
- Crear: `src/components/DocumentacionModal.jsx`: se mueve `VencimientoModal` desde `page.js` sin cambiar su lógica, solo los textos ("Nueva documentación", "Editar documentación", "Documentación cargada."), para que la use también el detalle.
- Modificar: `src/components/MainLayout.jsx`:
  - label "Documentación mensual" en admin (línea ~92) y RRHH (línea ~259);
  - entrada nueva en operaciones (grupo "Operaciones") y en la jefa operativa (grupo "RRHH");
  - título de la pestaña del navegador (línea ~568);
  - `active` con `pathname.startsWith('/vencimientos')`.
- Modificar: `src/middleware.js` (`'/vencimientos'` en `ALLOWED_PREFIXES_BY_ROLE.operaciones` y `.jefe_operativo`)
- Modificar: `src/components/VencimientosSemana.jsx` (link "Ver documentación"; cada línea de documentación con `href: '/vencimientos/' + v.id`)
- Modificar: `src/lib/avisos-vencimientos.js:30` (`url: \`/vencimientos/${v.id}\``)
- Crear: `scripts/captura_documentacion.mjs` (Chrome headless, basado en `captura_trabajos.mjs` del scratchpad: inicia sesión por rol y saca captura de una URL en claro y oscuro, a 1280 px y a 375 px)

**Interfaces:**
- Consume: la respuesta de GET `/api/vencimientos` de la Tarea 3 (`nomina_total`, `pendientes`, `puede_gestionar`).
- Produce: `DocumentacionModal({ vencimiento, usuarios, miId, onClose, onGuardado })`, con las mismas props que el `VencimientoModal` de hoy.

Cada fila de la lista suma, debajo de "Avisa a…":
- "**N** en la nómina", siempre;
- un chip ámbar "1 pendiente" / "N pendientes" si hay pendientes, con el estilo de `.agenda-estado` y el tono ámbar que ya usa `data-tono="ambar"`.

- [ ] **Paso 1: Verificación que falla.** Correr `node scripts/captura_documentacion.mjs operaciones /vencimientos <salida>`. Resultado esperado: el middleware redirige a operaciones fuera de `/vencimientos`, así que la URL final no es `/vencimientos`.
- [ ] **Paso 2:** Implementar todos los cambios de la lista.
- [ ] **Paso 3:** Volver a correr la captura como operaciones, jefe_operativo, rrhh y admin.
  - Resultado esperado: los cuatro ven "Documentación mensual" sin pestaña Hechos, con "N en la nómina" en cada fila.
  - Operaciones y la jefa operativa **no** ven "+ Nuevo", "✓ Hecho", "Editar", "Borrar" ni "Activar notificaciones".
  - Admin y RRHH sí.
  - El menú de cada uno tiene la entrada "Documentación mensual".
  - Mirar las capturas (claro y oscuro, 1280 y 375 px) y corregir lo que se vea desprolijo.
- [ ] **Paso 4:** Captura del inicio (`/`) como rrhh: la tarjeta "Esta semana" dice "Ver documentación".
- [ ] **Paso 5:** Correr `npx eslint` sobre los archivos tocados y `npm test`. Resultado esperado: sin errores.
- [ ] **Paso 6: Commit**

```bash
git add src/app/vencimientos/page.js src/components/DocumentacionModal.jsx src/components/MainLayout.jsx \
  src/middleware.js src/components/VencimientosSemana.jsx src/lib/avisos-vencimientos.js scripts/captura_documentacion.mjs
git commit -m "feat(documentacion): Vencimientos pasa a Documentacion mensual y la ven operaciones y la jefa operativa"
```

---

### Task 6: Detalle `/vencimientos/[id]` con la nómina

**Archivos:**
- Crear: `src/app/vencimientos/[id]/page.js`
- Modificar: `src/components/BuscadorOperario.jsx`: prop opcional `yaElegidos` (un `Set` de ids). Esos aparecen deshabilitados, con "ya está" a la derecha y sin `onClick`. Los demás usos del componente no cambian.
- Modificar: `src/app/globals.css`, solo si hace falta, para la fila de nómina, siguiendo el bloque `/* Agenda */`.

**Interfaces:**
- Consume:
  - GET `/api/vencimientos?id=` (Tarea 3);
  - POST y DELETE `/api/vencimientos/nomina` (Tarea 3);
  - GET `/api/vencimientos/operarios` (Tarea 3);
  - PATCH `hecho` y `enviados` (Tarea 4);
  - `DocumentacionModal` (Tarea 5);
  - `formatearDni` y `nombreArchivoNomina` (Tarea 1);
  - `downloadWorkbook` y `avisarCambioVencimientos`.
- Produce: la pantalla del boceto del spec.

Contenido de la pantalla:

- **Encabezado.**
  - "← Volver", con `window.history.length > 1 ? router.back() : router.push('/vencimientos')`.
  - Título.
  - `HojaFecha`, "vence dd/mm" y la repetición.
- **"Nómina (N)".** Con "Bajar Excel" y, para todos los roles con acceso, "+ Agregar".
  - "+ Agregar" abre un panel con `BuscadorOperario`, con `url="/api/vencimientos/operarios"`, el placeholder "Apellido, nombre, legajo o DNI…" y `yaElegidos`.
  - Al elegir a alguien se hace el POST; al volver, toast "Agregado." y se recarga.
- **Filas.**
  - "APELLIDO, NOMBRE", "DNI 23.456.789" y la ✕.
  - La ✕ pide `confirm("¿Sacar a X de la nómina?")`.
  - Los pendientes llevan además el chip "Pendiente" y "agregó <agregado_por> el dd/mm".
- **Pie de la nómina** (solo si hay pendientes): "N pendiente(s) de enviar", y "Ya la mandé" solo si `puede_gestionar`.
- **Acciones** (solo si `puede_gestionar`): "✓ Hecho" (la confirmación de hoy más "La nómina completa queda como enviada.") y "Editar" (`DocumentacionModal`).
- **Estados:** "Cargando…"; error en rojo; nómina vacía con "Todavía no hay nadie en la nómina. Agregá a quienes van en esta documentación con “+ Agregar”."

- [ ] **Paso 1: Verificación que falla.** Correr `node scripts/captura_documentacion.mjs jefe_operativo /vencimientos/<id de prueba> <salida>`. Resultado esperado: 404 de Next, porque la ruta no existe.
- [ ] **Paso 2:** Implementar `yaElegidos` en `BuscadorOperario` y la pantalla de detalle.
- [ ] **Paso 3: Recorrido de punta a punta con la documentación de prueba.** Agregar al script de captura un modo `recorrido` que maneje la pantalla por CDP:
  1. Como jefe_operativo: abre el detalle, agrega a una persona por DNI y por apellido, y saca a una.
  2. Como rrhh: ve "1 pendiente de enviar", toca "Ya la mandé" y después "✓ Hecho".
  3. Baja el Excel y verifica que el archivo existe en la carpeta de descargas del perfil temporal, con el nombre de `nombreArchivoNomina`.
  4. Desde la lista, toca la fila, va al detalle y con "← Volver" regresa a la lista.

  Resultado esperado: cada paso se refleja en pantalla y no hay errores en la consola. La documentación de prueba se borra al final.
- [ ] **Paso 4:** Capturas del detalle a 1280 y 375 px, en claro y oscuro, como jefe_operativo (sin botones de gestión) y como rrhh (con botones). Mirarlas y corregir lo desprolijo: anchos de los inputs, el chip, la alineación del DNI.
- [ ] **Paso 5:** Correr `npx eslint` sobre los archivos tocados y `npm test`. Resultado esperado: sin errores.
- [ ] **Paso 6: Commit**

```bash
git add "src/app/vencimientos/[id]/page.js" src/components/BuscadorOperario.jsx src/app/globals.css scripts/captura_documentacion.mjs
git commit -m "feat(documentacion): detalle con la nomina, Ya la mande y Excel"
```

---

### Task 7: Carga inicial de las nóminas de Zara

**Archivos:**
- Crear: `scripts/cargar_nominas_excel.mjs <xlsx> [--aplicar] [--mapa "HOJA=ID" ...]`

**Interfaces:**
- Consume: `dniDeCelda`, `estaDeBaja` y `snapshotNomina` (Tarea 1). Se importan con ruta relativa `../src/lib/nomina-documentacion.js`, porque el alias `@/` no anda en scripts. También consume las tablas de la Tarea 2.
- **Mapeo de hojas.** Cada hoja va a la documentación vigente cuyo título sea `FAO <hoja>` (sin distinguir mayúsculas), salvo que `--mapa` diga otra cosa. Si una hoja no encuentra documentación, el script corta sin cargar nada.
- **DNI.** La columna cuyo encabezado es `DNI`.
- **Cruce.** Con `employees` por `dni`.
- **Filas que se descartan** (se listan con el motivo):
  - DNI inválido;
  - no está en el legajo;
  - dado de baja;
  - repetida en la hoja;
  - ya está vigente en esa nómina, que es lo que permite volver a correrlo sin duplicar.
- **Con `--aplicar`, por cada hoja:**
  1. Inserta las filas con `agregado_por = 'Carga inicial (Excel)'` y `enviado_at` = el momento de la carga.
  2. Llama a la misma lógica que `registrarEnvio` con `tipo: 'inicial'` y la fecha actual de la documentación. Se reimplementa en el script con supabase-js, porque no puede importar el módulo de servidor.

- [ ] **Paso 1:** Escribir el script. Sin `--aplicar` imprime una tabla por hoja: filas, se cargan, descartadas y el detalle de cada descarte.
- [ ] **Paso 2:** Correr `node scripts/cargar_nominas_excel.mjs "NOMINAS ZARA.xlsx"`. Resultado esperado, igual al cruce del spec:

  | hoja | se cargan | se descartan |
  |---|---|---|
  | ZARA AVE | 24 | Carabajal (baja) |
  | ZARA BULL | 36 | — |
  | ZARA TOM | 30 | Ramírez Florencia (baja) |
  | ZARA UNI | 41 | González Silvina, Chocobar, Ramírez Florencia (bajas); Orrego (repetida) |

  Si los números no coinciden, frenar y revisar antes de aplicar.
- [ ] **Paso 3:** Correr con `--aplicar`. Después correrlo otra vez sin `--aplicar`. Resultado esperado: 0 a cargar en las 4 hojas, todos descartados como "ya está".
- [ ] **Paso 4:** Verificar en la app, como rrhh: las 4 FAO de Zara muestran 24, 36, 30 y 41 en la nómina, con **0 pendientes**. Sacar captura del detalle de FAO ZARA TOM.
- [ ] **Paso 5: Commit**

```bash
git add scripts/cargar_nominas_excel.mjs
git commit -m "feat(documentacion): script de carga inicial de nominas desde Excel"
```

---

### Task 8: Documentar y dejar listo para publicar

**Archivos:**
- Modificar: `docs/superpowers/specs/2026-11-25-documentacion-mensual-design.md` (estado: "en dev", con los commits)
- Memoria: actualizar `project_vencimientos_rrhh.md` (ahora Documentación mensual: tablas nuevas, roles, URL del detalle, script de carga) y el índice `MEMORY.md`.

- [ ] **Paso 1:** Correr `npm test` y `node --test scripts/probar_documentacion_mensual.mjs` una última vez, y hacer un build de prueba con `npx next build --webpack` en un worktree de dev, como se hace para publicar. Resultado esperado: todo en PASS y el build compila.
- [ ] **Paso 2:** Actualizar el spec y la memoria.
- [ ] **Paso 3:** Commit del spec y del plan:

```bash
git add docs/superpowers/specs/2026-11-25-documentacion-mensual-design.md docs/superpowers/plans/2026-11-25-documentacion-mensual.md
git commit -m "docs(documentacion): diseño y plan"
```

- [ ] **Paso 4:** Avisarle al usuario que está en dev y preguntarle si se publica.
- [ ] **Paso 5, solo con el OK:** publicar.
  1. `git cherry -v origin/main dev`.
  2. Cherry-pick a `main` de los commits de este plan, sin los de `/operativo`, que deben quedar solo en dev.
  3. Build con `npx next build --webpack` en el worktree.
  4. Push de `main`.
  5. Verificar el estado del deploy en Vercel.

  La migración ya está corrida en producción desde la Tarea 2. Avisarle al usuario que Operaciones y la jefa operativa ya lo ven.

---

### Task 9: Operaciones ve Personal (la nómina del legajo) en solo lectura

Pedido del usuario del 2026-11-25, al arrancar la ejecución: "aprovechemos que vamos a pushear a vercel para que operaciones vea la NOMINA, obviamente no pueden editar por ahora, modo solo lectura va a ser". En la app, "Nómina" es la lista de Personal de `/rrhh` (`HRSection`, sub-vista `nomina`, botón "Exportar Nómina"). Hoy Operaciones entra a `/rrhh` pero solo ve Calendario y Licencias.

**Archivos:**
- Modificar: `src/components/HRSection.jsx`. Operaciones suma `'personal'` a sus secciones y queda en solo lectura en Personal, como dirección. Licencias sigue como hoy para Operaciones: el `readOnly` de `LicensesGantt` pasa a ser solo de dirección.
- Modificar: `src/components/MainLayout.jsx`. La entrada "Personal" (`/rrhh?tab=personal`) va en el grupo "Operaciones", junto a Calendario y Licencias.
- Modificar: `src/middleware.js`. Operaciones no escribe en `/api/employees` ni en `/api/employee-documents` (POST, PUT, PATCH y DELETE → 403 "Tu rol es de solo lectura…"). Hoy esas rutas no cortan por rol, y Operaciones no tiene ningún uso legítimo de escritura ahí: el alta es de `/alta-personal`, que no es suya.
- Crear: `scripts/probar_personal_operaciones.mjs` (`node --test`, contra el localhost).

**Interfaces:** no consume nada de las tareas 1 a 8.

- [ ] **Paso 1: Escribir la prueba.**
  - Crea con service_role un empleado `PRUEBA PERSONAL` (dni `99999902`) y lo borra en el `after`.
  - Casos:
    - `operaciones lee el legajo`: GET `/api/employees` → 200.
    - `operaciones no edita el legajo`: PUT `/api/employees/<id>` → 403; DELETE `/api/employees/<id>` → 403; POST `/api/employees` → 403; POST `/api/employee-documents` → 403. Después del PUT, el apellido en la base sigue siendo `PRUEBA`.
    - `rrhh sigue editando`: PUT `/api/employees/<id>` con el mismo cuerpo → 200.
- [ ] **Paso 2:** Correr `node --test scripts/probar_personal_operaciones.mjs`. Resultado esperado: FALLA `operaciones no edita el legajo` (hoy responde 200).
- [ ] **Paso 3:** Implementar el corte del middleware, las secciones, el solo lectura y el menú.
- [ ] **Paso 4:** Correr la prueba. Resultado esperado: PASS. Correr `npm test`.
- [ ] **Paso 5: Captura** con Chrome headless como operaciones: Personal carga la lista. No aparecen "+ Nuevo", "⚙ Gestión Docs" ni ✏. El legajo abre sin "Editar Perfil", "Dar de Baja", "Eliminar Legajo", "Subir" ni "Nuevo informe". Licencias se sigue pudiendo cargar como hoy.
- [ ] **Paso 6: Commit**

```bash
git add src/components/HRSection.jsx src/components/MainLayout.jsx src/middleware.js scripts/probar_personal_operaciones.mjs
git commit -m "feat(rrhh): operaciones ve Personal en solo lectura"
```
