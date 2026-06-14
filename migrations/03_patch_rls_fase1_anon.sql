-- ===========================================================================
-- PATCH: 03_patch_rls_fase1_anon.sql
-- ===========================================================================
-- Agrega politicas RLS para el rol `anon` en las 3 tablas de Fase 1
-- (plan_cuentas, empleados, log_auditoria_sueldos).
--
-- Motivo: el frontend usa la anon key (lib/supabase.ts del proyecto no
-- implementa auth.signIn de Supabase todavia). Las politicas originales
-- de Fase 1 solo cubrian `authenticated`, lo que dejaba las tablas
-- invisibles desde la app. Este patch las hace accesibles a anon, igual
-- que se hizo en la migracion Fase 2.
--
-- Idempotente: DROP POLICY IF EXISTS antes de CREATE POLICY.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. plan_cuentas (lectura del catalogo)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS pol_plan_cuentas_anon ON public.plan_cuentas;
CREATE POLICY pol_plan_cuentas_anon ON public.plan_cuentas
  FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. empleados (CRUD del maestro)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS pol_empleados_anon ON public.empleados;
CREATE POLICY pol_empleados_anon ON public.empleados
  FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. log_auditoria_sueldos (escritura por triggers + lectura para reportes)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS pol_log_auditoria_sueldos_anon ON public.log_auditoria_sueldos;
CREATE POLICY pol_log_auditoria_sueldos_anon ON public.log_auditoria_sueldos
  FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Verificacion
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('plan_cuentas', 'empleados', 'log_auditoria_sueldos')
    AND 'anon' = ANY(roles);
  IF v_count < 3 THEN
    RAISE EXCEPTION 'Esperaba >=3 politicas para anon, encontre %', v_count;
  END IF;
  RAISE NOTICE 'Patch RLS Fase 1 aplicado. % politicas para anon activas.', v_count;
END;
$$;

COMMIT;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
