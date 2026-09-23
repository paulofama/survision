-- ============================================================
-- Migración 50 — RLS de presupuestos_diagnosticos al patrón de catálogos
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- La migración 48 creó la tabla con UNA policy FOR ALL con permiso
-- 'presupuestador': cualquiera que use el módulo podía escribir el diagnóstico
-- que se imprime en el pedido que se presenta a la obra social.
--
-- El resto de los catálogos del circuito (LIOs, convenios, motivos, textos
-- legales, migración 25) usa el patrón correcto y es el que corresponde acá,
-- ahora que hay una PANTALLA para editarlos:
--
--   SELECT   -> 'presupuestador'         (todos necesitan leerlo para imprimir)
--   escritura-> 'presupuestador:config'  (un diagnóstico mal cargado sale
--                                         firmado en un pedido de cirugía)
--
-- Esto NO rompe la impresión: leer sigue alcanzando con 'presupuestador'.
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS pol_diagnosticos_all ON public.presupuestos_diagnosticos;

DROP POLICY IF EXISTS pol_diagnosticos_select ON public.presupuestos_diagnosticos;
CREATE POLICY pol_diagnosticos_select ON public.presupuestos_diagnosticos
  FOR SELECT TO authenticated
  USING (public.app_tiene_permiso('presupuestador'));

DROP POLICY IF EXISTS pol_diagnosticos_write ON public.presupuestos_diagnosticos;
CREATE POLICY pol_diagnosticos_write ON public.presupuestos_diagnosticos
  FOR ALL TO authenticated
  USING      (public.app_tiene_permiso('presupuestador:config'))
  WITH CHECK (public.app_tiene_permiso('presupuestador:config'));

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_rls   boolean;
  v_anon  int;
  v_sel   int;
  v_wri   int;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.presupuestos_diagnosticos'::regclass;
  SELECT count(*) INTO v_anon FROM pg_policies
   WHERE tablename = 'presupuestos_diagnosticos' AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  SELECT count(*) INTO v_sel FROM pg_policies
   WHERE tablename = 'presupuestos_diagnosticos' AND policyname = 'pol_diagnosticos_select';
  SELECT count(*) INTO v_wri FROM pg_policies
   WHERE tablename = 'presupuestos_diagnosticos' AND policyname = 'pol_diagnosticos_write';

  IF NOT v_rls  THEN RAISE EXCEPTION 'ABORTA: quedó sin RLS'; END IF;
  IF v_anon > 0 THEN RAISE EXCEPTION 'ABORTA: % policy(s) alcanzan a anon', v_anon; END IF;
  IF v_sel <> 1 THEN RAISE EXCEPTION 'ABORTA: falta la policy de lectura'; END IF;
  IF v_wri <> 1 THEN RAISE EXCEPTION 'ABORTA: falta la policy de escritura'; END IF;

  RAISE NOTICE 'RLS al patrón de catálogos: lee presupuestador, escribe presupuestador:config.';
END $$;
