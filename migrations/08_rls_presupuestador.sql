-- ============================================================
-- MIGRACIÓN 08 — Endurecimiento de RLS: módulo Presupuestador
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
--
-- Cierra el acceso anon a los datos del Presupuestador (hoy anon lee las 800
-- budgets y los 463 pacientes con PII). Reemplaza las policies permisivas por:
--
--   - presupuestos, pacientes, secuencias  → solo usuarios con permiso
--     'presupuestador' (app_tiene_permiso, de 07a). Admins pasan siempre.
--   - prestaciones, agrupaciones (referencia COMPARTIDA con el sistema de
--     costos) → al menos exigir sesión (authenticated); NO se atan a un módulo
--     todavía para no romper el sistema de costos. El gating fino de estas dos
--     va con el hardening del módulo de costos/prestaciones.
--
-- El frontend del Presupuestador YA manda el JWT del usuario (getAuthHeaders
-- en Presupuestador.tsx y BusquedaPresupuestosPage.tsx; las lecturas de
-- prestaciones/agrupaciones usan el cliente Supabase compartido), así que estas
-- policies se satisfacen con la sesión del usuario.
--
-- Idempotente (dropea todas las policies de cada tabla antes de recrear).
-- Atómica. La service_role del backend bypassa RLS (no la afecta).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Dropear TODAS las policies existentes de las tablas objetivo
-- ------------------------------------------------------------
DO $$
DECLARE
  r record;
  objetivo text[] := ARRAY['presupuestos', 'pacientes', 'secuencias', 'prestaciones', 'agrupaciones'];
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY(objetivo)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 2. Datos del Presupuestador: gateados por permiso 'presupuestador'
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
  datos text[] := ARRAY['presupuestos', 'pacientes', 'secuencias'];
BEGIN
  FOREACH t IN ARRAY datos LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      || 'USING (public.app_tiene_permiso(''presupuestador'')) '
      || 'WITH CHECK (public.app_tiene_permiso(''presupuestador''))',
      'pol_' || t || '_presupuestador', t
    );
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3. Referencia compartida (prestaciones, agrupaciones): exigir sesión
--    (cierra el leak a anon; el gating fino va con el módulo de costos)
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
  ref text[] := ARRAY['prestaciones', 'agrupaciones'];
BEGIN
  FOREACH t IN ARRAY ref LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      'pol_' || t || '_authenticated', t
    );
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 4. Verificación: sin policies anon en las 5 tablas objetivo
-- ------------------------------------------------------------
DO $$
DECLARE n_anon int;
BEGIN
  SELECT count(*) INTO n_anon
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = ANY(ARRAY['presupuestos', 'pacientes', 'secuencias', 'prestaciones', 'agrupaciones'])
    AND 'anon' = ANY(roles);
  IF n_anon > 0 THEN
    RAISE EXCEPTION 'FALLO: quedaron % policies anon en tablas del presupuestador', n_anon;
  END IF;
  RAISE NOTICE 'OK 08: presupuestos/pacientes/secuencias gateadas por permiso presupuestador; prestaciones/agrupaciones requieren sesión; sin anon.';
END $$;

COMMIT;
