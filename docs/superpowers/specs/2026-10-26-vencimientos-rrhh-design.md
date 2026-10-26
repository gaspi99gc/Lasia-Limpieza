# Vencimientos de RRHH

Acordado con el usuario el 2026-10-26.

## Para qué

Que RRHH no se olvide de lo que vence: tareas que se repiten (todos los meses,
cada 3, cada 12) y tareas de una sola vez, como entregar una auditoría dentro de
dos meses. Mismo espíritu que trabajos programados, que queda para Operaciones y
supervisión.

## Decisiones del usuario

- **A quién avisa:** se elige en cada vencimiento (personas de RRHH o admin). Por
  defecto, a quien lo carga. Todas ven la lista completa.
- **Repetición:** "una sola vez" o "cada N meses".
- **Cuándo avisa:** 7 días antes, 2 días antes y el día que vence. Deja de
  avisar cuando se marca "Hecho".
- **Notificaciones:** las mismas de ahora (campanita, push, cron de las 8).

## Diseño

- Pantalla propia `/vencimientos`, en el menú de `rrhh` y `admin`. Se descartó
  meterlo en trabajos programados: esos piden servicio, operarios y coordinar, y
  habría que llenar esa pantalla de excepciones.
- Tablas (migración `20261026_vencimientos_rrhh.sql`):
  - `rrhh_vencimientos`: título, nota, fecha (próximo vencimiento), `cada_meses`
    (NULL = una vez), `dia_mes` (el día original), `responsables` (UUID[] de
    app_users), estado `pendiente`/`hecho`, auditoría, anulación.
  - `rrhh_vencimientos_hechos`: cada "Hecho" con quién y cuándo. UNIQUE por
    vencimiento + fecha: un doble clic no avanza la fecha dos veces.
  - `rrhh_vencimientos_avisos`: igual que `trabajos_avisos`, UNIQUE por
    vencimiento + fecha + días antes.
- "Hecho" en uno que se repite: se anota en `hechos` y la fecha avanza
  `cada_meses` respetando `dia_mes` (31 → último día en meses cortos). En uno de
  una sola vez, pasa a estado `hecho`.
- Lista ordenada por fecha: vencidos (rojo, quedan hasta marcarlos), próximos 7
  días, más adelante. Botones Hecho / Editar / Borrar (= anular). Campanita
  arriba a la derecha. Vista de lo ya hecho.
- Avisos: el cron diario existente (`/api/cron/avisos`) suma una parte para
  vencimientos, separada de la de trabajos (si una falla, la otra sale igual).
  Títulos: "Vence en 7 días: …", "⚠ Vence pasado mañana: …", "🔴 Vence hoy: …".
  Abre `/vencimientos`.
- API `/api/vencimientos`: lectura y escritura para `admin` y `rrhh` (regla en
  el middleware + corte en la ruta).

## Orden de trabajo

1. Migración (la corre el usuario).
2. API: listar, crear, editar, anular, marcar hecho, responsables posibles.
3. Pantalla `/vencimientos` + menú + middleware.
4. Avisos en el cron.
5. Prueba en local con vencimientos de prueba que avisan solo al admin; borrar
   todo después. Commit a dev; producción por cherry-pick cuando el usuario diga.
