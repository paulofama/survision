# Changelog — Sistema de Gestión Integral

Cambios por tarea, del más reciente al más viejo. Cada entrada corresponde a un
commit propio, para poder revertirla por separado.

## 2026-10-29 · Prestadoras nuevas en el Presupuestador y Liq. Honorarios (solución transitoria)

**Problema:** la Dra. Francisca Arias (GECLISA `pre_id` 18) no aparecía al emitir
presupuestos, y ni ella ni la Dra. Ignacia Oliva (`pre_id` 17) estaban en Liq.
Honorarios.

**Cambios:**
- `src/shared/utils/medicosPresupuesto.ts` (nuevo): lista única de médicos del
  Presupuestador, con el código guardado en `presupuestos.cirujano`, el nombre a
  mostrar y el **ID de GECLISA** de cada uno. La leen los selectores de cirujano y
  derivador, el PDF de emisión y el Análisis (que antes armaba el nombre desde el
  código y decía "Dr. Oliva"). Se agregó **Dra. Francisca Arias** (`dr_arias`, 18).
- `migrations/77_liq_honorarios_oliva_arias.sql` (+ `_revert.sql`): UNIQUE sobre
  `liq_honorarios_prestadores.pre_id_geclisa` y alta de Oliva (17) y Arias (18).
  `condicion_iva` queda en NULL hasta conocerla; Arias no tiene CUIT en GECLISA.
- Conciliación de costos: Arias Francisca en la lista de médicos.

**Transitorio:** el destino es la tabla `prestadores` como única fuente,
sincronizada desde GECLISA. El ID de GECLISA guardado en los dos lugares es la
clave para ese pase sin duplicar médicos ni romper históricos.

**Pendiente:** definir si a la Dra. Oliva le corresponde porcentaje por
derivación (es derivadora en GECLISA, `EntDer_id` 14, y no está en
`derivadores_config`).
