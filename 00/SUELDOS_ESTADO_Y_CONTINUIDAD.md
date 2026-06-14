# Módulo Sueldos — Estado y guía de continuidad

> Documento de handoff. Leélo entero al retomar la sesión.
> Última actualización: **2026-06-14** (P. Famá + Claude Code) — **Módulo COMPLETO: las 5 fases terminadas.** 2025 cargado de punta a punta + reportes de auditoría operativos.

---

## 1. ¿Dónde estamos parados?

### Fases completadas

- **Fase 1 — Fundamentos** ✅ Estructural completo, aplicado en Supabase.
- **Fase 2 — Liquidaciones mensuales** ✅ Estructural completo, aplicado en Supabase.
- **Fase 3 — F.931 + conciliación** ✅ Completa. Migración 04 aplicada y **validada end-to-end el 2026-05-29** (subir F.931 12/2025 → Storage → conciliación con minuta → 7 diferencias todas auto-justificadas, conciliado completo).

- **Fase 2.bis — Bloques por empleado** ✅ Construidos 2026-05-31 (`BloquePorEmpleado.tsx`: Pago Sueldos / HC / Día Sanidad, auto-save, snapshots, origen recibo/facturado). Con esto la minuta queda completa.

### Fase con código completo (falta aplicar migración + validar con datos reales)

- **Fase 4 — Propuesta de asiento + Excel** 🟡 **Código completo 2026-06-12.** Generador, endpoint, hook, UI y export Excel listos y verificados (test sintético cuadra exacto). **FALTA**: aplicar `migrations/05_sueldos_fase4_asientos.sql` en Supabase y validar end-to-end con netos por empleado cargados (ver Paso 1 más abajo). El PDF mensual de 8 secciones se difiere a Fase 5 (reportes auditor).

### Fase 5 — Reportes auditor + Hallazgos + importación histórica ✅ COMPLETA (2026-06-14)

- **Hallazgos**: migración 06 (`hallazgos_sueldos`) aplicada; `useHallazgos` + `TabHallazgos` (gated rol Auditor) wireado en MesDetallePage.
- **Reportes**: `utils/sueldos/indicadores.ts` (alícuota efectiva = contribuciones/bruto, serie con variaciones), `utils/sueldos/generarReporteSueldosPDF.ts` (PDF 8 secciones jsPDF), `pages/sueldos/ReportesSueldosPage.tsx` (ruta `/sueldos/reportes`, gated, serie anual + PDF/mes), subitem "Reportes" gated en Sidebar.
- **Importación histórica**: hecha vía scripts — 2025 completo (minuta + F.931 + 12 asientos) + ene-2026 minuta.
- **Hallazgo real de los indicadores**: alícuota de cargas cae de ~30,5% (ene-mar) a ~13,4% (jun-dic 2025), quiebre -13,87pp en junio → revisar régimen de contribuciones.

### Pendientes / cosas abiertas (no bloqueantes)

- **Castillo Romina** falta en el maestro (ene-feb-mar 2025 tienen 1 empleada menos en el reparto).
- **2026**: solo enero tiene minuta; falta F.931 real de enero (el actual es VEP) y la minuta de feb+.
- **Sep-Dic 2024**: hay minuta pero sin F.931 (no procesable).
- Día Sanidad: si algún mes NO estuviera en el Rem.1, revisar el criterio (hoy se integra al recibo).

### Estado funcional real (qué se puede usar hoy)

| Funcionalidad | Estado |
|---|---|
| Sidebar con entrada "Sueldos" | ✅ |
| Dashboard anual con grilla de meses | ✅ |
| ABM de empleados | ✅ **9 empleados cargados 2026-05-29** (plantel Dic-2025, áreas de la minuta `C:\FISCAL\Minuta contable 2025.xlsx`) |
| Iniciar un mes (crea los 4 bloques estables) | ✅ |
| Cargar minuta: Seguridad Social (6 conceptos) | ✅ |
| Cargar minuta: Sindicato | ✅ |
| Cargar minuta: Pago Sueldos / HC / Día Sanidad | ✅ **Construidos 2026-05-31** — `BloquePorEmpleado.tsx` (empleados por área, auto-save, snapshots, origen recibo/facturado) |
| Marcar bloques completos + avanzar estado | ✅ |
| Cerrar mes (doble confirmación) + reabrir (justificación) | ✅ |
| Subir F.931, parsear PDF, editar campos, confirmar | ✅ Validado 2026-05-29 |
| Conciliación contra F.931 | ✅ Validado 2026-05-29 |
| Adjuntos del mes | ✅ (upload + persistencia validados; falta probar descarga/eliminar en UI) |
| Generar propuesta de asiento + export Excel | ✅ Validado end-to-end 2026-06-12 con netos reales de Dic-2025 (cuadra $15.881.231,13) |

---

## 2. Lo PRIMERO al retomar

### Paso 0: migración Fase 4 ✅ APLICADA y verificada (2026-06-12)

Migración `migrations/05_sueldos_fase4_asientos.sql` aplicada en Supabase (`eawtvwuayahbldzjzeer`). Las 2 tablas (`asientos_sueldos`, `asiento_sueldos_lineas`) responden. Backend verificado end-to-end: `GET /api/asientos/2025/12` → 404 sano; `POST /generar` → 422 SIN_NETOS (el generador corre OK).

> **Gotcha visto al aplicarla:** (1) un `node index.js` huérfano squateaba el 3001 con el backend viejo → daba 500/404 vacíos en `/api/asientos`; matar el huérfano y arrancar limpio (ver Paso 2 y `project-dev-servers`). (2) Tras crear las tablas, PGRST205 hasta recargar el schema cache (re-correr la migración o `NOTIFY pgrst, 'reload schema'`). (3) Diagnóstico: chequear existencia de tabla con `{head:true,count}` da **falso positivo**; usar `.select('id').limit(1)` real, o `SELECT ... FROM information_schema.tables` en el SQL Editor.

Para **generar un asiento real** ya solo falta cargar **netos por empleado** en el bloque Pago de Sueldos de algún mes. Detectado con `server/scripts/prototipo-asiento.js`: Dic-2025 tiene SS + sindicato + F.931 confirmado pero **0 líneas de pago_sueldos**, por lo que el generador devuelve 422. El generador ya está probado numéricamente con datos sintéticos en `server/scripts/test-asiento.js` (cuadra exacto).

### Paso 1: ~~aplicar la migración Fase 3~~ ✅ YA APLICADA (2026-05-29)

Migración `migrations/04_sueldos_fase3_f931_conciliacion.sql` aplicada en Supabase. Las 3 tablas + bucket existen y responden.

> **Gotcha visto 2026-05-29**: tras aplicar la migración, PostgREST devolvía `404 PGRST205 "Could not find the table ... in the schema cache"` para las 3 tablas de Fase 3 (las de Fase 1/2 andaban). Re-ejecutar la migración 04 (idempotente) forzó el reload del schema cache y se solucionó. Si vuelve a pasar con tablas nuevas: re-correr la migración, o `NOTIFY pgrst, 'reload schema';`, o Dashboard → Settings → API → Reload schema cache.

> **Bug arreglado 2026-05-29**: los inputs de monto de la minuta corrompían los valores (x10/x100) por un round-trip `String(monto)` (punto decimal JS) re-parseado por `parsearMonto` (que trata el punto como separador de miles). Arreglado con helper `montoAInput()` (coma decimal) en `BloqueSeguridadSocial.tsx` y `BloqueSindicato.tsx`. **Replicar el helper** al construir los bloques pendientes (PagoSueldos, HC, DíaSanidad).

### Paso 2: reiniciar el backend

```powershell
cd C:\IA\COSTOS\sistema-costos\server
npm.cmd run dev
```

Necesario porque las rutas `/api/f931/*` y `/api/conciliacion/*` se cargan al arranque.

### Paso 3: validar todo con el script de diagnóstico

```powershell
cd C:\IA\COSTOS\sistema-costos\server
node scripts/test-fase2.js
```

Tiene que dar **OK** o **OK con advertencias** (las advertencias esperadas son: empleados/liquidaciones/F.931/conciliación todavía vacíos). Si hay FAIL, contestar al script en lugar de avanzar.

---

## 3. Cómo probar Fase 3 end-to-end (cuando paso 1-3 estén OK)

1. Levantar el frontend: `cd C:\IA\COSTOS\sistema-costos && npm.cmd run dev`.
2. Loguearse y entrar a **Sueldos**.
3. Click en un mes del calendario (por ejemplo Diciembre 2025) → **Iniciar mes**.
4. Pestaña **Minuta** → cargar montos en Seguridad Social y Sindicato (necesario para conciliar).
5. Pestaña **F.931** → drag&drop un PDF de `C:\FISCAL\931\931\` (ejemplo: `F 931 122025.pdf`).
6. Revisar el preview (los 15 campos pre-poblados). Opcionalmente editar.
7. Click **Guardar y confirmar**.
8. Pestaña **Conciliación** → click **Recalcular**.
9. Mirar las diferencias. Las residuales tienen botón "Justificar" con modal.
10. Pestaña **Adjuntos** → ver el PDF, descargarlo con URL firmada o eliminarlo.

### Test del VEP detection

Subir `F 931 012026.pdf` (es un VEP en realidad, pesa 13 KB vs 120-150 KB de los F.931 normales). Debería detectarlo y mostrar warning amarillo.

---

## 4. Decisiones cerradas que conviene NO renegociar

### Identidad y alcance

- **Empresa única**: Survisión S.A. (CUIT `30-70967266-1`). No multi-empresa.
- **Es un papel de trabajo previo a contabilizar**, NO el ERP contable.
- **Contadoras** cargan la minuta web; **Paulo** (Auditor) ve reportes y arma asiento en sistema contable real externo.

### Plan de cuentas (granularidad)

- Cuentas de sueldos por área: `4.1.1.01` a `4.1.1.08`.
- Pasivos: `2.1.2.01` (sueldos), `2.1.2.02.0X` (cargas), `2.1.2.03` (sindicato).
- Plan total: **134 cuentas** ya en `plan_cuentas` (RLS habilitada con policy para anon).

### Conceptos canónicos del módulo

- **Bloque Seguridad Social**: 6 conceptos = `APORTE_SS` / `CONTRIB_SS` / `APORTE_OS` / `CONTRIB_OS` / `ART` / `SCVO`.
- **Bloque Sindicato**: 1 concepto = `SINDICATO`.
- Estos códigos están hardcodeados en `BloqueSeguridadSocial.tsx`, `BloqueSindicato.tsx`, `conciliacionEngine.js`, `f931Parser.js`. Cambiarlos requiere tocar todos esos archivos.

### Flujo del mes (7 estados)

`VACIO` → `MINUTA_EN_CARGA` → `MINUTA_COMPLETA` → `F931_CARGADO` → `CONCILIADO` → `ASIENTO_GENERADO` → `CERRADO`

- Avance hasta CONCILIADO es automático cuando se cumplen condiciones.
- Cierre desde CONCILIADO o ASIENTO_GENERADO: doble confirmación con texto literal `CONFIRMAR`.
- Reapertura desde CERRADO: justificación obligatoria mín 10 chars.

### Metodología del asiento (Fase 4 — implementada 2026-06-12)

- **Bruto al Debe** (no neto). Como la minuta solo trae netos, se calcula bruto estimado por reparto proporcional entre empleados según peso del neto sobre el total. El reparto ajusta el último centavo para cerrar exacto y se persiste en `liquidacion_lineas_empleado.bruto_estimado`.
- **Criterio de bruto: `RECONCILIABLE` (DEFAULT desde 2026-06-13).** Bruto total = `neto + aporte_301 + aporte_302 + sindicato`; el asiento cuadra sin línea de ajuste. **Por qué es el default:** validando todo 2025 se vio que el **Rem.1 (base SIPA) de esta nómina está topeado por debajo del bruto real en los 12 meses** (los sueldos superan el tope), no solo en aguinaldo. Con `REM1_AJUSTE` daría una línea-plug negativa en el Debe en casi todos los meses.
- Criterio alternativo **`REM1_AJUSTE`** (seleccionable en el dropdown del `TabAsiento`): bruto total = Rem.1 del F.931; la brecha contra `neto+aportes+sindicato` va a una **línea de ajuste** en el Haber ("Otras retenciones a pagar / a determinar"). Útil como alerta de brecha/tope o si en algún período el Rem.1 sí representa el bruto. Si la brecha es negativa (Rem.1 < reconciliable) la línea cae en el Debe (plug sin sentido contable) → ahí conviene RECONCILIABLE.
- **Todos los asientos de 2025 (12 meses) se generaron con RECONCILIABLE y cuadran (ajuste $0).** El default del generador, endpoint, hook y `TabAsiento` es RECONCILIABLE. (rem_4=$18.860.209 en Dic es la base sin tope, por si en el futuro se quiere otro criterio.)
- **Estructura del asiento de devengamiento (sección recibo)**:
  - DEBE: Sueldos por área `4.1.1.0X` (bruto estimado) + Contribuciones `4.1.1.04.01/02/03/04` (351/352/ART/SCVO del F.931).
  - HABER: `2.1.2.01` neto a pagar; `2.1.2.02.01` SS (301+351); `2.1.2.02.02` OS (302+352); `2.1.2.02.03` ART; `2.1.2.02.04` SCVO; `2.1.2.03` sindicato; línea de ajuste (si aplica).
- **Sección facturado (HC)**: Debe `4.1.1.0X` / Haber `2.1.2.01`. Paulo las reimputa después a `4.1.2.02` en el sistema contable real.
- **Día Sanidad** (decidido 2026-06-12): **integrado al recibo**. Sus netos por empleado se suman a Pago de Sueldos: entran al reparto del bruto y van a sueldos del área (Debe) / `2.1.2.01` sueldos a pagar (Haber). **Asume que su remuneración ya está incluida en el Rem.1 del F.931** (es remunerativa y se declaró), por lo que NO hay doble cómputo (el bruto total sigue siendo el Rem.1). El generador emite un warning informativo cuando hay líneas de Día Sanidad. Si en algún caso el Día Sanidad NO estuviera en el Rem.1, habría que revisar este criterio.
- Etiqueta en TODA la UI: **"Propuesta de Asiento (borrador para contabilidad)"**.
- Generar el asiento avanza el estado del mes `CONCILIADO → ASIENTO_GENERADO`; borrarlo lo retrocede a `CONCILIADO`.

### Permisos / roles

- `sueldos:reportes` ya está en el sistema como permiso granular. Solo el rol Auditor (Paulo) lo activa.
- Contadoras: TODO operativo. Auditor: contadoras + Reportes + Hallazgos.

---

## 5. Gotchas y decisiones técnicas a recordar

### Supabase

- **Cliente único**: `src/lib/supabase.ts` apunta al proyecto `eawtvwuayahbldzjzeer`. CLAUDE.md mencionaba otro proyecto principal (`ecraryyvngnyxusdggvj`) pero el código real usa este.
- **RLS de Fase 1** originalmente solo tenía policies para `authenticated`. Se aplicó **patch `migrations/03_patch_rls_fase1_anon.sql`** para agregar policies de `anon` (la app usa anon key porque no implementa `auth.signIn` de Supabase todavía).
- Migraciones aplicadas en Supabase: **01, 02, 03**. **Falta 04**.
- **Nunca enviar `updated_at` en INSERT/UPDATE** — los triggers `set_updated_at` lo manejan. Pasarlo devuelve HTTP 400.

### pdf-parse v2.4.5

- **API nueva basada en clase**: `const { PDFParse } = require('pdf-parse'); const p = new PDFParse({ data: uint8 }); const r = await p.getText(); await p.destroy();`
- Las versiones viejas (`pdfParse(buffer)`) **no funcionan** con este package.
- Convertir Buffer a Uint8Array antes de pasarlo (`new Uint8Array(buffer)`).

### Backend

- Backend es **Node.js plano (JS)**, no TypeScript. Archivos en `server/routes/*.js`, `server/services/*.js`.
- Cliente Supabase del backend: `server/config/supabase.js` con env vars `SUPABASE_URL` / `SUPABASE_ANON_KEY` de `server/.env`.
- Constante `SURVISION_CUIT = '30-70967266-1'` está duplicada en backend (`f931Parser.js`) y frontend (`utils/sueldos/constantes.ts`). Si cambia, actualizar en ambos lados.

### Frontend

- **Patrón del proyecto**: el frontend escribe **directo a Supabase** vía el cliente compartido. El backend Express solo aporta endpoints donde tiene sentido (parser PDF, conciliación con lógica server-side).
- **Vite proxy** redirige `/api/*` al backend en `localhost:3001`. Si Vite arranca en otro puerto (ej. 3001 ocupado) usa el siguiente disponible.
- **Anti-patrón crítico**: NUNCA definir sub-componentes dentro del body del componente padre (causa unmount/remount en cada render, rompe focus de inputs). Mover a module scope.
- **Encoding**: el Write tool puede corromper caracteres unicode combining marks en archivos `.ts`. Usar siempre `̀-ͯ` en regex de normalización en vez de los chars literales. Las cadenas en español con acentos (`Administración`, `Medición`) **sí funcionan**, solo es problema con combining marks.

### F.931

- 14 PDFs reales en `C:\FISCAL\931\931\` (`F 931 MMYYYY.pdf`). Uno de ellos (`F 931 012026.pdf`) es un VEP, no un F.931. Sirve para testear la detección VEP.
- Las regex del parser están validadas contra los 15 PDFs. Si AFIP cambia formato, revisar `server/services/f931Parser.js` con un PDF nuevo y `server/scripts/explorar-f931.js` para validar.
- Textos crudos extraídos quedan en `server/tmp/extraidos-f931/` (gitignorable).
- Cuenta `total_a_depositar` calculada por el parser sumando los 6 conceptos de la Sección VIII del F.931 (no es un campo explícito del PDF).

---

## 6. Estructura de archivos clave del módulo

### Migraciones SQL

```
migrations/
├── 01_sueldos_fase1_fundamentos.sql         # APLICADA (no está en disco, en Supabase)
├── 02_sueldos_fase2_liquidaciones.sql       # APLICADA
├── 03_patch_rls_fase1_anon.sql              # APLICADA
├── 04_sueldos_fase3_f931_conciliacion.sql   # APLICADA (2026-05-29)
└── 05_sueldos_fase4_asientos.sql            # PENDIENTE APLICAR (Fase 4)
```

### Backend

```
server/
├── config/
│   ├── database.js              # SQL Server (GECLISA)
│   └── supabase.js              # NUEVO Fase 1.F — cliente Supabase singleton
├── services/
│   ├── f931Parser.js            # NUEVO Fase 3 — parser PDF
│   ├── conciliacionEngine.js    # NUEVO Fase 3 — función pura conciliar(liq, f931)
│   └── asientoGenerator.js      # NUEVO Fase 4 — función pura generarAsiento(liq, f931, empleados)
├── routes/
│   ├── empleados.js             # NUEVO Fase 1.F
│   ├── f931.js                  # NUEVO Fase 3 — POST /parse + GET /health/parser
│   ├── conciliacion.js          # NUEVO Fase 3 — GET, POST /recalcular, PATCH /justificar
│   └── asientos.js              # NUEVO Fase 4 — GET, POST /generar, DELETE
├── scripts/
│   ├── test-fase2.js            # Diagnóstico de TODAS las fases (10 tablas + storage)
│   ├── explorar-f931.js         # Validador de regex contra los 15 PDFs
│   ├── test-conciliacion.js     # 5 escenarios de conciliación
│   ├── test-asiento.js          # NUEVO Fase 4 — test sintético del generador (cuadre)
│   ├── prototipo-asiento.js     # NUEVO Fase 4 — prototipo read-only contra datos reales
│   ├── explorar-minuta.js       # NUEVO Fase 4 — vuelca una hoja del .xlsx de la minuta
│   └── cargar-netos-minuta.js   # NUEVO Fase 4 — carga netos por empleado desde la minuta (dry-run / --write)
└── index.js                     # MODIFICADO — rutas registradas (incl. /api/asientos)
```

### Frontend

```
src/
├── types/sueldos.ts             # Tipos de Fases 1+2+3 (todo en un archivo)
├── utils/sueldos/constantes.ts  # Constantes, cuentas, labels, colores
├── lib/supabase.ts              # Cliente compartido (anon key)
├── hooks/
│   ├── usePlanCuentas.ts
│   ├── useEmpleados.ts
│   ├── useLiquidacionMes.ts        # Por mes
│   ├── useLiquidacionesAnio.ts     # Por año (para dashboard)
│   ├── useF931.ts                  # F.931: upload + parse + persist
│   ├── useConciliacion.ts          # Wrapper de los 3 endpoints
│   └── useAsiento.ts               # NUEVO Fase 4 — GET / generar / borrar + derivados
├── pages/sueldos/
│   ├── DashboardSueldosPage.tsx
│   ├── EmpleadosPage.tsx
│   ├── EmpleadoFormPage.tsx
│   └── MesDetallePage.tsx          # Tabs: Minuta, F.931, Conciliación, Adjuntos, Asiento
├── utils/sueldos/
│   ├── constantes.ts
│   └── exportarAsiento.ts          # NUEVO Fase 4 — export .xlsx del asiento (SheetJS)
└── components/sueldos/
    ├── GridAnualMeses.tsx
    ├── CardEstadoMes.tsx
    ├── TabMinuta.tsx               # Orquestador
    ├── BloquePorEmpleado.tsx       # Pago Sueldos / HC / Día Sanidad (2026-05-31)
    ├── BloqueSeguridadSocial.tsx   # 6 conceptos (funcional)
    ├── BloqueSindicato.tsx         # 1 concepto (funcional)
    ├── TabF931.tsx                 # Dropzone + preview + edición
    ├── TabConciliacion.tsx         # Tabla diferencias + modal justificar
    ├── TabAsiento.tsx              # NUEVO Fase 4 — criterio + generar + tabla D/H + Excel
    ├── TabAdjuntos.tsx             # Listado con descarga/eliminar
    ├── ConfirmarCierreMesModal.tsx
    ├── ReabrirMesModal.tsx
    └── EmpleadoBajaConfirmModal.tsx
```

### Páginas y app

- `src/App.tsx` — rutas `/sueldos`, `/sueldos/empleados[/:id]`, `/sueldos/mes/:anio/:mes` (lazy)
- `src/components/layout/Sidebar.tsx` — entrada "Sueldos" con sub-menú Dashboard + Empleados

---

## 7. Comandos útiles

```powershell
# Frontend
cd C:\IA\COSTOS\sistema-costos
npm.cmd run dev          # Vite dev server (puerto 3000; usa 3001 si está ocupado)
npm.cmd run type-check   # Validar TypeScript

# Backend
cd C:\IA\COSTOS\sistema-costos\server
npm.cmd run dev          # nodemon (puerto 3001)

# Diagnóstico módulo
cd C:\IA\COSTOS\sistema-costos\server
node scripts/test-fase2.js          # Estado de las 10 tablas + bucket + cuentas críticas
node scripts/explorar-f931.js       # Probar parser contra los 15 PDFs reales
node scripts/test-conciliacion.js   # 5 escenarios del engine de conciliación
```

---

## 8. Siguiente sprint propuesto (orden sugerido)

1. **Aplicar migración 05 y probar Fase 4 end-to-end** (ver Paso 0). Cargar netos por empleado en Pago de Sueldos de un mes → pestaña Asiento → elegir criterio → Generar → verificar que cuadre → exportar Excel. Validar los montos del reparto y de la línea de ajuste con un mes real.
2. **Cargar netos reales de la minuta** (Pago de Sueldos + HC) para los meses que se quieran cerrar. Sin esto el asiento no se puede generar. Fuente: planilla personal / recibos (ver `reference-archivos-fuente` en la memoria).
3. **Fase 5 — Reportes Auditor + Hallazgos + importación histórica**:
   - `server/services/pdfReporteGenerator.js` (PDF mensual con 8 secciones, incl. indicadores comparativos y propuesta de asiento ya disponible de Fase 4)
   - `migrations/06_sueldos_fase5_hallazgos.sql` con RLS solo Auditor
   - Parser Excel de la minuta del liquidador + importación masiva 2025/2026
   - Pantalla `ReportesSueldosPage` (gated por `sueldos:reportes`) + `TabHallazgos`

### (referencia) Detalle Fase 5 original:
   - `migrations/06_sueldos_fase5_hallazgos.sql` con RLS solo Auditor
   - Parser Excel de la minuta del liquidador
   - Importación masiva 2025+2026 (~30-60 min para Paulo)
   - Pantalla `ReportesSueldosPage` (gated por `sueldos:reportes`)
   - `TabHallazgos`

---

## 9. Quien está donde

- **Cliente**: Instituto Dr. Mercado / Survisión S.A. (CUIT `30-70967266-1`).
- **Desarrollador principal y único usuario Auditor**: P. Famá (paulofama@outlook.com).
- **Contadoras** (usuarias operativas): cargan minuta web reemplazando el Excel del liquidador.
- **Liquidador externo**: genera el F.931 y la minuta Excel del mes; Paulo recibe ambos.

---

## 10. Convenciones del proyecto que conviene recordar

- Español argentino, sin emojis decorativos (solo funcionales tipo ✅ ⚠️).
- Números formato AR (`1.234.567,00`), nunca abreviado `1.2M`.
- Fechas ISO en BD, `dd/mm/aaaa` en UI.
- Archivos COMPLETOS al entregar (no diffs) cuando se hace handoff de código.
- TypeScript estricto, sin `any`.
- Tailwind sin CSS inline. Paleta: blue / green / yellow / red / gray (50/100/600/700).
- Subcomponentes en module scope (no dentro del body del padre).
- Migraciones idempotentes con `BEGIN/COMMIT` + bloque `DO` de verificación al final.
- `npm.cmd` en vez de `npm` por la política de ExecutionPolicy de PowerShell.
