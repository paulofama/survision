# Seguridad de datos — RLS en Supabase

> Instituto Dr. Mercado · Sistema de Gestión Integral
> Última actualización: **2026-08-10** · Migraciones **35**, **36** y **37**.

## 1. El modelo, en una línea

**La anon key es pública.** Está hardcodeada en `src/shared/lib/supabase.ts` y viaja en el bundle del frontend: cualquiera que abra el sitio la tiene. Con el sistema publicado en Netlify, **lo único que separa los datos de internet es la RLS**.

Consecuencia directa: una tabla sin `ENABLE ROW LEVEL SECURITY`, o con una policy que alcance al rol `anon`, es de **lectura y escritura pública**. No hace falta ninguna credencial más.

## 2. Quién es quién

| Actor | Rol Postgres | Cómo se autentica | RLS |
|---|---|---|---|
| Visitante anónimo | `anon` | la key del bundle | **debe quedar sin acceso a todo** |
| Usuario logueado | `authenticated` | JWT de su sesión | aplica; se filtra por `app_tiene_permiso()` |
| Backend Express | `service_role` | `SUPABASE_SERVICE_ROLE_KEY` en `server/.env` | **la bypassa** |
| Daemons / CLIs | `service_role` | ídem | la bypassa |

`public.app_tiene_permiso('<modulo>')` resuelve el permiso del usuario actual vía `usuarios_sistema → roles → permisos_rol`, con bypass para `roles.es_admin`.

## 3. El patrón correcto

```sql
ALTER TABLE public.<tabla> ENABLE ROW LEVEL SECURITY;

-- Lectura
CREATE POLICY pol_<tabla>_select ON public.<tabla>
  FOR SELECT TO authenticated
  USING (public.app_tiene_permiso('<modulo>'));

-- Escritura
CREATE POLICY pol_<tabla>_write ON public.<tabla>
  FOR ALL TO authenticated
  USING (public.app_tiene_permiso('<modulo>'))
  WITH CHECK (public.app_tiene_permiso('<modulo>'));
```

Nada para `anon`, nunca. Y **si el frontend sólo lee esa tabla, no crear la policy de escritura**: el backend usa `service_role` y no la necesita.

**Cuándo NO restringir el SELECT por módulo.** Varias tablas se leen desde `src/shared/hooks` y las consumen varios módulos a la vez (`honorarios_config` la usan Liquidaciones *y* Análisis Marginal; el catálogo de prácticas lo lee medio sistema). Ahí el SELECT va abierto a `authenticated` y sólo la escritura pide permiso. Restringirlo reproduce el bug conocido de **"la sección se ve vacía y no hay ningún error"**, que es como se manifiesta una RLS mal sembrada.

## 4. La herramienta

```bash
cd server && node scripts/auditar-rls.cjs
```

Sale con **código 1** si encuentra exposición anónima. Cuatro bloques:

| bloque | qué busca | gravedad |
|---|---|---|
| 1 | tablas sin RLS habilitada | **crítico** — expuestas según los GRANT de `anon` |
| 2 | policies que alcanzan al rol `anon` | **crítico** |
| 3 | escritura abierta a cualquier logueado | revisar |
| 4 | RLS sin ninguna policy (deny total) | informativo — si una pantalla se ve vacía, mirá acá |

**Correlo después de crear tablas.** El endurecimiento original (migración 07b) cubrió sólo lo que existía en junio-2026; cada módulo nuevo puede volver a abrir el agujero, y ya pasó dos veces.

## 5. Qué se encontró y se cerró (2026-08-10)

Los tres hallazgos eran **acceso público de lectura y escritura**, verificados en vivo con la anon key del bundle antes de corregirlos.

**Migración 35 — módulo Fiscal.** Las 4 tablas `fiscal_iva_*` tenían `FOR ALL TO anon USING (true)` desde la migración 07; el endurecimiento de la 07b no las alcanzó. Quedaban expuestos 14.892 comprobantes de venta y 1.139 de compra, con CUIT e importes, con permiso de DELETE. Se creó además el permiso propio `fiscal`, que hasta entonces no existía.

**Migración 36 — 14 tablas sin RLS.** Nunca tuvieron `ENABLE ROW LEVEL SECURITY`, así que los GRANT por defecto de `anon` seguían vigentes. Lo más sensible: `liq_honorarios` (52 liquidaciones de honorarios con importes), `liq_honorarios_prestadores`, `honorarios_config` (los %), `prestadores`, `prestaciones_realizadas` (337), `insumos_variables` (236) y las recetas de costos (666 + 119 + 103).

**Migración 37 — catálogo de prácticas.** `prestaciones` (182) y `agrupaciones` (28) tenían `ALL USING(true)` para `authenticated`: cualquier usuario logueado podía editar las prácticas y sus precios, incluidos los roles que ni ven la sección. Menor severidad — requiere cuenta — pero es escritura sin control sobre los precios que alimentan al Presupuestador.

Estado tras las tres: **la auditoría da cero en los cuatro bloques**.

## 6. La trampa: rutas del backend con la anon key

Antes de habilitar RLS en una tabla hay que ver **quién le escribe**. Aparecieron **tres rutas** del backend que armaban su propio cliente con `SUPABASE_ANON_KEY` en vez de usar el compartido, y escriben tablas que se estaban por proteger:

| ruta | tabla | qué hacía |
|---|---|---|
| `routes/prestadores.js` | `prestadores` | sync desde GECLISA |
| `routes/elementos-geclisa.js` | `insumos_variables` | carga del catálogo |
| `routes/nomenclador.js` | `prestaciones` | upsert de precios |

Las tres habrían quedado bloqueadas **en silencio**. Pasaron a `require('../config/supabase').supabase`, que usa `service_role`.

```bash
# antes de tocar RLS:
grep -rn "createClient" server/ --include=*.js | grep -v node_modules
```

`middleware/auth.js` usa la anon key **a propósito** — valida el JWT del usuario contra Supabase Auth. Ese no se toca.

⚠️ **Al desplegar hay que reiniciar el backend on-prem.** Netlify se actualiza solo con el push, pero el Express corre en la máquina del instituto: si no se reinicia, sigue con el código viejo contra la RLS nueva.

## 7. Cómo probar de verdad si una tabla quedó cerrada

Con la anon key del bundle, contra `https://<proyecto>.supabase.co/rest/v1/<tabla>`:

- **Lectura** — `Prefer: count=exact` + `Range: 0-0`, y comparar el `content-range` con el que devuelve la service key. Bloqueado = `*/0`.
- **Escritura** — un INSERT con **payload válido**. Bloqueado de verdad = `42501 new row violates row-level security policy`.

Dos pruebas que **no prueban nada** y confunden:

- Un INSERT con una columna inexistente devuelve **400**: PostgREST rechaza el payload antes de evaluar la RLS.
- Un UPDATE con un filtro que no matchea devuelve **204** aunque la RLS esté negando, porque simplemente afecta 0 filas.

## 8. Pendiente

- Los permisos de `fiscal` se sembraron en **todos** los roles activos para no sacarle el acceso a nadie de golpe. La restricción real por rol quedó como decisión posterior: destildar el checkbox en Roles del Sistema corta el menú **y** los datos, porque la RLS cuelga del mismo permiso.
