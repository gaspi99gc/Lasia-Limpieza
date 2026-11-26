# Solicitud de Personal: mejoras — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer las 7 mejoras aprobadas de la Solicitud de Personal:
- nota nueva
- detalle con los datos del servicio
- encargado
- vacaciones
- cargar otra igual
- PDF simple
- quién entra al cubrir

**Architecture:**
- Columnas nuevas en `staff_requests`, validadas en la API existente (`/api/staff-requests` y `[id]`).
- Lógica pura en `src/lib/solicitud-personal.js`, con tests de node.
- El PDF se arma en el navegador (`src/lib/pdf-solicitudes.js`).
- La pantalla sigue siendo `src/components/StaffRequestsView.jsx`.

**Tech Stack:**
- Next.js 16 (app router, JS), React 19.
- Supabase (service role).
- jsPDF 4 + jspdf-autotable 5.
- `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-27-solicitud-personal-mejoras-design.md`

## Global Constraints

- `.env.local` apunta a PRODUCCIÓN. Las pruebas de integración crean datos "(prueba)" y los borran.
- No abrir notas como rol `rrhh` en pruebas sobre solicitudes reales: eso las marca como leídas.
- Textos en castellano rioplatense. La etiqueta "Vacaciones" va sin emoji, en violeta (`#EDE9FE` / `#5B21B6` / borde `#7C3AED`).
- Archivos de `src/lib` usados por tests: imports relativos con `.js`, sin `@/`.
- Publicar = cherry-pick a main + `npm ci` + `npm run build` (Turbopack) en un worktree. Nunca merge dev→main.

## Review Focus

- Pasar a Cubierta desde la lista sin DNI o nombre → la API responde 400 y el selector vuelve al estado anterior.
- Reabrir una cubierta → `personas_tomadas` queda en null.
- Cambiar el estado entre pendiente y entrevista → no toca personas, sexo ni nota vista.
- DNI con puntos o espacios ("40.123.456") → se guarda solo con dígitos. Un DNI de menos de 7 dígitos o más de 8 se rechaza.
- Un servicio cuyo apodo del operativo no coincide con nadie (NESTOR) → el detalle muestra el apodo, no queda vacío.

---

### Task 1: Migración y lógica pura

**Files:**
- Create: `supabase/migrations/20261127_staff_requests_mejoras.sql`
- Create: `src/lib/solicitud-personal.js`
- Test: `tests/solicitud-personal.test.mjs`

**Interfaces:**
- Produces:
  - `direccionCorta(d: string) -> string`
  - `resumenDias(dias: string|string[]) -> string`, movida desde StaffRequestsView, con el mismo comportamiento.
  - `limpiarPersonas(lista, cantidad) -> { personas: {dni, nombre}[] } | { error: string }`
  - `limpiarGrupo(v) -> string|null`
  - `filasPdf(solicitudes) -> string[][]`: cuatro celdas por solicitud.
  - `tituloPdf(filtro, hoyDDMMAAAA) -> string`

- [ ] **Step 1: Tests.**
  - `direccionCorta('Calle Quevedo 3365, Buenos Aires, Ciudad Autónoma de Buenos Aires, C1417, Ciudad Autónoma de Buenos Aires')` === `'Calle Quevedo 3365, CABA'`.
  - `direccionCorta('Avenida del Libertador 1000, Vicente López, B1638, Provincia de Buenos Aires')` === `'Avenida del Libertador 1000, Vicente López, Provincia de Buenos Aires'`.
  - `direccionCorta(null)` === `''`.
  - `resumenDias`:
    - todos → `'Todos los días'`
    - `'lun,mar,mie,jue,vie'` → `'Lunes a viernes'`
    - `'sab,dom'` → `'Fines de semana'`
  - `limpiarPersonas`:
    - `([{dni:'40.123.456', nombre:' perez juana '}], 1)` → `{personas:[{dni:'40123456', nombre:'PEREZ JUANA'}]}`
    - Falta el nombre → error `'Completá el DNI y el nombre de cada persona.'`
    - DNI `'123'` → error `'El DNI tiene que tener 7 u 8 números.'`
    - Una sola persona con cantidad 2 → error `'Faltan personas: se pidieron 2.'`
  - `limpiarGrupo`: un uuid válido vuelve igual; `'x'` → null.
  - `filasPdf([{service_name:'DENO', urgencia:'urgente', por_vacaciones:true, cantidad:1, sexo:'mujer', tipo_jornada:'completa', hora_desde:'06:00', hora_hasta:'14:00', dias:'lun,mar,mie,jue,vie,sab,dom', fecha_necesaria:'2026-11-27', motivo:null, notas:'franquero', personas_tomadas:null}])` devuelve:
    `[['DENO\nUrgente\nVacaciones', '1 mujer · Completa\n06:00 a 14:00\nTodos los días', '27/11/2026', 'franquero']]`
  - Con `personas_tomadas:[{dni:'40123456', nombre:'PEREZ JUANA'}]`, los comentarios empiezan con `'Entró: PEREZ JUANA · DNI 40123456'`.
  - `tituloPdf`:
    - `('todos','27/11/2026')` → `'Solicitudes de personal abiertas al 27/11/2026'`
    - `'vacaciones'` → `'... para cubrir vacaciones al ...'`
- [ ] **Step 2:** `node --test tests/solicitud-personal.test.mjs` → FAIL (falta el módulo).
- [ ] **Step 3: Implementar el módulo.** Imports relativos: `./sexo-solicitud.js`.
- [ ] **Step 4:** el test pasa.
- [ ] **Step 5: Migración.** Es idempotente:
  - `ADD COLUMN IF NOT EXISTS` para `encargado_nombre text`, `por_vacaciones boolean not null default false`, `grupo_id uuid`, `personas_tomadas jsonb`.
  - `UPDATE ... SET grupo_id = '5f0c1a52-6a3e-4c2b-9d43-2b7f0e6a2311' WHERE id IN (23,24,25) AND grupo_id IS NULL`.
- [ ] **Step 6:** commit.

### Task 2: API

**Files:**
- Create: `src/lib/solicitud-personal-server.js`
- Modify: `src/app/api/staff-requests/route.js`
- Modify: `src/app/api/staff-requests/[id]/route.js`

**Interfaces:**
- Consumes: `limpiarPersonas`, `limpiarGrupo`, `direccionCorta` (Task 1); `supervisoresPorServicio(db, ids)`.
- Produces: el GET agrega a cada fila `address` (corta), `supervisor` (string|null) y `encargado_nombre`, `por_vacaciones`, `grupo_id` y `personas_tomadas` (que vienen con `*`).
  - `datosServicios(db, serviceIds) -> Map<id, {address, supervisor}>`. El supervisor son los nombres de la app unidos con " y ". Si no hay ninguno, el texto crudo de `operativo_puestos.supervisor_nombre`; si tampoco, null.

- [ ] **Step 1: POST.** Guarda:
  - `encargado_nombre`: `cleanText`.
  - `por_vacaciones`: `body.por_vacaciones === true`.
  - `grupo_id`: `limpiarGrupo`.
- [ ] **Step 2: PUT.** Los mismos tres campos; cada uno solo se toca si viene en el body.
  - Si pasa a `cubierta` y no lo estaba: exige `limpiarPersonas(body.personas_tomadas, cantidad)`. Si da error, 400 con ese texto.
  - Si ya estaba cubierta: solo valida las personas si vienen en el body.
  - Si el estado no es cubierta: `personas_tomadas = null`.
- [ ] **Step 3: GET.** Usa `datosServicios` para los servicios de la lista.
- [ ] **Step 4: Prueba de integración contra el localhost.** Es un script del scratchpad: crea, prueba y borra.
  - POST con encargado, vacaciones y grupo → vuelven guardados.
  - GET trae `address` y `supervisor` de DENO: "Antonio Romano y Roiman Jose Medina".
  - PUT a cubierta sin personas → 400. Con personas → 200, con el DNI sin puntos.
  - PUT a pendiente → `personas_tomadas` null.
  - PUT a en_proceso con la fila entera → no toca sexo ni nota vista.
  - PATCH de nota vista como admin → 403; como rrhh, sobre una solicitud de prueba → marca.
- [ ] **Step 5:** commit.

### Task 3: Pantalla — formulario, lista, detalle, cuadro de Cubierta

**Files:**
- Modify: `src/components/StaffRequestsView.jsx`

**Interfaces:**
- Consumes: los campos de la API (Task 2); `resumenDias` y `limpiarPersonas` (Task 1).

- [ ] **Step 1: Formulario.**
  - Agrega "Encargado del servicio (opcional)" debajo del sexo.
  - Agrega el cuadro tildable "Para cubrir vacaciones" debajo de jornada y urgencia.
  - Agrega "Guardar y cargar otra igual", solo al crear. Genera `grupo_id` con `crypto.randomUUID()` la primera vez y lo reusa mientras el formulario siga abierto. Al guardar, el formulario queda lleno.
  - El estado del formulario de edición no ofrece "Cubierta" salvo que ya lo esté.
- [ ] **Step 2: Lista.**
  - El nombre del servicio abre el detalle con `abrirNota`.
  - Etiqueta "Vacaciones" con fila violeta; si además es urgente, la raya es roja.
  - Filtro "Vacaciones": `por_vacaciones` y no cubierta.
  - Debajo de "Cubierta" se ve cada persona: nombre y DNI.
  - "Descargar PDF" para rrhh y admin.
- [ ] **Step 3: Cuadro "Solicitud cubierta".**
  - Al elegir Cubierta en el selector se abre el cuadro, con un renglón por persona pedida (DNI + nombre).
  - Valida con `limpiarPersonas` antes de mandar.
  - Manda PUT con `{...r, estado:'cubierta', personas_tomadas}`.
  - Cancelar no cambia nada.
- [ ] **Step 4: Detalle.** Agrega dirección, supervisor, encargado, la etiqueta Vacaciones y quién entró.
- [ ] **Step 5: Capturas con Chrome headless.**
  - Lista como rrhh, sin abrir notas.
  - Formulario como jefa.
  - Cuadro de Cubierta sobre una solicitud "(prueba)" creada para eso y borrada después.
  - En celular y en oscuro.
  - Sin errores de JS.
- [ ] **Step 6:** commit.

### Task 4: PDF

**Files:**
- Create: `src/lib/pdf-solicitudes.js`
- Test: `tests/pdf-solicitudes.test.mjs`

**Interfaces:**
- `armarPdfSolicitudes(JsPDF, autoTable, { filas, titulo }) -> jsPDF`
- `descargarPdfSolicitudes(solicitudes, filtro)`: es async. Hace import dinámico de jspdf y jspdf-autotable y llama a `doc.save('Solicitudes de personal dd-mm-aaaa.pdf')`.

- [ ] **Step 1: Test.**
  - `armarPdfSolicitudes(jsPDF, autoTable, { filas: filasPdf([...una DENO]), titulo })` → 1 hoja.
  - `doc.output()` contiene `'DENO'` y el título.
- [ ] **Step 2:** falla.
- [ ] **Step 3:** implementar.
  - Tabla `theme:'grid'`, sin membrete.
  - Anchos de columna 40 / 44 / 25 / auto.
  - Encabezado gris `#EDF0F4`.
- [ ] **Step 4:** el test pasa.
- [ ] **Step 5:** conectar el botón de la Task 3.
- [ ] **Step 6: Bajar el PDF desde el navegador headless.** El archivo existe y tiene una hoja.
- [ ] **Step 7:** commit.

### Task 5: Publicar

- [ ] `npm test` completo y lint de los archivos tocados.
- [ ] El usuario corre la migración 20261127 en Supabase (Task 1). Se corren las pruebas de integración (Task 2, Step 4).
- [ ] Cherry-pick de los commits a main en un worktree, `npm ci`, `npm run build`, push de main y dev, y estado de Vercel.
- [ ] Actualizar la memoria: project_solicitud_personal y project_metricas_solicitud_personal (`grupo_id` y `por_vacaciones` para el tablero).
