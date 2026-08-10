# HANDOFF — Leer al retomar

> Última sesión: **2026-08-10** (P. Famá + Claude Code).
> Este es el punto de entrada. Para detalle ver:
> - `docs/CIRCUITO_QUIRURGICO.md` (circuito quirúrgico: reglas por cobertura, Sobre, caja)
> - `docs/SEGURIDAD_RLS.md` (modelo de RLS, auditoría y hallazgos)
> - `src/CLAUDE.md` (convenciones + estado de módulos)
> - `00/SUELDOS_ESTADO_Y_CONTINUIDAD.md` (módulo Sueldos)
> - `00/ARQUITECTURA_MODULAR.md` (refactor de módulos, 2026-06)
> - Memoria de Claude (`MEMORY.md` + los `project-*` / `reference-*`)

---

## 1. DÓNDE QUEDAMOS — próximo trabajo

**Probar el circuito quirúrgico en el navegador** con los presupuestos de prueba. Está todo desplegado y la base migrada; falta la validación funcional de Administración.

| Presupuesto | Qué verificar |
|---|---|
| **P-2026-813** (Círculo Médico) | Panel: LIO **Monofocal**, fecha **11/08/2026**, LISTO PARA CIRUGÍA 6/6. Caja: prellenado 1.287.040, `+ AVASTIN 106.973,11`, TOTAL 1.394.013,11, **sin IVA**. Sobre: 11 páginas, **4 recetas** (la D es la del Avastin), cronograma apaisado, trazabilidad y consentimiento al final con sello de quirófano. |
| **P-2026-814** (pendiente) | Al Aceptar, el campo LIO tiene que venir con **"Multifocal PanOptix Pro"**, en gris y no editable. |
| **P-2026-810** (Particular) | El checklist **no** debe mostrar "Orden autorizada" ni "Autorización de OS". |

Si la pestaña viene abierta de antes, **Ctrl+F5**: el dev server toma los cambios pero el bundle en memoria del browser no.

---

## 2. Cómo levantar la app

```powershell
# Lo normal: doble clic en START.bat (levanta backend 3001 + frontend 3000).

# A mano, si hace falta:
foreach ($port in 3000,3001) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -Expand OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}
cd C:\IA\COSTOS\sistema-costos\server; npm.cmd run dev   # backend
cd C:\IA\COSTOS\sistema-costos;        npm.cmd run dev   # frontend (otra terminal)
```

- Verificación: `GET http://localhost:3001/api/health` → 200; abrir `http://localhost:3000`.
- **Deploy**: `git push` a `main` → Netlify buildea solo. **El backend Express y los daemons corren on-prem** (necesitan GECLISA y `C:\ia`); el front remoto sólo lee Supabase.
- ⚠️ **Después de un deploy que toque `server/`, reiniciar el backend on-prem**, si no sigue con el código viejo.

---

## 3. Qué se hizo en la última sesión (2026-08-10)

9 commits, de `97b821c` a `3df139a`. 6 migraciones (33 a 38), todas **aplicadas y verificadas** en Supabase.

**A. Circuito quirúrgico — correcciones del testeo de Administración** (`97b821c`, `10185ce`)
Fases 1 y 2 del relevamiento sobre las tres coberturas. Lo grueso: el catálogo de LIOs tenía una sola fila ("Básico") y el LIO no está en el presupuesto sino implícito en la prestación → migración 33 con el mapeo + backfill; checklist declarativo por cobertura; el Sobre partido en 8 documentos con trazabilidad y consentimiento desprendibles; ingreso de caja con carga manual, sin IVA en ninguna cobertura, descuento con "Exento de IVA" y los ítems del presupuesto detallados. Detalle completo en `docs/CIRCUITO_QUIRURGICO.md`.

**B. Seguridad — RLS** (`0a4d99f`, `5c84962`, `db729a4`)
Al ponerle permiso propio al módulo Fiscal apareció que sus tablas eran legibles y escribibles con la anon key pública. La auditoría posterior encontró 14 tablas más sin RLS (incluidas las liquidaciones de honorarios) y el catálogo de precios editable por cualquier logueado. Migraciones 35-37 + `server/scripts/auditar-rls.cjs`. Detalle en `docs/SEGURIDAD_RLS.md`.

**C. Documentación** (`9853f57`, `169136c`)
`docs/CIRCUITO_QUIRURGICO.md` nuevo; `src/CLAUDE.md` al día con Bancos, Fiscal y Turnos (estaba parado en junio).

**D. Membrete de los documentos** (`780e566`, `3df139a`)
El reporte de Sueldos no nombraba al Instituto. Y se sacó el crédito "P. Famá | Desarrollo" de los 7 generadores de documentos — sigue en la UI de la app, no en lo que se le entrega al paciente. La migración 38 sacó además una nota interna que se colaba en el consentimiento.

---

## 4. Pendientes

1. **Probar el circuito** (ver §1).
2. **Texto legal del consentimiento**: sigue el placeholder. Cuando Administración lo entregue, va como **nueva versión vigente** en `presupuestos_textos_legales`, sin tocar código.
3. **Logo institucional**: no existe el archivo en el proyecto. El membrete de todos los PDFs es sólo texto. Con el archivo, se enchufa en `cabecera()` de `pdfBase.ts`.
4. **Hallazgos de datos abiertos** (no son bugs del sistema, los resuelve Paulo):
   - Fiscal jun-2025 y sep-2025: GECLISA muestra más IVA débito que el Excel presentado (~$272k y ~$475k). Chequear contra la DDJJ.
   - Sueldos desde jun-2025: la contribución de seguridad social del F.931 se desploma. Resolver con el liquidador.
5. **Permisos de Fiscal**: hoy lo ven todos los roles (se sembró así para no cortarle el acceso a nadie). Si se quiere restringir, es destildar el checkbox — corta menú y datos a la vez.

---

## 5. GOTCHAS CRÍTICOS (no repetir errores)

- **⚠️ ENCODING:** NUNCA editar archivos con `Get-Content -Raw` + `Set-Content` en PowerShell 5.1 → lee UTF-8 como Windows-1252 y **corrompe acentos** (mojibake). Corrompió 65 archivos una vez. Usar el Edit tool, o .NET con UTF-8 explícito.
- **⚠️ RLS y la anon key:** la anon key es pública (va en el bundle). Toda tabla nueva necesita RLS o queda expuesta a internet. Correr `node server/scripts/auditar-rls.cjs` después de crear tablas. Ver `docs/SEGURIDAD_RLS.md`.
- **⚠️ Rutas del backend con la anon key:** tres rutas armaban su propio cliente con la anon key en vez del compartido, y se habrían roto en silencio al habilitar RLS. Antes de tocar RLS: `grep -rn "createClient" server/ --include=*.js`.
- **Columnas `date` y zona horaria:** `new Date("2026-08-11")` es medianoche UTC = **el día anterior** en Argentina. Las fechas sin hora se formatean sin construir un `Date`. Pasó con la fecha de cirugía del sobre y con `fecha_entrega` en la Búsqueda.
- **jsPDF y WinAnsi:** un carácter fuera de WinAnsi (el menos tipográfico `−`, U+2212) hace que jsPDF codifique **todo el literal** en UTF-16 y salga ilegible. Usar guion ASCII.
- **jsPDF + autotable:** cuando autotable parte una tabla crea la hoja por su cuenta, **sin pasar por el helper de página**, y queda sin membrete ni pie. Ver `pdfBase.ts`.
- **Montos es-AR:** input `type=number` → `parseFloat`, **nunca** el parser es-AR (inflaba x10/x100 los decimales).
- **Dev servers:** `npm.cmd` (no `npm`, por ExecutionPolicy). Procesos node huérfanos ocupan 3000/3001 → liberar antes (§2).
- **Migraciones:** se aplican con `cd server && node scripts/aplicar-migracion.cjs ../../migrations/NN_*.sql` (la ruta se resuelve desde `server/scripts/`). Idempotentes y atómicas, con bloque de verificación que lanza excepción si algo no quedó.
- **No hay rasterizador de PDF** en la máquina. Para revisar un PDF generado: extraer texto con `pdfjs-dist` (está en `server/node_modules`), que además da coordenadas.

---

## 6. Arquitectura actual (referencia rápida)

```
src/
├── modules/   accesos, analisis, analisis-marginal, fiscal, herramientas,
│              informes, insumos, liquidaciones, prestaciones, presupuestador,
│              seguimiento, sueldos, tesoreria (+ bancos), turnos
├── shared/    lib, context, hooks, types, utils, components
├── test/
└── App.tsx  main.tsx  index.css

server/       Express (3001, on-prem) + services/ + scripts/ (daemons y CLIs)
migrations/   SQL numerado, idempotente
docs/         CIRCUITO_QUIRURGICO.md · SEGURIDAD_RLS.md · MANUAL_TECNICO
```

- Aliases: `@modules/*` → src/modules/*, `@shared/*` → src/shared/*.
- Regla: imports entre módulos / a shared SOLO vía alias; relativo sólo dentro del mismo módulo.
- Tareas programadas on-prem: `Survision-SyncGECLISA`, `Survision-SyncTurnos`, `Survision-BancoIngesta` (arrancan un node nuevo por corrida, así que toman el código nuevo solas).
