-- ============================================================
-- MIGRACIÓN 36: RLS de las 14 tablas que quedaron sin protección
-- Sistema de Gestión Integral - Survisión S.A.
-- ============================================================
-- Auditoría de exposición del 2026-08-10 (posterior a la migración 35). El
-- endurecimiento de la 07b cubrió sólo las tablas que existían entonces; estas
-- 14 nunca tuvieron `ENABLE ROW LEVEL SECURITY`, y el rol `anon` conserva los
-- GRANT por defecto de Supabase (SELECT/INSERT/UPDATE/DELETE).
--
-- ⚠️ La anon key está hardcodeada en `src/shared/lib/supabase.ts` y viaja en el
--    bundle del frontend. Con el sistema publicado en Netlify, esto era acceso
--    de LECTURA Y ESCRITURA público a:
--
--      liq_honorarios (52)             liquidaciones de honorarios con importes
--      liq_honorarios_prestadores (4)  el detalle por prestador
--      honorarios_config (3)           los % de honorarios
--      prestaciones_realizadas (337)   prácticas realizadas
--      prestadores (10)                el padrón de profesionales
--      receta_insumos_directos (666)   recetas de costos
--      insumos_variables (236)         catálogo de insumos con precios
--      receta_pools (119)  practicas_recetas (103)
--      subcategorias_practicas (21)    prestaciones_nombre_mapping (20)
--      derivadores_config (7)          config_analisis_marginal  practica_insumos
--
--    Verificado en vivo antes de esta migración: con la anon key del bundle se
--    listaban las 52 filas de `liq_honorarios` con sus importes, y un INSERT
--    devolvía 400 (error de payload) en vez de 401 — la escritura estaba abierta.
--
-- CRITERIO (deliberado, para no romper nada):
--   - SELECT: cualquier usuario `authenticated`. Es exactamente el
--     comportamiento de hoy para usuarios logueados; lo que se elimina es el
--     acceso ANÓNIMO, que es la vulnerabilidad. Varias de estas tablas se leen
--     desde `src/shared/hooks` y las consumen varios módulos a la vez (ej.
--     `honorarios_config` lo usan Liquidaciones Y Análisis Marginal), así que
--     restringir el SELECT por módulo acá reproduciría el bug conocido de
--     "sección vacía por RLS". Queda como endurecimiento posterior.
--   - INSERT/UPDATE/DELETE: exigen el permiso del módulo dueño de la pantalla.
--   - `anon`: sin ninguna policy. Fuera.
--
-- REQUISITO PREVIO (ya aplicado en el mismo commit): `server/routes/prestadores.js`
-- y `server/routes/elementos-geclisa.js` creaban su propio cliente con la ANON
-- key y escriben en `prestadores` / `insumos_variables`. Se pasaron al cliente
-- compartido (SERVICE_ROLE, bypassa RLS). **Reiniciar el backend al desplegar.**
--
-- Idempotente (DROP POLICY IF EXISTS). Atómica.
-- ============================================================

BEGIN;

DO $$
DECLARE
  -- tabla -> permiso requerido para ESCRIBIR
  mapa CONSTANT text[][] := ARRAY[
    -- Insumos y recetas de costos
    ['receta_insumos_directos',     'insumos'],
    ['receta_pools',                'insumos'],
    ['practicas_recetas',           'insumos'],
    ['practica_insumos',            'insumos'],
    ['insumos_variables',           'insumos'],
    -- Catálogo de prácticas
    ['prestaciones_realizadas',     'prestaciones'],
    ['subcategorias_practicas',     'prestaciones'],
    ['prestaciones_nombre_mapping', 'prestaciones'],
    -- Honorarios y prestadores
    ['liq_honorarios',              'liquidaciones'],
    ['liq_honorarios_prestadores',  'liquidaciones'],
    ['honorarios_config',           'liquidaciones'],
    ['derivadores_config',          'liquidaciones'],
    ['prestadores',                 'liquidaciones'],
    -- Análisis marginal
    ['config_analisis_marginal',    'analisis_marginal']
  ];
  i integer;
  t text;
  permiso text;
BEGIN
  FOR i IN 1 .. array_length(mapa, 1) LOOP
    t       := mapa[i][1];
    permiso := mapa[i][2];

    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      RAISE EXCEPTION 'FALLO 36: no existe la tabla %', t;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS pol_%s_select ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%s_write ON public.%I;', t, t);

    -- Lectura: cualquier usuario logueado (nunca anon).
    EXECUTE format(
      'CREATE POLICY pol_%s_select ON public.%I FOR SELECT TO authenticated USING (true);', t, t);

    -- Escritura: exige el permiso del módulo dueño.
    EXECUTE format(
      'CREATE POLICY pol_%s_write ON public.%I FOR ALL TO authenticated '
      'USING (public.app_tiene_permiso(%L)) WITH CHECK (public.app_tiene_permiso(%L));',
      t, t, permiso, permiso);
  END LOOP;
END $$;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
DO $$
DECLARE
  objetivo CONSTANT text[] := ARRAY[
    'receta_insumos_directos','receta_pools','practicas_recetas','practica_insumos',
    'insumos_variables','prestaciones_realizadas','subcategorias_practicas',
    'prestaciones_nombre_mapping','liq_honorarios','liq_honorarios_prestadores',
    'honorarios_config','derivadores_config','prestadores','config_analisis_marginal'];
  n_sin_rls integer;
  n_anon    integer;
  n_select  integer;
BEGIN
  SELECT count(*) INTO n_sin_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = ANY(objetivo) AND NOT c.relrowsecurity;
  IF n_sin_rls > 0 THEN
    RAISE EXCEPTION 'FALLO 36: quedaron % tablas sin RLS habilitada', n_sin_rls;
  END IF;

  SELECT count(*) INTO n_anon
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = ANY(objetivo) AND 'anon' = ANY(roles);
  IF n_anon > 0 THEN
    RAISE EXCEPTION 'FALLO 36: quedaron % policies con acceso anon', n_anon;
  END IF;

  SELECT count(*) INTO n_select
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = ANY(objetivo) AND cmd = 'SELECT';
  IF n_select <> array_length(objetivo, 1) THEN
    RAISE EXCEPTION 'FALLO 36: se esperaban % policies de SELECT, hay %',
      array_length(objetivo, 1), n_select;
  END IF;

  RAISE NOTICE 'OK 36: RLS habilitada en % tablas (SELECT authenticated, escritura por permiso, anon afuera).',
    array_length(objetivo, 1);
END $$;

COMMIT;
