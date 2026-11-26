# Solicitud de Personal: mejoras para RRHH y la jefa operativa

Fecha: 2026-11-27. Aprobado por el usuario con capturas de pantalla (mockups sobre la pantalla real) el 26/11.

## Por qué

La jefa operativa carga las solicitudes y RRHH sale a buscar a la gente. Hoy:

- RRHH no se entera de las notas: el 💬 se ve poco y ahí va todo lo importante.
- Le falta el contexto del servicio: dirección, supervisor y quién recibe a la persona.
- Las solicitudes para cubrir vacaciones no se distinguen de las demás.
- La jefa cargó un pedido de 3 personas como 3 solicitudes, pegando la misma nota tres veces.
- RRHH quiere tenerlas en papel.
- Cuando se cubre una solicitud no queda registrado quién entró.

A futuro, el usuario quiere un tablero para detectar rotación ("el mismo puesto pedido 3 veces en dos semanas"). Esta tanda guarda lo que ese tablero va a necesitar.

## Lo que se hace (decisiones del usuario)

1. **"Nota nueva".**
   - Es una etiqueta celeste. RRHH la ve en cada solicitud abierta con nota que todavía no abrió.
   - Al abrir la nota se guarda quién la leyó y cuándo. Solo cuenta si la abre el rol `rrhh`; si la abre admin, la etiqueta sigue.
   - Si la nota cambia, vuelve a ser nueva.
   - En el detalle se lee "Nota leída por X · fecha" o "RRHH todavía no leyó la nota".
   - Ya está hecha en dev; la columna ya está en la base.
2. **Detalle de la solicitud.**
   - Se abre tocando el nombre del servicio, en cualquier solicitud.
   - Muestra la dirección del servicio, acortada a "Calle Quevedo 3365, CABA".
   - Muestra el supervisor según el operativo: los nombres de la app, o el apodo tal cual si no coincide con nadie.
   - Muestra el encargado, la etiqueta Vacaciones y quién entró si ya está cubierta.
3. **Encargado del servicio.** Es un campo opcional en el formulario de la jefa y se guarda **solo en la solicitud**. No se escribe en el servicio: el usuario dice que el encargado cambia seguido.
4. **Para cubrir vacaciones.**
   - En el formulario es un cuadro tildable.
   - En la lista, la etiqueta "Vacaciones" va en violeta y **sin emoji**, con fondo violeta suave y una raya violeta a la izquierda. El rojo queda para urgente.
   - Se suma un filtro "Vacaciones".
5. **"Guardar y cargar otra igual".**
   - Guarda y deja el formulario lleno.
   - Las solicitudes cargadas así comparten un `grupo_id`, para que el tablero futuro las cuente como un solo pedido.
   - Las 3 de DENO (ids 23-25) quedan en un mismo grupo.
6. **PDF simple para RRHH.**
   - Es un botón "Descargar PDF" en la lista, solo para RRHH y admin.
   - Baja una tabla de cuatro columnas: Servicio, Qué se pide, Para cuándo y Comentarios. Es una hoja con título y sin membrete.
   - Respeta el filtro que se esté viendo.
   - Urgente y Vacaciones van escritos debajo del servicio.
7. **Quién entra al puesto.**
   - Al pasar una solicitud a Cubierta se abre el cuadro "¿Quién entra al puesto?", con DNI y nombre completo, un renglón por persona pedida.
   - Sin esos datos no se marca Cubierta; Cancelar deja el estado como estaba.
   - Si se reabre la solicitud, se borran.
   - En la lista se ven debajo de "Cubierta".

**Descartado por el usuario:**
- Motivo obligatorio: queda opcional, como ahora.
- Pantalla aparte de "persona tomada".
- PDF con detalle completo por solicitud.
- Guardar el encargado en el servicio.

**Pendiente de su confirmación:** "Franquero" como tipo de jornada.

## Dónde va cada cosa

- **Base:**
  - En `staff_requests`: `encargado_nombre text`, `por_vacaciones boolean not null default false`, `grupo_id uuid`, `personas_tomadas jsonb` (lista de `{dni, nombre}`).
  - La nota vista ya está (`nota_vista_at`, `nota_vista_por`).
- **Funciones puras con `npm test`:** van en `src/lib/solicitud-personal.js`. Son: dirección corta, días, validación de las personas y del grupo, y las filas del PDF.
- **El PDF:** se arma en el navegador con jsPDF y jspdf-autotable, igual que las actas.
- **El supervisor:** sale de `supervisoresPorServicio` (`src/lib/supervisores-servicio.js`), la misma fuente que Trabajos programados.

## Lo que queda a criterio de quien lo construye

- Textos menores.
- Cómo se ve el cuadro de Cubierta cuando se pidieron muchas personas.
- El estado en el formulario de edición: no ofrece "Cubierta". Para cubrir se usa el selector de la lista, que es el que abre el cuadro.
