# IMPLEMENTACION_SUELDOS.md

> Plan de implementación archivo por archivo del módulo Carga de Sueldos.
> Claude Code lee este archivo para saber qué entregar a continuación.
> Marcar con `[x]` los items completados.

---

## Estado general

- **Fase actual**: Fase 3 en testing (Fases 1+2+3 entregadas)
- **Última actualización**: 2026-05-28
- **Total estimado original**: ~53 archivos nuevos + 3 modificados
- **Entregado al 2026-05-28**: ~50 archivos del módulo + migraciones 01/02/03/04 + scripts auxiliares

### Snapshot por fase

| Fase | Estado | Migración SQL | Frontend | Backend |
|---|---|---|---|---|
| 1 — Fundamentos | ✅ Completa | Aplicada + patch RLS | ABM empleados, sidebar, permisos | `/api/empleados` |
| 2 — Liquidaciones | ✅ Estructural | Aplicada | Dashboard + MesDetalle + bloques SS/Sindicato | (frontend directo a Supabase) |
| 3 — F.931 + conciliación | ✅ Código listo, **migración pendiente de aplicar** | Lista en `migrations/04_*` | TabF931, TabConciliación, TabAdjuntos | Parser PDF + engine + 4 endpoints |
| 4 — Asiento + exports | ⏳ Pendiente | - | - | - |
| 5 — Reportes + import histórica | ⏳ Pendiente | - | - | - |

### Pendientes que NO bloquean avance

- **Empleados aún no cargados** (esperando datos administrativos del cliente). Los 3 bloques de minuta que dependen de empleados (`BloquePagoSueldos`, `BloqueHorasComplementarias`, `BloqueDiaSanidad`) están como placeholders. Se construyen cuando lleguen los datos.
- **Bloque 2.E backend** (`server/routes/liquidaciones.ts`): el frontend escribe directo a Supabase, este backend es opcional para Fase 2. Puede esperar.

### Para retomar la sesión

Ver `00/SUELDOS_ESTADO_Y_CONTINUIDAD.md` — guía paso a paso de qué hacer al volver, qué probar, gotchas conocidos.

---

## FASE 1 — Fundamentos

**Objetivo**: BD lista + maestro de empleados con ABM + sidebar con link al módulo.

### Bloque 1.A — Base de datos
- [x] `migrations/01_sueldos_fase1_fundamentos.sql` — **APLICADO en Supabase**. 134 cuentas en `plan_cuentas`, 3 tablas creadas (`plan_cuentas`, `empleados`, `log_auditoria_sueldos`), triggers de updated_at y auditoría activos, RLS habilitado.

### Bloque 1.B — Tipos y constantes
- [x] `src/types/sueldos.ts` — interfaces TS para PlanCuenta, Empleado, LogAuditoria, ResultadoOperacion, FiltrosEmpleados + helpers de arrays de valores conocidos. **ENTREGADO** — verificar que esté en disco con `npm.cmd run type-check`.
- [x] `src/utils/sueldos/constantes.ts` — constantes globales: SURVISION_CUIT, SURVISION_RAZON_SOCIAL, mapeo `area → cuenta_contable_default`, labels UI, colores por área. **ENTREGADO** — incluye también códigos de cuentas (gastos/pasivos/activos), labels y colores de estado del mes, helpers `cuentaDefaultPorArea`, `badgeAreaClassName`, `mesLabel`, `periodoLabel`, umbrales de conciliación y `PERMISO_REPORTES_SUELDOS`. Type-check OK.

### Bloque 1.C — Hooks y servicios frontend
- [x] `src/hooks/usePlanCuentas.ts` — lectura del plan completo, filtros por capítulo/imputable, cache local. **ENTREGADO** — cache module-level (TTL 30min) con deduplicación de requests in-flight, helpers `filtrar` / `buscarPorCodigo` / `porCapitulo` / `porPrefijo`, selectores derivados `cuentasImputables` / `cuentasGastosSueldos` / `cuentasPasivosSueldos`, árbol jerárquico via `cta_codigo_madre`, `invalidarCachePlanCuentas()` exportado. Type-check OK.
- [x] `src/hooks/useEmpleados.ts` — CRUD del maestro: crear, listar, editar, dar de baja, búsqueda fuzzy. Cache local. **ENTREGADO** — cache module-level (TTL 5min) invalidada en cada CUD, retorna `ResultadoOperacion<T>` (no throw), `crearEmpleado`/`actualizarEmpleado` con validación de CUIL duplicado, `darDeBaja(id, fecha)` y `reactivar(id)` (soft), `buscarPorId`/`buscarPorCuil` (digit-aware), `filtrar` fuzzy por apellido/nombre/CUIL/doc, derivados `EmpleadoListado` (`es_baja_reciente`, `es_alta_reciente`, `meses_antiguedad`), `empleadosActivos`, `empleadosPorArea`, `estadisticas`. NO setea `updated_at` (lo manejan triggers). Type-check OK.

### Bloque 1.D — Pantallas del módulo
- [x] `src/pages/sueldos/EmpleadosPage.tsx` — listado con filtros (área, estado, búsqueda) + indicadores visuales (activo/baja/alta reciente). **ENTREGADO** — header + 5 stats cards (total/activos/bajas/altas año/bajas año) + barra de filtros (búsqueda fuzzy, select área, select estado defaulteado a activos) + tabla con badge de área, chips "Alta/Baja reciente", antigüedad calculada, cuenta contable visible, estado y acciones (editar → navega al form, dar de baja con modal de fecha, reactivar con confirm). Empty state diferenciado (sin empleados vs sin matches). Subcomponentes `StatCard` y `BajaModal` en module scope. Type-check OK.
- [x] `src/pages/sueldos/EmpleadoFormPage.tsx` — formulario alta/edición con validaciones Zod (CUIL válido con dígito verificador, fechas coherentes, CUIL único). Soporta rutas `/sueldos/empleados/nuevo` y `/sueldos/empleados/:id`. **ENTREGADO** — react-hook-form + zod con 5 secciones (Identificación, Laborales, Contacto, Bancarios, Previsionales). Validador `cuilValido` (algoritmo AFIP) + `formatearCuil` exportados. CBU 22 dígitos opcional. Coherencia nacimiento<ingreso<=hoy, egreso>=ingreso. Auto-fill de `cuenta_contable` cuando cambia el área (solo si es default de otra área o está vacía). Select de cuentas alimentado desde `usePlanCuentas().cuentasGastosSueldos`. Manejo de error `CUIL_DUPLICADO` con `setError` en el campo. Botón submit deshabilitado en edición si `!isDirty`. Estado de empleado se muestra solo-lectura en edición (alta/baja se gestiona desde el listado). Subcomponentes `Seccion` y `Campo` en module scope. Type-check OK.
- [x] `src/components/sueldos/EmpleadoBajaConfirmModal.tsx` — modal confirmación cuando se carga monto a empleado dado de baja. **ENTREGADO** — genérico, props `empleado` + `motivo` opcional + `onConfirm`/`onClose`/`confirmLabel` opcional. Muestra apellido/nombre/CUIL/área + fecha de baja + sugerencia de reactivar. Estilo warning (amarillo) en vez de error porque la acción se permite si confirma. Listo para uso en Fase 2 desde los bloques de minuta. Type-check OK.

### Bloque 1.E — Integración sistema existente
- [x] `src/App.tsx` — agregar rutas `/sueldos/*` con lazy loading. **MODIFICAR archivo existente**. **ENTREGADO** — agregado `Navigate` al import de react-router-dom, removido import de `SueldosPage` placeholder viejo, agregados 2 lazy imports (`SueldosEmpleadosPage`, `SueldosEmpleadoFormPage`), reemplazado el route `/sueldos` con bloque de 4 rutas: `/sueldos → Navigate to /sueldos/empleados`, `/sueldos/empleados`, `/sueldos/empleados/nuevo`, `/sueldos/empleados/:id`. Cero errores TS introducidos (los 11 errores pre-existentes en App.tsx de `ComingSoonPage title=` son bug previo del proyecto y no fueron tocados).
- [x] `src/components/layout/Sidebar.tsx` — agregar entrada "Sueldos" con sub-menú colapsable: Dashboard / Empleados / (Importación e Importación Histórica ocultos hasta Fase 5) / Reportes (oculto si no tiene permiso). **MODIFICAR archivo existente**. **ENTREGADO** — agregado icono `Coins` al import de lucide-react. Removido el sub-item legacy `Sueldos y Cargas` de "Insumos y Costos" (apuntaba al placeholder viejo). Agregada entrada top-level "Sueldos" (con `Coins`) ubicada después de Tesorería para agrupar visualmente bajo FINANZAS. **Decisión de scope**: en Fase 1 sólo se muestra el sub-item "Empleados" (real). Dashboard se agrega en Fase 2 cuando exista `DashboardSueldosPage`, Reportes en Fase 5 cuando exista `ReportesSueldosPage` (evita links que llevan al fallback). Sin `requierePermiso` por ahora (contadoras y Paulo lo usan; el permiso granular `sueldos:reportes` del Bloque 1.G sólo gatea el futuro item Reportes). Cero errores TS introducidos.

### Bloque 1.F — Backend
- [x] `server/routes/empleados.ts` — endpoints `GET /api/empleados`, `POST`, `PUT /:id`, `DELETE /:id`. Cliente Supabase autenticado, respeta RLS. **ENTREGADO como `.js`** (el backend es Node.js plano, no TS). Tocó 3 archivos: (1) **`server/config/supabase.js`** nuevo — cliente Supabase singleton leído desde env vars `SUPABASE_URL`/`SUPABASE_ANON_KEY` (ya estaban en `server/.env`) + helper `mensajeError(error)` que mapea códigos PostgREST a mensajes ES; (2) **`server/routes/empleados.js`** nuevo — 5 endpoints: `GET /` (con filtros `?area`, `?estado`, `?busqueda` via ilike OR), `GET /:id` (maybeSingle → 404 si no existe), `POST /` (validación de campos requeridos + sets enumerados, 409 en CUIL duplicado), `PUT /:id` (validación parcial, no envía `updated_at`), `DELETE /:id` (soft delete con `fecha_egreso` por body/query/default hoy); (3) **`server/index.js`** modificado — `require` + `app.use('/api/empleados', ...)` + endpoint agregado al listado de `/api/health`. Frontend sigue usando Supabase directo (convención del proyecto); estos endpoints quedan disponibles para clientes no-web e importación masiva. `node -c` OK en los 3 archivos.

### Bloque 1.G — Roles
- [x] `src/hooks/useRoles.ts` — agregar permiso `sueldos:reportes` al sistema existente. **MODIFICAR archivo existente**. **ENTREGADO** — la implementación real tocó 3 archivos por cascada de tipos: (1) `types/auth.types.ts` agregada la clave `'sueldos:reportes'` a `MODULOS_SISTEMA` + a `PERMISOS_DEFAULT` (false) + a `PERMISOS_ADMIN` (true); (2) `hooks/useRoles.ts` agregada al array `MODULOS` para que cada nuevo rol reciba la fila al crearse; (3) `pages/GestionAccesosPage.tsx` agregada a `MODULOS_CONFIG` (icono `BarChart3`, color amber) y a `MODULOS_ORDENADOS` para que aparezca en el editor de roles. Sólo Auditor (admin o rol con `puede_ver=true` explícito en la BD) lo ve activado. Cero errores TS introducidos.

**Resultado al terminar Fase 1**: Paulo puede entrar a `/sueldos`, ver la pantalla de empleados vacía, dar de alta empleados con todos los campos validados, listarlos, editarlos, darlos de baja. El sidebar muestra la entrada Sueldos. El permiso de reportes está creado pero sin asignar todavía.

---

## FASE 2 — Carga de minuta

**Objetivo**: dashboard anual operativo + pantalla del mes con los 4-5 bloques de minuta cargables.

### Bloque 2.A — Migración SQL Fase 2
- [x] `migrations/02_sueldos_fase2_liquidaciones.sql` — crear tablas: `liquidaciones_mes`, `liquidacion_bloques`, `liquidacion_lineas_empleado`, `liquidacion_lineas_concepto`. Constraints, índices, triggers de updated_at + auditoría, RLS. **ENTREGADO** — archivo en `migrations/02_sueldos_fase2_liquidaciones.sql` (carpeta creada). 4 tablas con: UNIQUE(anio,mes), CHECK estados (7), CHECK tipos bloque (5), CHECK origen (recibo/facturado/F931/sin_origen), CHECK medio_pago (caja/banco_santander_rio), CHECK coherencia cerrado_at/estado y reapertura_justificacion. FKs ON DELETE CASCADE bloque→liquidacion y línea→bloque; ON DELETE RESTRICT empleado→línea (preserva histórico). Snapshots `area_snapshot`/`cuenta_contable_snapshot` en líneas_empleado (el empleado puede cambiar de área después). Función compartida `set_updated_at` (CREATE OR REPLACE), triggers updated_at en las 4 tablas, función `audit_liquidaciones_mes` que detecta transiciones CIERRE_MES/REAPERTURA_MES y escribe a `log_auditoria_sueldos`. RLS habilitado con políticas permisivas para `authenticated` y `anon` (consistente con Fase 1). Bloque DO de verificación al final + `NOTIFY pgrst` para refrescar cache PostgREST. **PENDIENTE**: Paulo corre el archivo en Supabase SQL editor.

### Bloque 2.B — Tipos
- [x] Ampliar `src/types/sueldos.ts` con tipos: `EstadoLiquidacion`, `TipoBloque`, `LiquidacionMes`, `LiquidacionBloque`, `LiquidacionLineaEmpleado`, `LiquidacionLineaConcepto`, `MedioPago`. **ENTREGADO** — agregado bloque completo de Fase 2 al final del archivo. Incluye además: `OrigenLinea` (recibo/facturado/F931/sin_origen), `ConceptoCodigo` (APORTE_SS, CONTRIB_SS, APORTE_OS, CONTRIB_OS, ART, SCVO, SINDICATO), arrays helper (`ESTADOS_LIQUIDACION_ORDEN`, `TIPOS_BLOQUE`, `TIPOS_BLOQUE_POR_EMPLEADO`/`POR_CONCEPTO`, `MEDIOS_PAGO`, `ORIGENES_LINEA`, `CONCEPTOS_SEGURIDAD_SOCIAL`/`SINDICATO`), variantes `*Nueva`/`*Actualizacion` (insert/update payloads) para las 4 entidades, agregados `LiquidacionBloqueCompleto`/`LiquidacionMesCompleta`/`ResumenBloque`/`ResumenLiquidacionMes`, y `TransicionEstado` para validar transiciones del flujo. Type-check OK.

### Bloque 2.C — Hooks
- [x] `src/hooks/useLiquidacionMes.ts` — cargar mes + bloques, agregar línea, editar, calcular cuadre por bloque, avanzar estados. **ENTREGADO** — hook por mes (recibe `anio, mes`). Carga `LiquidacionMesCompleta` (mes + bloques + líneas anidadas) en 3 queries paralelas. Cache module-level por `${anio}-${mes}` con TTL 90s + dedup de requests in-flight. API: `inicializarMes` (crea fila + 4 bloques estables con defaults `bloquesInicialesDefault`, cleanup si falla la inserción de bloques); CRUD bloque (`agregarBloqueDiaSanidad`, `actualizarBloque`, `eliminarBloqueDiaSanidad`, `marcarBloqueCompleto`); CRUD líneas empleado y concepto (con detección de `EMPLEADO_DUPLICADO`/`CONCEPTO_DUPLICADO` desde código `23505`); selectores `resumen` (memo de `calcularResumenMes` con cuadre por bloque vs `UMBRAL_REDONDEO_ABS`) y `bloquePorTipo`; flujo de estado: `puedeAvanzar` + `avanzarEstado` (VACIO→MINUTA_EN_CARGA al tener primera línea, MINUTA_EN_CARGA→MINUTA_COMPLETA cuando todos los bloques completos), `cerrarMes(confirmacion='CONFIRMAR', cerradoPorNombre?)`, `reabrirMes(justificacion≥10 chars, reabiertoPorNombre?)`. Helpers puros exportados: `bloquesInicialesDefault`, `calcularResumenBloque`, `calcularResumenMes`, `puedeTransicionar`, `invalidarCacheLiquidacion`. Todas las operaciones devuelven `ResultadoOperacion<T>`. Type-check OK.

### Bloque 2.D — Pantallas y componentes
- [x] `src/components/sueldos/CardEstadoMes.tsx` — celda del calendario anual con color/ícono según estado. **ENTREGADO** — usa COLOR_ESTADO_MES + LABEL_ESTADO_MES, ícono por estado (CalendarPlus para sin iniciar, Lock para cerrado, CalendarCheck para asiento generado, CircleDot para otros). Click navega a `/sueldos/mes/:anio/:mes`. Estado "destacado" (anillo azul) para el mes corriente. Muestra fechas de cierre/reapertura debajo del badge si corresponde.
- [x] `src/components/sueldos/GridAnualMeses.tsx` — grilla 3x4 con los 12 meses + selector de año. **ENTREGADO** — responsive (1/2/3/4 cols según breakpoint), selector con chevrons (limites anioMin/anioMax con defaults 2024-2030), monta CardEstadoMes para cada mes pasando la liquidación correspondiente (si existe).
- [x] `src/pages/sueldos/DashboardSueldosPage.tsx` — vista híbrida principal del módulo. **ENTREGADO** — header con título + 3 botones (Refrescar / Empleados / Mes actual), 5 KPIs del año (Iniciados / En carga / Minuta completa / Cerrados / Sin iniciar), GridAnualMeses con resaltado del mes corriente. Consume el hook nuevo `useLiquidacionesAnio(anio)` (cache 60s, devuelve array de LiquidacionMes + `porMes(mes)` selector + `estadisticas`). **PLUS**: hook extra `src/hooks/useLiquidacionesAnio.ts` creado para alimentar el dashboard sin sobrecargar el `useLiquidacionMes` por-mes.
- [x] `src/pages/sueldos/MesDetallePage.tsx` — wrapper con pestañas (Minuta, F.931, Conciliación, Asiento, Adjuntos, Hallazgos). **ENTREGADO como shell inicial** — 6 pestañas declaradas con sus iconos + tag "Fase X" para las que aún no están disponibles; pestaña Minuta activa pero con placeholder hasta que se conecten los bloques. CTA "Iniciar mes" para meses sin fila en BD (llama `inicializarMes()`). Guard de URL inválida (anio/mes fuera de rango). **Pendiente: conectar bloques de minuta** en próximo turno (TabMinuta + BloqueSeguridadSocial + BloqueSindicato; los 3 que requieren empleados quedan para cuando lleguen los datos).
- [x] `src/components/sueldos/TabMinuta.tsx` — contenedor de los 4-5 bloques. **ENTREGADO** — orquesta los 5 bloques: muestra los 3 que requieren empleados como `BloquePendiente` con CTA a `/sueldos/empleados`, monta `BloqueSeguridadSocial` y `BloqueSindicato` (funcionales). Header con resumen (total calculado/declarado, X/Y bloques completos), botón "Avanzar estado" cuando `puedeAvanzar`, botón "Agregar Día Sanidad" si no existe. Banner gris si mes está CERRADO (deshabilita edición).
- [ ] `src/components/sueldos/BloquePagoSueldos.tsx` — tabla por empleado con detalle. *(Pendiente — requiere empleados cargados.)*
- [ ] `src/components/sueldos/BloqueHorasComplementarias.tsx` — idem con marca "facturado". *(Pendiente — requiere empleados cargados.)*
- [ ] `src/components/sueldos/BloqueDiaSanidad.tsx` — bloque opcional. *(Pendiente — requiere empleados cargados.)*
- [x] `src/components/sueldos/BloqueSeguridadSocial.tsx` — 6 conceptos. **ENTREGADO** — tabla con 6 filas siempre visibles (template fijo `CONCEPTOS_SS_TEMPLATE` con códigos canónicos APORTE_SS / CONTRIB_SS / APORTE_OS / CONTRIB_OS / ART / SCVO + cuentas pasivos 2.1.2.02.0X). Subcomponente `FilaConcepto` con auto-save on blur (INSERT si no existe, UPDATE si existe; eliminar con confirmación). Parser de monto que acepta tanto coma como punto decimal. Footer con total calculado vs declarado (editable) + cuadre verde/rojo. Toggle "Bloque completo".
- [x] `src/components/sueldos/BloqueSindicato.tsx` — 1 concepto. **ENTREGADO** — versión compacta de una sola fila (template `SINDICATO` → cuenta `2.1.2.03`). Mismo patrón de save-on-blur. Sin tabla — layout en grid 4 cols (concepto / cuenta / monto editable / acciones).
- [x] `src/components/sueldos/ConfirmarCierreMesModal.tsx` — modal doble confirmación. **ENTREGADO** — exige escribir literal "CONFIRMAR" para habilitar el botón rojo de cierre. Input opcional "Cerrado por nombre" (snapshot al log). Banner explicativo con consecuencias (no se podrá editar, reapertura requiere justificación).
- [x] `src/components/sueldos/ReabrirMesModal.tsx` — modal justificación obligatoria. **ENTREGADO** — textarea con mínimo 10 caracteres, contador (X/500), validación en vivo. Input opcional "Reabierto por". Banner amarillo con info de que la justificación queda en BD y log de auditoría.

**Integración App.tsx + Sidebar.tsx**: agregadas las rutas `/sueldos` (Dashboard) y `/sueldos/mes/:anio/:mes` (MesDetallePage). Sidebar ahora tiene sub-menú "Dashboard" + "Empleados" debajo de "Sueldos". Removido `Navigate` del import de react-router-dom (ya no se usa porque `/sueldos` apunta directo al Dashboard).

**Integración MesDetallePage.tsx**: actualizado para enchufar `TabMinuta` en la pestaña Minuta (pasando todos los handlers del hook) + estado para mostrar `ConfirmarCierreMesModal`/`ReabrirMesModal` desde botones del header del mes (Cerrar / Reabrir).

### Bloque 2.E — Backend
- [ ] `server/routes/liquidaciones.ts` — endpoints CRUD + transiciones de estado.
- [ ] `server/routes/minutas.ts` — endpoints para cargar/editar bloques.

**Resultado al terminar Fase 2**: Las contadoras pueden navegar al dashboard, abrir un mes, cargar los 4 bloques de minuta, ver cuadres en tiempo real, marcar el mes como completo. Cierre/reapertura funcionando.

---

## FASE 3 — F.931 y conciliación

**Objetivo**: subir F.931 con parseo automático + conciliación automática contra minuta.

### Bloque 3.A — Migración SQL Fase 3
- [x] `migrations/04_sueldos_fase3_f931_conciliacion.sql` — tablas `f931_declaraciones`, `f931_adjuntos`, `conciliacion_diferencias`. Bucket Supabase Storage `sueldos-adjuntos` con políticas. **ENTREGADO** (numerada `04_` porque la `03_` se usó para el patch RLS). Incluye: `f931_declaraciones` con columnas tipadas para los 12-15 campos críticos (rem_total, rem_1, rem_2-5, aporte_ss/os, contrib_ss/os, ART, SCVO, asignaciones, total_a_depositar, cantidad_trabajadores) + `campos_extra` JSONB para flexibilidad + `raw_extract_text` para debug del parser + estado (3 valores) + flag `parecio_vep`. `f931_adjuntos` con `tipo_adjunto` (F931_OFICIAL/VEP_ERROR/OTRO), `bucket_path` UNIQUE, `detectado_como_vep`. `conciliacion_diferencias` con `diferencia` GENERATED ALWAYS AS (monto_minuta - monto_f931) STORED + `tipo_diferencia` (5 valores: 3 AUTO + MATERIAL_RESIDUAL + JUSTIFICADA_MANUAL) + CHECK coherencia justificada↔justificacion + UNIQUE(liquidacion_id, bloque_tipo, concepto_codigo). Trigger `audit_f931_declaraciones` que detecta CONFIRMADO_F931/DESCARTADO_F931. Bucket `sueldos-adjuntos` privado (10 MB max, mime PDF/PNG/JPG) + políticas RLS sobre `storage.objects` para anon y authenticated. Bloque DO de verificación al final. **PENDIENTE**: Paulo corre el archivo.

### Bloque 3.B — Tipos
- [x] Ampliar `src/types/sueldos.ts` con tipos: `F931Declaracion`, `F931ParseResult`, `F931ParseError`, `ConciliacionDiferencia`, `TipoDiferencia`. **ENTREGADO** — agregado bloque completo Fase 3 al final del archivo. Incluye: `EstadoF931` (3 valores) + `TIPOS_F931`, `TipoAdjunto` (3) + `TIPOS_ADJUNTO`, `F931Declaracion` con los ~17 campos espejo de la tabla + variantes `Nueva`/`Actualizacion`, `F931Adjunto` + `Nueva`, `F931ParsedFields` (subset para output del parser), `F931ParseErrorCodigo` (5 códigos), `F931ParseError`, `F931ParseResult` (discriminated union por `ok`), `TipoDiferencia` (5 valores) + `TIPOS_DIFERENCIA` y `TIPOS_DIFERENCIA_AUTO`, `ConciliacionDiferencia` (con `diferencia` documentada como GENERATED readonly) + variantes Nueva/Actualizacion, `ResumenConciliacion` (agregado del mes con conteos por tipo + flag `conciliado_completo`), `EntradaConciliacion` (input del engine). También ampliado `AccionAuditoria` con las 5 acciones nuevas del F.931 (INSERT/UPDATE/DELETE/CONFIRMADO/DESCARTADO). Type-check OK.

### Bloque 3.C — Backend (parser)
- [x] `server/services/f931Parser.ts` — parser PDF con `pdf-parse`, detección VEP, validación CUIT/período, extracción de los 25 campos. **ENTREGADO como `.js`** (backend es Node plano, no TS). 3 archivos: (1) **`server/services/f931Parser.js`** nuevo — `parsearF931(buffer, {cuitEsperado, periodoEsperado})` → devuelve `F931ParseResult` (discriminated union). Helpers `detectarTipo`, `extraerCamposF931` (16 campos tipados + 12 en campos_extra JSONB), `extraerCamposVep` (6 conceptos compartidos + nro VEP). Regex validadas contra los 15 PDFs reales en `server/scripts/explorar-f931.js`. Detecta CUIT mismatch y período mismatch como warnings no fatales. (2) **`server/routes/f931.js`** nuevo — `POST /api/f931/parse?anio&mes` con `express.raw({type:'application/pdf', limit:10MB})` + `GET /api/f931/health/parser`. (3) **`server/index.js`** modificado — require + app.use + endpoints listados en /api/health. **Probado**: F.931 (122025) extrae rem_1=11.397.795,79, contrib_ss_351=446.925,82, total calculado=3.903.954,86. VEP (012026) detectado correctamente con warning + extrae los 6 conceptos compartidos. **PLUS extras**: `server/scripts/explorar-f931.js` (script de validación que parsea los 15 PDFs y guarda textos crudos en `server/tmp/extraidos-f931/` para debug futuro) + `pdf-parse@2.4.5` agregado a `server/package.json`.
- [x] `server/services/conciliacionEngine.ts` — reglas automáticas (sindicato, retenciones SUSS, redondeos) + umbral residual $100/0,5%. **ENTREGADO como `.js`**. Función pura `conciliar(liq, f931, options)` → `{ diferencias, resumen }`. Mapea los 6 conceptos canónicos del bloque seguridad_social a los 6 campos del F.931 (APORTE_SS→aporte_ss_301, CONTRIB_SS→contrib_ss_351, etc.). Implementa: AUTO_SINDICATO_NO_F931 (sindicato auto-justificado con leyenda canned), AUTO_REDONDEO (|diff|<$1 o entre $1 y umbral material), MATERIAL_RESIDUAL (>$100 o >0,5%). Si ambos montos son 0, no genera diferencia. Defaults alineados con `src/utils/sueldos/constantes.ts` (UMBRAL_REDONDEO_ABS, UMBRAL_DIFERENCIA_MATERIAL). NO toca BD — sólo computa. Probado contra 5 escenarios reales con `server/scripts/test-conciliacion.js`.
- [x] `server/routes/f931.ts` — `POST /api/f931/parse`. *(Los endpoints `POST /api/f931/:periodo` y `GET /api/f931/:periodo` se manejan desde el frontend escribiendo directo a Supabase, consistente con el patrón del proyecto.)*
- [x] `server/routes/conciliacion.ts` — `GET /api/conciliacion/:periodo`, justificación de diferencias residuales. **ENTREGADO como `.js`**. 3 endpoints: `GET /:anio/:mes` (devuelve diferencias guardadas + resumen), `POST /:anio/:mes/recalcular` (lee minuta + F.931 confirmado, corre engine, hace delete+insert de las no-JUSTIFICADA_MANUAL **preservando** las que el usuario justificó manualmente, devuelve resultado), `PATCH /diferencia/:id/justificar` (marca como JUSTIFICADA_MANUAL con justificación mín 5 chars). Registrado en `server/index.js` + endpoints listados en `/api/health`.

### Bloque 3.D — Hooks y componentes
- [x] `src/hooks/useF931.ts` — upload + parse + edición + confirmación. **ENTREGADO** — hook por `(anio, mes)` con cache module-level TTL 60s + dedup. Flujo completo: `parsearPdf(file)` llama `POST /api/f931/parse` (sólo preview, no persiste); `crearDeclaracion(datos, nombreUsuario?)` sube PDF a Supabase Storage (bucket `sueldos-adjuntos`, path `${anio}/${mes_pad}/${ts}_${slug}`) + INSERT en `f931_declaraciones` (con cleanup si falla) + INSERT en `f931_adjuntos` (con cleanup si falla — borra archivo y declaración); `actualizarCampos(id, cambios)`, `confirmar(id, nombreUsuario?)` (transición → REVISADO_CONFIRMADO + timestamp), `descartar(id)` (→ DESCARTADO), `eliminarAdjunto(id)` (borra fila + archivo de Storage best-effort), `obtenerUrlDescarga(bucketPath, ttlSeg=300)` (createSignedUrl para bucket privado). Precedencia al cargar: REVISADO_CONFIRMADO > PARSEADO_PENDIENTE > DESCARTADO. Type-check OK.
- [x] `src/hooks/useConciliacion.ts` — cálculo de diferencias + estado de revisión. **ENTREGADO** — wrapper de los 3 endpoints de conciliación. Cache module-level TTL 60s. `recalcular()` llama `POST /api/conciliacion/:anio/:mes/recalcular`, actualiza cache + estado en una vuelta. `justificarManual(id, justif, nombreUsuario?)` llama PATCH y refetch. Maneja 404 (sin liquidación) como caso vacío silencioso (no error fatal). Derivados memoizados: `diferenciasPorBloque` (Map por TipoBloque), `pendientes` (solo MATERIAL_RESIDUAL sin justificar). Helper `fetchJson<T>` para abstracción de HTTP con tipado. Type-check OK.
- [x] `src/components/sueldos/TabF931.tsx` — upload con drag&drop + preview de campos extraídos + edición. **ENTREGADO** — 3 estados: (a) sin declaración → `Dropzone` (drag&drop + click input); (b) parseado pero no guardado → preview con `EditorCampos` (15 campos en 4 grupos: General/Remuneraciones/Conceptos VIII/Totales) + `WarningsBanner` (CUIT/período mismatch + alerta VEP detectado) + acciones "Guardar como pendiente" / "Guardar y confirmar" + `<details>` con texto crudo del PDF para debug; (c) declaración persistida → `DetalleDeclaracion` con campos editables si PARSEADO_PENDIENTE_REVISION, read-only si REVISADO_CONFIRMADO + botones Confirmar/Descartar/Reemplazar. Input "Tu nombre" para snapshot al log. Subcomponentes `Dropzone`, `WarningsBanner`, `CampoEditable`, `EditorCampos`, `DetalleDeclaracion` todos en module scope.
- [x] `src/components/sueldos/TabConciliacion.tsx` — tabla resumen + detalle por concepto con justificaciones automáticas. **ENTREGADO** — `HeaderResumen` con 4 KPIs (total / auto-justificadas / residuales pendientes / manuales) + botón "Recalcular" (deshabilitado si no hay F.931 confirmado). Banner amarillo si falta F.931. Tabla con columnas Bloque/Concepto, Minuta, F.931, Diferencia (color-coded), Tipo (badge por TipoDiferencia con leyendas legibles), Justificación (truncada con title), Acción (botón "Justificar" solo en MATERIAL_RESIDUAL pendientes). Modal `JustificarModal` con textarea mín 5 / max 500 chars + contador en vivo + input nombre. Footer con suma absoluta + flag conciliado_completo.
- [x] `src/components/sueldos/TabAdjuntos.tsx` — listado del F.931 adjunto. **ENTREGADO** — tabla con Archivo (nombre + bucket_path mono), Tipo (badge F931_OFICIAL verde / VEP_ERROR amarillo / OTRO gris), Tamaño formateado (KB/MB), Subido (fecha + nombre snapshot), Acciones (Descargar genera signed URL 5 min y abre en pestaña nueva / Eliminar con confirm + borrado de Storage + tabla). Empty state amigable cuando no hay adjuntos.

**Integración MesDetallePage**: enchufados los hooks `useF931` y `useConciliacion` por mes. Las 4 pestañas (Minuta + F.931 + Conciliación + Adjuntos) ya están funcionales; Asiento y Hallazgos quedan placeholder de Fase 4/5. Tab order reordenado para que Adjuntos quede junto a F.931. Type-check OK.

**Resultado al terminar Fase 3**: contadora sube el PDF del F.931, sistema lo parsea solo, la conciliación se calcula automáticamente, las diferencias esperables se documentan solas, las residuales piden justificación.

---

## FASE 4 — Asiento y exportaciones

**Objetivo**: generación de propuesta de asiento + PDF mensual + Excel exportable.

### Bloque 4.A — Migración SQL Fase 4
- [ ] `migrations/04_sueldos_fase4_asientos.sql` — tabla `propuesta_asiento_lineas`.

### Bloque 4.B — Tipos
- [ ] Ampliar `src/types/sueldos.ts` con: `PropuestaAsientoLinea`, `OrigenAsiento`.

### Bloque 4.C — Backend
- [ ] `server/services/asientoGenerator.ts` — algoritmo completo de generación (bruto al Debe + reparto proporcional Rem.1 entre empleados según peso del neto + asiento de cancelación con cuentas separadas).
- [ ] `server/services/pdfReporteGenerator.ts` — PDF mensual con 8 secciones (jsPDF + autotable).
- [ ] `server/services/excelAsientoExporter.ts` — exportación del asiento a XLSX (SheetJS).
- [ ] `server/routes/asientos.ts` — `POST /api/asientos/:periodo/generar`, `GET /api/asientos/:periodo`.
- [ ] `server/routes/reportes-sueldos.ts` — `GET /api/reportes/sueldos/:periodo/pdf`, `GET /api/reportes/sueldos/:periodo/excel-asiento`.

### Bloque 4.D — Hooks y componentes
- [ ] `src/hooks/useAsiento.ts` — generación + consulta.
- [ ] `src/components/sueldos/TabAsiento.tsx` — tabla con doble Debe/Haber (recibo + facturado) + asiento de cancelación + botones export.

**Resultado al terminar Fase 4**: el mes se completa con la generación del asiento. Paulo puede descargar PDF + Excel de cualquier mes desde la pantalla del mes.

---

## FASE 5 — Reportes auditor + importación histórica

**Objetivo**: pantalla de reportes (sólo Auditor) + carga retroactiva de 2025+2026.

### Bloque 5.A — Migración SQL Fase 5
- [ ] `migrations/05_sueldos_fase5_hallazgos.sql` — tabla `hallazgos` + RLS específica (sólo Auditor lee/escribe).

### Bloque 5.B — Tipos
- [ ] Ampliar `src/types/sueldos.ts` con: `Hallazgo`, `CriticidadHallazgo`, `EstadoHallazgo`.

### Bloque 5.C — Backend
- [ ] `server/services/minutaParser.ts` — parser Excel de la minuta del liquidador (formato del liquidador actual).
- [ ] `server/routes/importacion-historica.ts` — `POST /api/importacion/minuta-excel`, `POST /api/importacion/f931-batch`. Modo "Importación Histórica" diferenciado.
- [ ] `server/routes/hallazgos.ts` — CRUD restringido a Auditor.

### Bloque 5.D — Hooks y pantallas
- [ ] `src/hooks/useImportacionHistorica.ts` — estado de la carga masiva.
- [ ] `src/hooks/useHallazgos.ts` — CRUD (sólo Auditor).
- [ ] `src/components/sueldos/TabHallazgos.tsx` — tabla estructurada (criticidad/norma/estado).
- [ ] `src/pages/sueldos/ImportacionHistoricaPage.tsx` — pantalla diferenciada de carga masiva con previews.
- [ ] `src/pages/sueldos/ReportesSueldosPage.tsx` — selector de mes + generación on-demand.

**Resultado al terminar Fase 5**: Paulo ejecuta la importación histórica una sola vez al arranque (carga 2025+2026 en ~30-60 min). El módulo queda 100% funcional.

---

## Reglas de trabajo para Claude Code

1. **NUNCA renegociar decisiones cerradas** que están en `CLAUDE.md`. Si algo parece inconsistente, preguntar a Paulo antes de cambiar el alcance.
2. **Verificar después de cada archivo** con `npm.cmd run type-check`. No avanzar al siguiente si hay errores TS.
3. **Marcar `[x]` el item completado** en este archivo después de entregar y verificar.
4. **No modificar el plan de fases**. Las fases son entregables independientes — terminar una antes de empezar la siguiente.
5. **Archivos completos**: nunca diffs ni snippets. Cuando edites un archivo existente (App.tsx, Sidebar.tsx, useRoles.ts), devolver el archivo entero.
6. **Antes de crear nuevos archivos**, verificar que la ruta exista (`src/types/`, `src/utils/sueldos/`, etc.). Crear directorios si hace falta.
7. **Idempotencia en migraciones**: todas las migraciones SQL deben poder correrse de nuevo sin romper datos (`CREATE TABLE IF NOT EXISTS`, `INSERT ... ON CONFLICT DO UPDATE`, `DROP TRIGGER IF EXISTS` antes de `CREATE TRIGGER`).
8. **Naming**: archivos en español o inglés según convención del proyecto existente. Componentes en PascalCase (`TabMinuta.tsx`), hooks en camelCase prefijo `use` (`useEmpleados.ts`), utilidades en camelCase (`asientoGenerator.ts`).
