# HANDOFF — Leer al retomar

> Fecha de cierre: **2026-06-14** (P. Famá + Claude Code).
> Este es el punto de entrada. Para detalle ver:
> - `00/ARQUITECTURA_MODULAR.md` (refactor de módulos)
> - `00/SUELDOS_ESTADO_Y_CONTINUIDAD.md` (módulo Sueldos)
> - Memoria de Claude (`MEMORY.md` + project-modularizacion + project-sistema-costos)

---

## 1. Qué se hizo en esta sesión (resumen)

1. **Módulo Sueldos COMPLETO (Fases 1-5)** y validado end-to-end con datos reales:
   - 2025 cargado entero (minuta + F.931 + 12 asientos generados, cuadran).
   - 2026: solo enero (la minuta solo trae enero; el F.931 de enero es un VEP).
   - Reportes auditor (PDF 8 secciones) + Hallazgos funcionando; PDF verificado visualmente.
2. **Refactor de modularización COMPLETO**: de carpetas-por-tipo a **12 módulos** en `src/modules/` + **`src/shared/`**. `src/` quedó limpio (`modules/`, `shared/`, `test/`, App/main).
3. **Git instalado** + repo inicializado (15 commits, rollback granular). `.env`/secrets ignorados.
4. **Limpieza**: borrados duplicados/código muerto; -errores.
5. **Errores TS: 340 → 136** (con cambios seguros).

**Estado: el sistema funciona** (verificado visualmente, acentos OK). `vite build` verde. Git limpio.

---

## 2. Cómo retomar (levantar la app)

Git ya está instalado en `C:\Program Files\Git`. En PowerShell, si `git` no responde, prependé: `$env:Path += ';C:\Program Files\Git'`.

```powershell
# Liberar puertos (gotcha de huérfanos)
foreach ($port in 3000,3001) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -Expand OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}
# Backend (nodemon, 3001) — usar npm.cmd
cd C:\IA\COSTOS\sistema-costos\server; npm.cmd run dev
# Frontend (Vite, 3000) — en otra terminal
cd C:\IA\COSTOS\sistema-costos; npm.cmd run dev
```
- Verificación rápida: `GET http://localhost:3001/api/f931/health/parser` → 200; abrir `http://localhost:3000`.
- **Para desplegar**: `npx vite build` (verde). `npm run build` (=`tsc && vite build`) **todavía NO pasa** por los 136 errores TS pendientes (ver §3).

---

## 3. DÓNDE QUEDAMOS — próximo trabajo

**Bajar los 136 errores TS pre-existentes restantes** (para que `npm run build` con `tsc` pase).
- Son **deuda de modelo de datos LEGACY** (código viejo, NO de Sueldos): `RecetasCostosPage` (27), `ExcelMasterImportModal` (27), `useInsumosVariables` (15), `PrestacionesRealizadas` (14), `PoolsConfig` (13), etc.
- Categorías: TS2322 (~60, type no asignable), TS2339 (~39, propiedad inexistente), TS7006 (~15, any implícito).
- **NO son mecánicos.** Hay que alinear los types con lo que los hooks realmente devuelven (`useRecetasCostos` 823 líneas, `usePools`, `useInsumosVariables` como fuente de verdad) y **distinguir type-incompleto de bug real**.
- **Bug real ya detectado**: `HonorariosPage` llama `setConfiguraciones` (setter inexistente) — TS2552. Decidir si es bug a arreglar o código muerto.
- **Tipos faltantes**: `ExcelInsumoRow` / `ImportacionExcelResult` no existen en `@shared/types` (ExcelMasterImportModal los importa) — crear o ubicar.
- **Enfoque sugerido**: módulo por módulo (empezar por **insumos**), leyendo los hooks como fuente de verdad, verificando con `npm run type-check` + `npx vite build` tras cada cambio. Consultar a Paulo en los casos que parezcan bugs reales.
- Cómo medir: `npm.cmd run type-check 2>&1 | Select-String 'error TS' | Measure-Object`.

---

## 4. Pendientes (prioridad)

1. **(principal)** Bajar los 136 errores TS legacy → ver §3.
2. Sueldos: cuando lleguen, cargar **F.931 real de enero-2026** (reemplazar el VEP) y la **minuta de feb-2026+** para generar asientos 2026.
3. Sueldos: agregar **"Castillo Romina"** al maestro (falta en ene/feb/mar-2025; bruto/reparto incompletos esos meses).
4. (cosmético) Quitar el alias `@/` (ya sin uso, todo es `@shared`/`@modules`); re-homologar hooks/modales compartidos a su módulo si se quiere más pureza.

---

## 5. GOTCHAS CRÍTICOS (no repetir errores)

- **⚠️ ENCODING (lo más importante):** NUNCA editar archivos con `Get-Content -Raw` + `Set-Content` en PowerShell 5.1 → lee UTF-8 como Windows-1252 y **corrompe acentos/combining-marks** (mojibake). Corrompió 65 archivos esta sesión (se revirtió). **Para editar: usar el Edit tool, o .NET con UTF-8 explícito**: `[IO.File]::ReadAllText(p,[Text.Encoding]::UTF8)` → replace → `[IO.File]::WriteAllText(p, s, (New-Object Text.UTF8Encoding $false))`. El `vite build` atrapa la corrupción si rompe un regex; el mojibake en strings compila pero rompe la UI.
- **Mapeo de imports al modularizar**: grepear con `from ['"]\.\.?/` (AMBAS comillas — varios archivos usan dobles). Antes de mover un hook, grepear TODO src por importadores: si lo usan 2+ dominios → es compartido, va a `@shared/hooks`, NO a un módulo.
- **Dev servers**: `npm.cmd` (no `npm`, por ExecutionPolicy). Procesos node huérfanos ocupan 3000/3001 → liberar antes (ver §2).
- **Supabase**: solo anon key. DDL (migraciones) las aplica Paulo en el SQL Editor (proyecto `eawtvwuayahbldzjzeer`). Tras crear tablas puede dar PGRST205 hasta recargar el schema cache.
- **Build**: `vite build` (esbuild) compila aunque haya errores TS (transpila, no chequea tipos). `tsc` es el que falla. Por eso el deploy va por `vite build`.

---

## 6. Arquitectura actual (referencia rápida)

```
src/
├── modules/   accesos, analisis, analisis-marginal, informes, insumos,
│              liquidaciones, prestaciones, presupuestador, seguimiento,
│              sueldos, tesoreria, turnos   (cada uno con index.ts = API pública)
├── shared/    lib, context, hooks, types, utils, components (ui/layout/auth/modals/ComingSoon)
├── test/
└── App.tsx  main.tsx  index.css
```
- Aliases: `@modules/*` → src/modules/*, `@shared/*` → src/shared/*. (`@/*` → src/* sigue pero sin uso).
- Regla: imports entre módulos / a shared SOLO vía alias; relativo solo dentro del mismo módulo. Nada de deep-import entre módulos.
- Backup de seguridad del estado pre-refactor: `_backup_pre_modular_<timestamp>.zip` en la raíz (además de git).
