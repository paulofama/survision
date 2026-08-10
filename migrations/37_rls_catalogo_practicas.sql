-- ============================================================
-- MIGRACIÓN 37: RLS del catálogo de prácticas (escritura con permiso)
-- Sistema de Gestión Integral - Survisión S.A.
-- ============================================================
-- Último punto abierto de la auditoría de RLS del 2026-08-10 (migraciones 35 y
-- 36). `prestaciones` (182 filas) y `agrupaciones` (28) tenían una sola policy:
--
--     FOR ALL TO authenticated USING (true) WITH CHECK (true)
--
-- O sea: **cualquier usuario logueado podía editar el catálogo de prácticas y
-- sus precios**, incluidos los roles que ni siquiera ven la sección
-- (Recepción, Contadora Sueldos). No es exposición pública como la de las
-- migraciones 35/36 — requiere una cuenta —, pero es escritura sin control
-- sobre los precios que alimentan al Presupuestador.
--
-- CRITERIO (el mismo de la 36):
--   - SELECT: cualquier `authenticated`. El catálogo lo leen el Presupuestador,
--     Análisis, Análisis Marginal, Informes y varios hooks compartidos;
--     restringirlo por módulo rompería media app.
--   - INSERT/UPDATE/DELETE: exigen `app_tiene_permiso('prestaciones')`, que es
--     el módulo dueño de la pantalla de ABM (`PrestacionesPage`).
--   - `anon`: sin policies (ya estaba así; estas tablas sí tenían RLS activa).
--
-- REQUISITO PREVIO (mismo commit): `server/routes/nomenclador.js` armaba su
-- propio cliente con la ANON key y hace `upsert` sobre `prestaciones` (sync de
-- precios). Se pasó al cliente compartido (SERVICE_ROLE, bypassa RLS).
-- **Reiniciar el backend al desplegar.**
--
-- Idempotente (DROP POLICY IF EXISTS). Atómica.
-- ============================================================

BEGIN;

DO $$
DECLARE
  tablas CONSTANT text[] := ARRAY['prestaciones', 'agrupaciones'];
  t text;
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      RAISE EXCEPTION 'FALLO 37: no existe la tabla %', t;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    -- La policy vieja, abierta a cualquier logueado para todo.
    EXECUTE format('DROP POLICY IF EXISTS pol_%s_authenticated ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%s_select ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%s_write ON public.%I;', t, t);

    EXECUTE format(
      'CREATE POLICY pol_%s_select ON public.%I FOR SELECT TO authenticated USING (true);', t, t);

    EXECUTE format(
      'CREATE POLICY pol_%s_write ON public.%I FOR ALL TO authenticated '
      'USING (public.app_tiene_permiso(''prestaciones'')) '
      'WITH CHECK (public.app_tiene_permiso(''prestaciones''));', t, t);
  END LOOP;
END $$;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
DO $$
DECLARE
  objetivo CONSTANT text[] := ARRAY['prestaciones', 'agrupaciones'];
  n_abiertas integer;
  n_select   integer;
  n_anon     integer;
BEGIN
  -- No puede quedar ninguna policy de escritura con predicado 'true'.
  SELECT count(*) INTO n_abiertas
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = ANY(objetivo)
     AND cmd <> 'SELECT'
     AND btrim(COALESCE(
           CASE WHEN cmd = 'INSERT' THEN with_check::text ELSE qual::text END,
           'true')) = 'true';
  IF n_abiertas > 0 THEN
    RAISE EXCEPTION 'FALLO 37: quedaron % policies de escritura abiertas', n_abiertas;
  END IF;

  SELECT count(*) INTO n_select
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = ANY(objetivo) AND cmd = 'SELECT';
  IF n_select <> 2 THEN
    RAISE EXCEPTION 'FALLO 37: se esperaban 2 policies de SELECT, hay %', n_select;
  END IF;

  SELECT count(*) INTO n_anon
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = ANY(objetivo) AND 'anon' = ANY(roles);
  IF n_anon > 0 THEN
    RAISE EXCEPTION 'FALLO 37: hay % policies con acceso anon', n_anon;
  END IF;

  RAISE NOTICE 'OK 37: catálogo de prácticas con lectura abierta a logueados y escritura con permiso prestaciones.';
END $$;

COMMIT;
