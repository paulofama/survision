-- ============================================================
-- MIGRACIÓN 21: RPC de costo laboral mensual para Análisis Marginal
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
-- El Análisis Marginal necesita el COSTO LABORAL del período (sueldos como costo
-- fijo), pero las tablas del módulo Sueldos (asientos_sueldos, f931_declaraciones)
-- tienen RLS USING(app_tiene_permiso('sueldos')) y los usuarios de análisis NO
-- tienen ese permiso. Además, no corresponde exponerles el detalle por empleado.
--
-- Solución: función SECURITY DEFINER que devuelve SOLO el agregado mensual
-- (bruto + cargas patronales = costo laboral), gateada por el permiso
-- 'analisis_marginal' (los admin pasan por el propio app_tiene_permiso). No
-- expone ninguna fila de empleado.
--
-- Costo laboral del mes = asientos_sueldos.bruto_total
--   + (f931.contrib_ss_351 + contrib_os_352 + art + scvo)   [solo F.931 CONFIRMADO]
-- Devuelve una fila por mes DISPONIBLE (con asiento + F.931 confirmado) dentro
-- del rango; los meses sin dato del módulo no aparecen (el frontend hace fallback
-- a la erogación clasificada "Sueldos y Cargas").
--
-- Idempotente (CREATE OR REPLACE). Atómica.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.app_costo_laboral_meses(
  p_anio_desde integer,
  p_mes_desde  integer,
  p_anio_hasta integer,
  p_mes_hasta  integer
)
RETURNS TABLE (
  anio          integer,
  mes           integer,
  bruto         numeric,
  cargas        numeric,
  costo_laboral numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Gate de permiso UNA sola vez (admins pasan por app_tiene_permiso).
  IF NOT public.app_tiene_permiso('analisis_marginal') THEN
    RAISE EXCEPTION 'Sin permiso para consultar costo laboral';
  END IF;

  RETURN QUERY
  SELECT
    a.anio,
    a.mes,
    a.bruto_total::numeric AS bruto,
    (COALESCE(f.contrib_ss_351, 0) + COALESCE(f.contrib_os_352, 0)
      + COALESCE(f.art, 0) + COALESCE(f.scvo, 0))::numeric AS cargas,
    (a.bruto_total + COALESCE(f.contrib_ss_351, 0) + COALESCE(f.contrib_os_352, 0)
      + COALESCE(f.art, 0) + COALESCE(f.scvo, 0))::numeric AS costo_laboral
  FROM asientos_sueldos a
  JOIN f931_declaraciones f
    ON f.anio = a.anio AND f.mes = a.mes AND f.estado = 'REVISADO_CONFIRMADO'
  WHERE (a.anio * 12 + a.mes) BETWEEN (p_anio_desde * 12 + p_mes_desde)
                                  AND (p_anio_hasta * 12 + p_mes_hasta)
  ORDER BY a.anio, a.mes;
END;
$$;

COMMENT ON FUNCTION public.app_costo_laboral_meses(integer, integer, integer, integer) IS
  'Costo laboral mensual (bruto + cargas patronales) del período, para Análisis Marginal. SECURITY DEFINER gateado por permiso analisis_marginal; no expone detalle por empleado.';

REVOKE ALL ON FUNCTION public.app_costo_laboral_meses(integer, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_costo_laboral_meses(integer, integer, integer, integer) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'app_costo_laboral_meses'
  ) THEN
    RAISE EXCEPTION 'FALLO: no se creó app_costo_laboral_meses';
  END IF;
  RAISE NOTICE 'OK 21: RPC app_costo_laboral_meses creada.';
END $$;

COMMIT;
