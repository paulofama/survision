# CLAUDE.md — SurVisión / Sistema Integral de Gestión

> Este archivo lo lee Claude Code automáticamente al iniciar cada sesión.
> Contiene el contexto del proyecto + convenciones + estado actual.
> No lo modifiques manualmente sin coordinarlo con Paulo.

---

## Identidad del proyecto

- **Sistema**: SurVisión / Sistema Integral de Gestión.
- **Cliente**: Instituto Dr. Mercado / Survisión S.A.
- **CUIT empresa**: 30-70967266-1
- **Naturaleza**: Sistema de gestión financiera y operativa para clínica de oftalmología (cost análisis, rentabilidad marginal, presupuestos, clasificación de gastos, tesorería, liquidaciones de honorarios, seguimiento de pacientes, reportes de gestión).
- **Desarrollador principal**: P. Famá (Paulo). Contador interno de la clínica y desarrollador del sistema.
- **Branding del sistema**: "Sistema Integral de Gestión" (NUNCA "Sistema de Costos").
- **Footer de desarrollo**: "Desarrollo: P. Famá".

---

## Stack tecnológico

- **Frontend**: React 18 + TypeScript + Vite (puerto 3000).
- **Backend**: Express.js (puerto 3001).
- **Base de datos principal**: Supabase principal (proyecto `ecraryyvngnyxusdggvj`).
- **Base de datos secundaria**: Supabase presupuestador (proyecto `eawtvwuayahbldzjzeer`).
- **Base de datos operativa**: GECLISA SQL Server (`192.168.1.73`, DB `GECLISA`, credenciales `survision/survision2024`).
- **Estilos**: Tailwind CSS.
- **Íconos**: Lucide React.
- **Formularios**: React Hook Form + Zod.
- **PDF**: jsPDF + jspdf-autotable.
- **Excel**: xlsx (SheetJS).
- **Routing**: React Router v6 con lazy loading y rutas protegidas.

### Estructura del proyecto

- **Ruta raíz**: `C:\IA\COSTOS\sistema-costos`
- **Launcher**: `START.bat`
- **Frontend**: `/src/...`
- **Backend**: `/server/...` (o el nombre que tenga)

### Organización de carpetas frontend

```
src/
├── pages/                # Páginas/rutas principales
├── hooks/                # Custom hooks (uso para estado y lógica de negocio)
├── types/                # Definiciones TypeScript
├── components/           # Componentes (a veces agrupados por módulo)
├── lib/                  # Configuración Supabase y utilidades base
├── utils/                # Helpers puros
└── App.tsx               # Router principal
```

---

## Convenciones de trabajo (críticas, no negociables)

### 1. Entrega de código

- **Archivos COMPLETOS, no diffs ni snippets**. Paulo siempre quiere el archivo entero con el mismo nombre para drag-and-drop. Cuando Claude Code edite un archivo existente, debe asegurarse de que queda funcionando completo, no parcial.
- Una entrega a la vez. Después de cada archivo, verificar (con `npm run type-check` o `npm run dev`) antes de pasar al siguiente.

### 2. Comportamiento ante incertidumbre

- **NUNCA asumir** estructura de tablas, nombres de columnas, endpoints, paths, ni convenciones específicas sin verificar.
- Preguntar antes de hacer cambios estructurales (especialmente sobre BD).
- Para escrituras a BD: SIEMPRE diagnostic query primero, modificación después.
- **No simular datos**: si no se puede consultar el dato real, decirlo en vez de inventar.

### 3. Migraciones SQL

- Idempotentes: `DROP CONSTRAINT IF EXISTS`, `CREATE TABLE IF NOT EXISTS`, `INSERT ... ON CONFLICT DO UPDATE`.
- Atómicas: envolver en `BEGIN/COMMIT` con bloques de verificación al final.
- Comentadas profusamente.

### 4. Calidad de código

- TypeScript estricto. Sin `any`.
- Componentes funcionales con hooks. Sin clases.
- **Anti-patrón crítico**: NUNCA definir sub-componentes dentro del body del componente padre (causa unmount/remount en cada render, rompe focus de inputs). Mover helpers y subcomponentes a module scope.
- `useCallback` y `useMemo` donde haga falta para evitar re-renders innecesarios.
- Estados con `useState` para componentes simples; custom hooks para lógica compartida. NO usar Redux.

### 5. Estilo visual

- Tailwind CSS, sin CSS custom inline.
- Esquema de colores estándar:
  - Primary: `blue-600`/`blue-700`/`blue-50`
  - Success: `green-600`/`green-700`/`green-50`
  - Warning: `yellow-600`/`yellow-700`/`yellow-50`
  - Error: `red-600`/`red-700`/`red-50`
  - Secondary: `gray-600`/`gray-700`/`gray-50`

### 6. Datos y formato

- **Números argentinos**: SIEMPRE con `Intl.NumberFormat('es-AR')`. Ejemplo: `1.234.567,00`. Nunca abreviar tipo `1.2M`.
- **Moneda**: `Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })`.
- **Fechas**: formato ISO `YYYY-MM-DD` en BD, formato `dd/mm/aaaa` en UI.
- **Códigos y descripciones** del sistema viejo (módulo Insumos): se almacenan UPPERCASE. Pero esto NO aplica a empleados ni cuentas contables.

### 7. Supabase

- Usar SIEMPRE el cliente compartido en `src/lib/supabase.ts`. NO crear clientes nuevos con hardcoded anon keys (rompe RLS).
- **Nunca incluir `updated_at` en INSERT/UPDATE manuales** — es manejado por triggers (devuelve HTTP 400 si se intenta).
- Cuando una tabla nueva no aparece visible en la API, refrescar el cache PostgREST (recreación de tabla o esperar el ciclo de refresh nocturno).

### 8. Comunicación con Paulo

- En español argentino. Tono profesional pero conversacional, no formal-corporativo.
- Sin emojis decorativos en el código ni en mensajes técnicos. Usar emojis solo si son funcionales (íconos de estado en UI tipo ✅ ⚠️).
- Cuando hay decisiones técnicas con tradeoffs, presentar 2-3 opciones con su análisis y dar recomendación, no presumir respuesta única.

---

## Estado actual de módulos

### Módulos en producción
- **Análisis Marginal**: `DashboardMarginalPage`, `PorPrestacionPage`, `EvolucionTemporalPage`.
- **Presupuestador**: `Presupuestador.tsx`, `BusquedaPresupuestosPage`. Base secundaria.
- **Liquidaciones de honorarios**: `LiqHonorariosForm`, `LiqHonorariosList`, `LiqHonorariosReport`.
- **Tesorería/Caja**: implementado. Caja (`MovValoresEnca`: FAC/IC/NC/EC/...) + sección **Pagos a Proveedores** (OP/PV desde `MovProv`, egresos a proveedores, aparte del saldo de caja). Resuelto 2026-06-15.
- **Derivaciones**: con compartir por WhatsApp.
- **Seguimiento de pacientes**: `SeguimientoPacientesPage`, hook `useSeguimientoPacientes`.
- **Gestión de accesos / roles**: `GestionAccesosPage`, `useRoles` (cache de 5min eliminado).
- **PDFs de gestión**: `generarInformeGestion.ts`, `InformeGestionModal`.

### Issues conocidos

- Ninguno pendiente. (Evolución Temporal y Tesorería OP/PV resueltos el 2026-06-15.)

---

## Módulo en construcción: CARGA DE SUELDOS

**Estado actual**: **Las 5 fases completas (2026-06-14).** Fases 1-4 aplicadas y verificadas; 2025 cargado completo (minuta + F.931 + 12 asientos generados) + ene-2026. Fase 5 (Hallazgos + Reportes auditor con PDF de 8 secciones + indicadores comparativos) completa. Detalle en `00/SUELDOS_ESTADO_Y_CONTINUIDAD.md`.

### Decisiones de alcance (cerradas, NO renegociar)

#### Naturaleza
- **Es un papel de trabajo previo a la contabilización oficial**, NO el ERP contable. La contabilidad oficial vive en otro sistema separado.
- Las **contadoras externas** cargan datos en la web (reemplazo del Excel actual del liquidador).
- **Paulo** (contador interno) toma la propuesta de asiento y la lleva al sistema contable real.
- Los reportes analíticos son de gestión interna, **sólo Paulo los ve** (rol Auditor con permiso `sueldos:reportes`).

#### Empresa
- **Empresa única**: Survisión S.A. (CUIT 30-70967266-1). No se diseña multi-empresa.
- Constantes globales en `src/utils/sueldos/constantes.ts`: `SURVISION_CUIT`, `SURVISION_RAZON_SOCIAL`.

#### Plan de cuentas
- Se migró el plan completo (134 cuentas — 121 originales + 13 nuevas) a Supabase tabla `plan_cuentas`.
- **Granularidad máxima de cuentas de sueldos por área**: 4.1.1.01 a 4.1.1.08.
  - 4.1.1.01 SUELDOS ADMINISTRACIÓN
  - 4.1.1.02 SUELDOS LIMPIEZA
  - 4.1.1.03 SUELDOS CIRUGÍAS (dormida, mantener)
  - 4.1.1.04 CARGAS SOCIALES (AGRUPADORA — no imputable)
    - 4.1.1.04.01 CONTRIBUCIONES SEGURIDAD SOCIAL
    - 4.1.1.04.02 CONTRIBUCIONES OBRA SOCIAL
    - 4.1.1.04.03 ART
    - 4.1.1.04.04 SCVO
  - 4.1.1.05 SUELDOS MEDICIÓN
  - 4.1.1.06 SUELDOS RECEPCIÓN
  - 4.1.1.07 SUELDOS CAJERA
  - 4.1.1.08 SUELDOS TELEFONISTA
- **Pasivos sueldos**:
  - 2.1.2.01 SUELDOS Y JORNALES A PAGAR
  - 2.1.2.02 CARGAS SOCIALES A PAGAR (AGRUPADORA — no imputable)
    - 2.1.2.02.01 SS A PAGAR (Aporte 301 + Contrib 351)
    - 2.1.2.02.02 OS A PAGAR (Aporte 302 + Contrib 352)
    - 2.1.2.02.03 ART A PAGAR
    - 2.1.2.02.04 SCVO A PAGAR
  - 2.1.2.03 SINDICATO A PAGAR
- **Activos que se usan** (no se crean):
  - 1.1.1.01 CAJA
  - 1.1.1.03 BANCO SANTANDER RÍO
  - 1.1.4.05 II BB RETENC Y PERCEP (para retenciones SUSS practicadas)

#### Empleados
- Maestro propio en Supabase (tabla `empleados`), con pantalla ABM accesible a contadoras.
- **Cuenta contable estable por empleado** (un empleado, una cuenta). Si rota de área, se modifica el maestro.
- **Listado completo con indicador visual de bajas** + confirmación al cargar monto a empleado dado de baja.

#### Minuta mensual — 4 bloques (estables) + 1 ocasional
1. **Pago de Sueldos** (por área y empleado, contra Banco/Caja)
2. **Pago de Horas Complementarias** (por área y empleado, contra Caja, marcado como "facturado")
3. **Seguridad Social** (6 conceptos, contra Banco)
4. **Sindicato** (contra Banco)
- Bloque ocasional: **Pago día de la Sanidad** (no aparece todos los meses)

#### F.931
- Parseo automático del PDF + revisión humana.
- Detección automática de VEPs subidos por error.
- **Único adjunto obligatorio del mes** dentro del sistema. El resto (VEP, minuta del liquidador, otros) los maneja el liquidador externamente.

#### Propuesta de asiento — METODOLOGÍA
- Etiquetada como **"Propuesta de Asiento (borrador para contabilidad)"** en todas las pantallas y reportes.
- **METODOLOGÍA CONTABLE CORRECTA**: bruto al Debe (no neto).
  - Como la minuta sólo trae netos, el sistema calcula el **bruto estimado por reparto proporcional** del Rem.1 del F.931 entre empleados según peso de su neto sobre el total.
  - Guardar `monto_neto_cargado` (dato cierto) y `bruto_estimado` (calculado). El bruto se marca con asterisco "Estimado por reparto proporcional Rem.1" en reportes.
- **Tabla del asiento con dos pares de columnas**: Debe (recibo) / Haber (recibo) / debe (facturado) / haber (facturado).
- Las horas complementarias van a 4.1.1.0X con origen "facturado", contracuenta 2.1.2.01 (Paulo las reimputa después en sistema contable real a 4.1.2.02).
- **Origen** se muestra como columna en el reporte: `recibo` / `facturado` / `F931` / `—`.
- **Implementado en Fase 4 (2026-06-12)** — decisiones cerradas con Paulo:
  - **Criterio de bruto `RECONCILIABLE`** (default desde 2026-06-13): bruto total = `neto + aporte_301 + aporte_302 + sindicato`, el asiento cuadra sin línea de ajuste. Es el default porque el Rem.1 (base SIPA) de esta nómina está topeado por debajo del bruto real en todos los meses (sueldos > tope), validado sobre los 12 meses de 2025. Criterio alternativo `REM1_AJUSTE` (bruto = Rem.1, brecha a línea de ajuste) disponible en el dropdown como alerta de brecha/tope.
  - **Día Sanidad: integrado al recibo** — sus netos se suman a Pago de Sueldos (entran al reparto del bruto y a `2.1.2.01`), asumiendo que ya está en el Rem.1 del F.931. No se trata por separado.
  - Generar el asiento avanza el estado `CONCILIADO → ASIENTO_GENERADO`; el `bruto_estimado` por empleado se persiste en `liquidacion_lineas_empleado`.

#### Flujo del mes (7 estados)
VACÍO → MINUTA EN CARGA → MINUTA COMPLETA → F931 CARGADO → CONCILIADO → ASIENTO GENERADO → CERRADO
- Avance **automático** hasta CONCILIADO. Manual desde ASIENTO.
- **Reapertura con justificación obligatoria**.
- **Cierre con doble confirmación** (escribir "CONFIRMAR").
- Cualquier contadora puede cargar / editar / generar asiento / cerrar / reabrir. Sin segregación.

#### Conciliación minuta vs F.931
- **Reglas automáticas**:
  - Sindicato no se declara en F.931 → diferencia esperable, auto-justificada.
  - Retenciones SUSS desdobladas (cuando F.931 reporta retenciones aplicadas a SS y OS) → diferencia esperable.
  - Redondeos < $1 → ignorados.
- **Umbral residual material**: diferencia > $100 o > 0,5% del concepto → requiere justificación manual.

#### Reportes
- Acceso restringido SÓLO Paulo (rol Auditor con permiso `sueldos:reportes`).
- PDF mensual imprimible — 8 secciones:
  1. Encabezado (empresa, período, estado)
  2. Resumen ejecutivo
  3. Nómina por empleado (con HC sumadas)
  4. Detalle de la minuta (4-5 bloques)
  5. F.931 del período
  6. Indicadores comparativos (alícuota efectiva mes vs mes anterior — captura quiebres tipo H-01)
  7. Propuesta de asiento (con etiqueta de borrador)
  8. Hallazgos del mes (tabla estructurada con criticidad/norma/estado)
- Exportable también a Excel (la propuesta de asiento, para copy-paste al sistema contable oficial).

#### Tesorería
- **Independencia total** con módulo Sueldos. Sin conciliación cruzada.

#### Carga histórica inicial
- 2025 completo + 2026 hasta hoy (17 meses).
- **Importación masiva automática** — parser de Excel del liquidador + parser de F.931.
- Pantalla "Importación Histórica" diferenciada, sólo activa durante la puesta en marcha.

#### Permisos / roles
- **Contadoras**: TODO lo operativo (carga, edición, conciliación, asiento, cierre, reapertura, ABM empleados).
- **Auditor (Paulo)**: TODO lo de contadoras + sección Reportes + sección Hallazgos.

#### Notificaciones
- SÓLO alertas críticas en pantalla. Sin notificaciones in-app ni email.

### Inventario de archivos del módulo (53 nuevos + 3 modificados)

#### Backend (15 archivos nuevos)
**Rutas**:
- `server/routes/empleados.ts`
- `server/routes/liquidaciones.ts`
- `server/routes/minutas.ts`
- `server/routes/f931.ts`
- `server/routes/conciliacion.ts`
- `server/routes/asientos.ts`
- `server/routes/hallazgos.ts`
- `server/routes/reportes-sueldos.ts`
- `server/routes/importacion-historica.ts`

**Servicios**:
- `server/services/f931Parser.ts`
- `server/services/minutaParser.ts`
- `server/services/asientoGenerator.ts`
- `server/services/conciliacionEngine.ts`
- `server/services/pdfReporteGenerator.ts`
- `server/services/excelAsientoExporter.ts`

#### Frontend (34 archivos nuevos)
**Páginas**:
- `src/pages/sueldos/DashboardSueldosPage.tsx`
- `src/pages/sueldos/MesDetallePage.tsx`
- `src/pages/sueldos/EmpleadosPage.tsx`
- `src/pages/sueldos/EmpleadoFormPage.tsx`
- `src/pages/sueldos/ImportacionHistoricaPage.tsx`
- `src/pages/sueldos/ReportesSueldosPage.tsx`

**Componentes**:
- `src/components/sueldos/TabMinuta.tsx`
- `src/components/sueldos/BloqueDiaSanidad.tsx`
- `src/components/sueldos/BloquePagoSueldos.tsx`
- `src/components/sueldos/BloqueHorasComplementarias.tsx`
- `src/components/sueldos/BloqueSeguridadSocial.tsx`
- `src/components/sueldos/BloqueSindicato.tsx`
- `src/components/sueldos/TabF931.tsx`
- `src/components/sueldos/TabConciliacion.tsx`
- `src/components/sueldos/TabAsiento.tsx`
- `src/components/sueldos/TabAdjuntos.tsx`
- `src/components/sueldos/TabHallazgos.tsx`
- `src/components/sueldos/GridAnualMeses.tsx`
- `src/components/sueldos/CardEstadoMes.tsx`
- `src/components/sueldos/ConfirmarCierreMesModal.tsx`
- `src/components/sueldos/ReabrirMesModal.tsx`
- `src/components/sueldos/EmpleadoBajaConfirmModal.tsx`

**Hooks**:
- `src/hooks/useEmpleados.ts`
- `src/hooks/useLiquidacionMes.ts`
- `src/hooks/useF931.ts`
- `src/hooks/useConciliacion.ts`
- `src/hooks/useAsiento.ts`
- `src/hooks/useHallazgos.ts`
- `src/hooks/usePlanCuentas.ts`
- `src/hooks/useImportacionHistorica.ts`

**Tipos y utilidades**:
- `src/types/sueldos.ts` ✅ (ya entregado, falta verificar que esté en disco)
- `src/utils/sueldos/constantes.ts`
- `src/utils/sueldos/calculadora.ts`
- `src/utils/sueldos/validaciones.ts`

#### Archivos a modificar (3)
- `src/App.tsx` — agregar rutas `/sueldos/*`
- `src/components/layout/Sidebar.tsx` — agregar entrada "Sueldos"
- `src/hooks/useRoles.ts` — agregar permiso `sueldos:reportes`

### Plan de fases (5)
1. **Fase 1 — Fundamentos**: Migración SQL + plan de cuentas + maestro de empleados.
2. **Fase 2 — Carga de minuta**: Dashboard anual + pantalla del mes + 4-5 bloques.
3. **Fase 3 — F.931 y conciliación**: Upload + parser + conciliación automática.
4. **Fase 4 — Asiento y exportaciones**: Propuesta de asiento + PDF mensual + Excel.
5. **Fase 5 — Reportes auditor + importación histórica**: Hallazgos + reportes + importación masiva inicial.

---

## Comandos útiles del proyecto

```cmd
npm.cmd run dev              REM frontend en puerto 3000
npm.cmd run type-check       REM validación TypeScript
npm.cmd run build            REM build producción
npm.cmd run lint             REM ESLint
```

Para entornos PowerShell con restricción de scripts, usar `npm.cmd` en vez de `npm` o cambiar política con `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.

---

## Referencias / archivos importantes ya en el proyecto

- **Plan de cuentas original**: `manual_de_cuentas.xls` (importado a Supabase).
- **Minuta del liquidador 2025**: `Minuta_contable_2025.xlsx` (17 hojas, sep/2024 a dic/2025).
- **Minuta del liquidador 2026**: `Minuta_contable_2026.xlsx`.
- **F.931 PDFs 2025**: 12 archivos (`F_931_012025.pdf` a `F_931_122025.pdf`).
- **Papel de trabajo de auditoría 2025**: `PT_Auditoria_Sueldos_Survision_2025.xlsx` (referencia metodológica).

---

## Última actualización

**Fecha**: 2026-06-14.

**Estado**: **Módulo Sueldos COMPLETO — las 5 fases terminadas.** 2025 cargado de punta a punta (minuta + F.931 + 12 asientos) y reportes de auditoría operativos. Detalle exhaustivo en `00/SUELDOS_ESTADO_Y_CONTINUIDAD.md` (guía operativa para retomar).

**Resumen rápido**:
- ✅ **Fase 1** (Fundamentos): plan de cuentas + maestro empleados + ABM completo, sidebar enchufado, permiso `sueldos:reportes` creado. Aplicada en Supabase. **9 empleados cargados (plantel Dic-2025).**
- ✅ **Fase 2** (Liquidaciones): migración aplicada, dashboard anual, MesDetallePage con tabs, bloques Seguridad Social + Sindicato funcionales, modales cierre/reapertura. **Bloques por empleado (Pago Sueldos / HC / Día Sanidad) construidos 2026-05-31 (`BloquePorEmpleado.tsx`).**
- ✅ **Fase 3** (F.931 + conciliación): migración 04 aplicada, parser PDF validado, conciliación engine probado, tabs F931 / Conciliación / Adjuntos. Validado end-to-end 2026-05-29.
- 🟢 **Fase 4** (Asiento + Excel): migración 05 aplicada y backend verificado (2026-06-12). Generador puro (`asientoGenerator.js`, cuadra exacto), endpoint `/api/asientos`, hook `useAsiento`, `TabAsiento.tsx`, export Excel. Criterio bruto `REM1_AJUSTE` + línea de ajuste; Día Sanidad integrado al recibo. **Falta solo cargar netos por empleado para generar un asiento real.**
- ✅ **Fase 5** (Reportes auditor + Hallazgos + importación histórica): **completa (2026-06-14)**. Migración 06 (`hallazgos_sueldos`) aplicada; `TabHallazgos` (gated rol Auditor); `ReportesSueldosPage` (`/sueldos/reportes`, gated) con serie de indicadores comparativos (alícuota efectiva = contribuciones/bruto) + PDF mensual de 8 secciones (jsPDF). Importación histórica hecha vía scripts (2025 completo + ene-2026). Hallazgo real detectado por los indicadores: alícuota de cargas cae de ~30,5% a ~13,4% en jun-2025 (revisar régimen de contribuciones).

**Próximo paso al retomar**: leer `00/SUELDOS_ESTADO_Y_CONTINUIDAD.md`. Para probar Fase 4 end-to-end, cargar netos por empleado en Pago de Sueldos de un mes y generar el asiento desde la pestaña Asiento.
