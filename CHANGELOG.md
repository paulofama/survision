# Changelog — Sistema de Gestión Integral

Cambios por tarea, del más reciente al más viejo. Cada entrada corresponde a un
commit propio, para poder revertirla por separado.

## 2026-10-30 · Seguridad: vistas legibles con la anon key pública

**Problema:** 12 vistas se podían leer sin iniciar sesión, con la anon key que
viaja en la página publicada: sueldos por empleado (311 filas), liquidaciones
de honorarios, permisos de usuarios, costos de recetas, prestaciones. Una vista
no aplica la RLS de sus tablas, y la auditoría miraba sólo tablas.

**Cambios:**
- `migrations/82_vistas_sin_acceso_anonimo.sql` (+ `_revert.sql`, que reabre
  la exposición): saca todo privilegio de `anon` y `PUBLIC` sobre cada vista
  que `anon` pudiera leer. Los usuarios logueados no cambian: ninguna pantalla
  usa estas vistas sin sesión. Verificado contra la API pública: 401.
- `server/scripts/auditar-rls.cjs`: bloque 5 (crítico), que lee cada vista
  como `anon` y cuenta filas, y bloque 6, con las funciones SECURITY DEFINER
  que `anon` puede ejecutar. Las 5 que devuelven datos (`tes_caja_*`,
  `app_costo_laboral_meses`, `app_cobertura_erogaciones_meses`) se probaron
  como `anon` y responden "Sin permiso".
- `docs/SEGURIDAD_RLS.md`: sección de vistas.

**Pendiente:** un usuario logueado todavía lee estas vistas sin la RLS de las
tablas (`security_invoker`, vista por vista).

## 2026-10-30 · Informe de presupuestos en Informes

**Qué es:** el informe mensual de presupuestos, en pantalla y en PDF.
- Ranking de presupuestadoras por monto convertido.
- Cortes por cobertura, cirujano y tiempo a la práctica.
- Conversión por mes de entrega.
- Cartera de aceptados sin operar.
- Practicados a mano sin respaldo en GECLISA.

**Definiciones** (decididas con Paulo):
- **Convertido:** cirugía confirmada contra lo facturado en GECLISA, en el mes
  de la cirugía. No alcanza con estar "practicado" (ver migración 80).
- **Monto:** neto que paga el paciente, sin IVA. La cobertura de la obra social
  va como columna informativa.
- **Obra social:** el presupuesto descontó cobertura. El texto del campo no se
  usa.
- **Tiempo a la práctica:** de la entrega (o la creación) a la cirugía, en 4
  tramos: 0–7, 8–30, 31–60 y más de 60 días. El ranking muestra qué parte del
  monto se operó en la primera semana.
- **Cohortes:** los últimos 6 meses de entrega. Las de menos de 60 días se
  marcan "en curso".
- **Aceptado:** se registra desde julio de 2026. Antes se muestra "sin dato",
  no cero.

**Cambios:**
- `migrations/81_informe_presupuestos.sql` (+ `_revert.sql`): función
  `informe_presupuestos_datos()`. Pide el permiso nuevo
  `informes:presupuestos`, no `informes`, porque el rol Contabilidad tiene
  `informes` y lo usa una presupuestadora. No está asignado a ningún rol: lo
  ven sólo los admin. Devuelve un único jsonb, sin el tope de 1000 filas.
- `src/modules/informes/utils/informePresupuestos.ts`: el cálculo, puro. Lo
  leen la pantalla y el PDF. Tests en `src/test/informePresupuestos.test.ts`.
- `components/InformePresupuestosVista.tsx`, `utils/pdfInformePresupuestos.ts`
  (A4 apaisado, uso interno), `hooks/useInformePresupuestos.ts`.
- `InformesPage`: los informes con permiso propio no se listan a quien no lo
  tiene.
- Gestión de Accesos: permiso "Informes - Presupuestos".

## 2026-10-30 · Verificar contra GECLISA los practicados a mano

**Problema:** de 732 presupuestos en "practicado", 532 se marcaron con el botón
y nunca se cruzaron con lo facturado. El cruce con GECLISA sólo miraba los
"entregado". El informe de presupuestos cuenta como convertido sólo lo
respaldado por GECLISA, así que sin esto contaba 200 operaciones de 732.

**Cambios:**
- `migrations/80_verificar_practicados_a_mano.sql` (+ `_revert.sql`): sólo
  agrega filas a `presupuestos_practica_match`, con
  `revisado_por = 'verificacion_practicados'`. No toca `presupuestos`.
  - **439 confirmados:** una sola práctica, varias del mismo día, o una en la
    fecha marcada a mano.
  - **26 presupuestos a revisión** (sugeridos): varias prácticas y ninguna en
    la fecha marcada, o resultado Rechazado.
  - **67 sin respaldo** en GECLISA: quedan practicados como estaban.
- `server/services/matchPracticasService.js`: el cruce también verifica los
  practicados a mano, con la misma regla, sin cambiarles estado ni fecha.
  Corrido sin escribir antes de la migración daba las mismas 512 filas; después,
  ninguna.
- `server/services/comisionesService.js`: una práctica devengada antes de tener
  match no se devenga de nuevo cuando el cruce la confirma (hoy no hay
  devengos; el caso se volvió posible con el cambio del cruce).

## 2026-10-29 · Volver a pendiente un resultado cargado por error

**Problema:** "Cambiar" revertía con tres escrituras sueltas desde la pantalla. Si
fallaba la segunda, el presupuesto quedaba pendiente y la aceptación seguía
vigente. Además se perdía quién había registrado el resultado y cuándo. Aceptar,
rechazar, sin respuesta y el cierre masivo no dejaban historial. Los bloqueos
(practicado) eran sólo un botón gris, y el historial se podía editar y borrar.

**Cambios:**
- `migrations/79_presupuestos_volver_a_pendiente.sql` (+ `_revert.sql`):
  - Nuevas funciones `presupuesto_chequear_cambio()` y
    `presupuesto_cambiar_resultado()`. Validan, cambian el resultado y bajan la
    aceptación en una transacción.
  - **Bloquean:** caja vigente, cirugía practicada, match confirmado con
    GECLISA y comisión devengada o liquidada.
  - **Advierten:** documentos emitidos. Para seguir hace falta
    `presupuestador:config` y una confirmación.
  - Un trigger escribe el historial de todo cambio de resultado, con quién lo
    había registrado y cuándo. Hay dos columnas nuevas en el historial.
  - Un trigger guardián rechaza el cambio directo a pendiente o a ANULADO.
  - El historial queda SELECT + INSERT.
- Búsqueda:
  - "Cambiar" pasa a llamarse **"Volver a pendiente"**.
  - Link **"Historial"** en la celda del resultado.
  - El ojo de una aceptación revertida ya no se muestra.
  - El cierre masivo deja la observación de que fue masivo.
- Modal de reversión: muestra los bloqueos que devuelve la base y pide
  confirmar si hay papeles emitidos.
- Aceptación: al volver a aceptar, precarga los datos de la aceptación revertida.
- Línea de tiempo:
  - Pasa a un componente propio.
  - Muestra "Pendiente" en vez de "(sin dato)".
  - Dice quién había registrado el resultado anterior.
  - Agrega el LIO.
- Arreglos laterales:
  - El Análisis de resultados excluye los ANULADO.
  - Diagnósticos cuenta sólo las aceptaciones vigentes.
  - El cruce con GECLISA no marca practicado un presupuesto ANULADO
    (`server/services/matchPracticasService.js`).

**Prueba:** P-2026-1081 (ACEPTADO por error) queda para revertirlo desde la
pantalla. No se tocó en la base.

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
