# Arquitectura modular — Sistema Integral de Gestión

> Refactor de modularización (en curso). Objetivo: pasar de carpetas-por-tipo
> (todo mezclado en `pages/`, `hooks/`, `components/`) a **carpetas-por-dominio**.
> Premisa #1: **el sistema no se rompe** — verificación con `vite build` después
> de cada módulo migrado.
> Iniciado: 2026-06-14 (P. Famá + Claude Code).

---

## 1. Estructura objetivo

```
src/
├── modules/
│   ├── tesoreria/        ✅ PILOTO MIGRADO
│   │   ├── pages/        # TesoreriaDashboard, CajaMovimientos, SaldoHistorico
│   │   ├── hooks/        # useTesoreriaCaja
│   │   └── index.ts      # API pública del módulo
│   ├── sueldos/          ⬜ (hoy en pages/sueldos + components/sueldos + utils/sueldos + types/sueldos.ts)
│   ├── insumos/          ⬜ InsumosVariables, Pools, Recetas, CostosFijos
│   ├── prestaciones/     ⬜ Prestaciones, PrestacionesRealizadas
│   ├── analisis/         ⬜ Dashboard, PorPrestacion, PorPrestador, ObraSocial, Evolución
│   ├── analisis-marginal/⬜ (ya tiene index.ts en pages/analisis-marginal)
│   ├── presupuestador/   ⬜ Presupuestador, BusquedaPresupuestos
│   ├── liquidaciones/    ⬜ Honorarios, Derivaciones
│   ├── turnos/           ⬜ AnalisisTurnos, DiagnosticoTurnos, DetalleAtenciones
│   ├── informes/         ⬜ Informes, InformesEjecutivos, InformeGestion
│   ├── seguimiento/      ⬜ SeguimientoPacientes
│   └── accesos/          ⬜ GestionAccesos, Roles, Usuarios, Login
├── shared/               ⬜ lib (supabase, apiConfig), components (ui, layout, auth, ComingSoon),
│                            context (Auth, TipoCambio), hooks transversales, types globales
└── App.tsx  main.tsx
```

## 2. Reglas del módulo (no negociables)

1. **API pública por `index.ts`**: el resto del sistema importa de `@modules/<x>`, nunca de archivos internos del módulo.
2. **Prohibido el deep-import entre módulos**: el módulo A no entra a `modules/B/...`. Si A necesita algo de B, B lo expone en su `index.ts`.
3. **Lo compartido va a `shared/`** (usado por 2+ módulos): `supabase`, `apiConfig`, `ui/`, `layout/`, contextos, tipos globales.
4. **Path aliases** (ya configurados en `tsconfig.json` + `vite.config.ts`):
   - `@/*` → `src/*` (genérico, ya existía)
   - `@modules/*` → `src/modules/*`
   - `@shared/*` → `src/shared/*`
   Usar aliases para imports a otros módulos / shared; rutas relativas solo **dentro** del mismo módulo.

## 3. Receta de migración de un módulo (probada con Tesorería)

1. **Mapear dependencias** (read-only): grep de los nombres de archivo para ver
   - quién los importa (referencias externas a actualizar, p.ej. `App.tsx`, `Sidebar`),
   - qué importan ellos (rutas relativas `../` a convertir a `@/` o `@shared/`).
2. **Mover** con `Move-Item` (bytes exactos, no Read/Write para no corromper) a `src/modules/<x>/{pages,hooks,components,utils}/`.
3. **Arreglar imports**:
   - Imports a shared / otros módulos → alias (`@/lib/...`, `@shared/...`, `@modules/...`).
   - Imports dentro del mismo módulo → relativos (siguen funcionando si la estructura interna se mantiene).
4. **Crear `index.ts`** con la API pública (re-exporta pages, hooks, tipos).
5. **Actualizar referencias externas** (lazy imports en `App.tsx` → `@modules/<x>/pages/...`; el `Sidebar` usa rutas por string, no cambia).
6. **Verificar**: `npx vite build` debe quedar **verde** (sin "Could not resolve"). Opcional: type-check del módulo en 0.
7. (Bonus) limpiar la deuda de tipos del módulo (imports sin usar, etc.).

## 4. Estado del refactor — ✅ COMPLETO (2026-06-14)

**12 módulos migrados** (`accesos, analisis, analisis-marginal, informes, insumos, liquidaciones, prestaciones, presupuestador, seguimiento, sueldos, tesoreria, turnos`) + **`src/shared/` creado** (components, context, hooks, lib, types, utils). `src/` quedó limpio: solo `modules/`, `shared/`, `test/`, App/main. Imports renombrados de `@/{dir}` → `@shared/{dir}` (vía .NET UTF-8, sin corrupción). Errores TS 340 → 258 (-82 por duplicados muertos borrados). `vite build` verde. Cada paso con commit propio (git instalado → rollback granular). Commit final del shared: `0880dea`.

> **Nota:** el alias `@/* → src/*` sigue existiendo pero ya no se usa para shared (todo es `@shared`). Se puede quitar más adelante. La capa shared incluye hooks cross-dominio (usePrestaciones, useRecetasCostos, useHonorariosConfig, etc.) y componentes/modales que podrían re-homologarse a su módulo en una pasada futura si se quiere más pureza.

> **⚠️ LECCIÓN CRÍTICA (encoding):** NO usar `Get-Content -Raw` + `Set-Content -Encoding utf8` (PowerShell 5.1) para editar archivos en masa: lee el UTF-8 como Windows-1252 y corrompe TODO lo no-ASCII (acentos → mojibake `Ã³`, combining marks → regex inválido). Pasó en 65 archivos; se revirtió lossless con .NET (`[IO.File]::ReadAllText(p,UTF8)` → `GetEncoding(1252).GetBytes` → `UTF8.GetString` → `WriteAllText` con `UTF8Encoding($false)` sin BOM). **Para editar archivos: usar el Edit tool, o .NET con UTF-8 explícito — nunca Set-Content para contenido con acentos.**

### Detalle

- ✅ **Git instalado** (winget) + repo inicializado. Commit baseline `08f923e`; un commit por módulo migrado. `server/.env` y secrets ignorados.
- ✅ **Limpieza (quick wins)**: borrados 3 archivos muertos (sin referencias) →
  `pages/Presupuestador - copia.tsx`, `utils/InformeGestionModal.tsx`,
  `pages/analisis/EvolucionTemporalPage.tsx`. **Bajó errores TS de 340 → 322.**
- ✅ **Aliases** `@modules` / `@shared` configurados (tsconfig + vite).
- ✅ **Módulos migrados** (cada uno con build verde + commit):
  - `tesoreria` (3 pages + useTesoreriaCaja) — piloto
  - `seguimiento` (1 page + hook)
  - `presupuestador` (2 pages)
  - `turnos` (AnalisisTurnos ruteada; **Diagnostico/DetalleAtenciones movidas pero SIN rutear** → decidir wirear o borrar)
  - `accesos` (GestionAccesos + Login + useRoles)
  - `liquidaciones` (honorarios + derivaciones + sub-paquete liq-honorarios)
  - `prestaciones` (2 pages; hooks compartidos quedan en @/hooks)
- ⬜ **Pendiente — cluster analítico entrelazado** (requiere cuidado/decisiones):
  - `analisis` — OJO: páginas sueltas (AnalisisObraSocial, AnalisisPrestador, PorPrestacion, DashboardAnalisis, EvolucionTemporal) Y subcarpeta `pages/analisis/` (AnalisisPorX) → **posible duplicación a resolver antes de mover.**
  - `analisis-marginal` — subcarpeta `pages/analisis-marginal/` + loose AnalisisMarginalPage + componentes compartidos `MarginalLayout`, `InformeGestionModal` + utils `generarInformeGestion`/`pdfGeneratorInformeGestion`.
  - `informes` — InformesPage, InformesEjecutivos + useInformeGestion (comparte InformeGestion con analisis-marginal).
  - `insumos` — InsumosVariables, Pools, Recetas, CostosFijos + muchos hooks/modals (60+ errores TS) ; usePrestaciones compartido.
  - `sueldos` → mover a `modules/sueldos` (grande, muchos cross-refs internos pero autocontenido). `SueldosPage.tsx` loose parece la vieja (verificar si está muerta).
  - `ComingSoonPage` y la capa shared (lib/context/ui/layout) → quedan accesibles vía `@/`.
- 📉 Progreso: páginas sueltas en `src/pages` 30 → 14; hooks sueltos 26 → 22 aprox.

### Hooks COMPARTIDOS detectados (NO mover a un módulo; viven en @/hooks)
`useHonorariosConfig` (honorarios + analisis-marginal + evolucion), `usePrestaciones` (prestaciones + insumos/recetas), `useMovimientosPrestaciones`, `useEvolucionMensual`. Regla: **antes de mover un hook, grep TODO src por importadores; si lo usan 2+ dominios → es shared.**

> **Lección (importante para el mapeo):** algunos imports usan **comillas dobles**
> (`from "../lib/x"`). Al mapear dependencias de un módulo, grep con `from ['"]\.\.?/`
> (ambas comillas), no solo comillas simples. Vite build atrapa los que se escapen.
> **Cuidado:** un archivo MUERTO (sin importadores) con import roto NO rompe `vite build`
> (no entra al grafo) pero SÍ suma error a `tsc` — arreglar/borrar igual.

## 5. Seguridad / rollback

- **Git NO está instalado** en el equipo → no hay control de versiones. Se
  recomienda instalarlo para el resto del refactor (rollback granular).
- Mientras tanto, hay **backup zip** del estado previo:
  `_backup_pre_modular_<timestamp>.zip` (incluye `src/` + configs).
- Regla de oro: **`vite build` verde después de cada módulo**. Si rompe, se revierte ese módulo.

## 6. Notas

- El módulo **Sueldos** (Fases 1-5) ya está internamente modular; su migración a
  `src/modules/sueldos/` es mayormente mover + agregar `index.ts` (sin reescribir lógica).
- `npm run build` = `tsc && vite build`. Hoy `tsc` falla por ~322 errores de tipo
  pre-existentes (módulos viejos). `vite build` solo compila bien. Meta del
  refactor: ir bajando esos errores módulo por módulo hasta que `tsc` quede limpio.
