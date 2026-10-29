# Changelog — Sistema de Gestión Integral

Cambios por tarea, del más reciente al más viejo. Cada entrada corresponde a un
commit propio, para poder revertirla por separado.

## 2026-10-29 · LIO: Mininuc y prácticas sin lente

**Problema:** el modal de aceptación exigía un LIO para cualquier práctica: un
entropión o una ptosis obligaban a inventar uno (P-2026-733, un láser, quedó
con LIO "Básico"). Además Mininuc (030510) no estaba en la lista de LIO.

**Cambios:**
- `migrations/78_prestaciones_lleva_lio_mininuc.sql` (+ `_revert.sql`):
  - `prestaciones.lleva_lio`: el dato de si la práctica lleva lente. Hay 10
    códigos en true.
  - Función `prestacion_set_lleva_lio()`, para que lo edite quien tenga el
    permiso `presupuestador:config` o `prestaciones`.
  - LIO "Mininuc" con el código 030510.
  - El historial acepta el campo `lio_id`.
  - P-2026-733 queda sin LIO, con constancia en el historial.
- Modal de aceptación: si la práctica no lleva lente, muestra "No lleva lente",
  guarda `lio_id = NULL` y deja "LIO definido" como no aplica. Si edita una
  aceptación, también registra los cambios de LIO.
- PDF: trazabilidad y consentimiento imprimen "No corresponde" en vez del renglón
  en blanco. "LIO indicado" y "LIO ELEGIDO" ya se omitían.
- Diagnósticos: el tilde "Lleva lente intraocular" lee y escribe el dato de la
  prestación.

**Casos de prueba:**
- Mininuc: P-2026-1028, 1032, 1048 y 1050 deducen el LIO "Mininuc".
- Sin lente: P-2026-1084 (entropión), 1076 y 1077 (ptosis).

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
