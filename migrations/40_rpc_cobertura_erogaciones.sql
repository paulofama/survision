-- ============================================================================
-- MIGRACIÓN 40 — RPC de cobertura de erogaciones por mes
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================================
--
-- QUÉ RESUELVE
-- ------------
-- La validación de integridad del período (Análisis Marginal → Informe de
-- Gestión) chequeaba si un mes TIENE erogaciones clasificadas, no si las tiene
-- TODAS. Con eso, un mes clasificado a medias pasaba el control y el informe
-- salía con parte de los costos afuera — sin ningún aviso.
--
-- Caso real que lo destapó (18/08/2026): julio 2026 tiene 147 comprobantes
-- sincronizados desde GECLISA y 0 clasificados. Al clasificar solo los que
-- tienen precedente histórico se cubría el 55% del monto; los otros $38,9 M
-- habrían quedado fuera del informe y el mes habría pasado de "bloqueado" a
-- "OK".
--
-- POR QUÉ UNA RPC Y NO UN SELECT DIRECTO
-- --------------------------------------
-- `erogaciones_geclisa` tiene RLS con `app_tiene_permiso('analisis')`, mientras
-- que el módulo de Análisis Marginal se gatea con `analisis_marginal`. Un
-- usuario con permiso de análisis marginal pero sin `analisis` recibiría CERO
-- filas de la tabla cruda — sin error — y la validación concluiría que no falta
-- nada. Es exactamente el falso negativo que se quiere evitar.
--
-- Esta función corre como SECURITY DEFINER (ve las dos tablas) y valida el
-- permiso una sola vez, igual que `app_costo_laboral_meses` (migración 21/23).
-- Si el llamador no tiene permiso, LANZA — no devuelve vacío — para que el
-- frontend pueda distinguir "no falta nada" de "no se pudo saber".
--
-- No expone detalle: solo cantidades y montos agregados por mes.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.app_cobertura_erogaciones_meses(integer, integer, integer, integer);

CREATE FUNCTION public.app_cobertura_erogaciones_meses(
  p_anio_desde integer,
  p_mes_desde  integer,
  p_anio_hasta integer,
  p_mes_hasta  integer
)
RETURNS TABLE (
  anio                integer,
  mes                 integer,
  crudas              bigint,
  crudas_monto        numeric,
  clasificadas        bigint,
  clasificadas_monto  numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.app_tiene_permiso('analisis_marginal') THEN
    RAISE EXCEPTION 'Sin permiso para consultar cobertura de erogaciones';
  END IF;

  RETURN QUERY
  WITH rango AS (
    SELECT g.anio, g.mes
    FROM erogaciones_geclisa g
    WHERE (g.anio * 12 + g.mes) BETWEEN (p_anio_desde * 12 + p_mes_desde)
                                    AND (p_anio_hasta * 12 + p_mes_hasta)
    UNION
    SELECT c.anio, c.mes
    FROM erogaciones_clasificacion c
    WHERE (c.anio * 12 + c.mes) BETWEEN (p_anio_desde * 12 + p_mes_desde)
                                    AND (p_anio_hasta * 12 + p_mes_hasta)
  )
  SELECT
    r.anio,
    r.mes,
    COALESCE(g.n, 0)::bigint   AS crudas,
    COALESCE(g.t, 0)::numeric  AS crudas_monto,
    COALESCE(c.n, 0)::bigint   AS clasificadas,
    COALESCE(c.t, 0)::numeric  AS clasificadas_monto
  FROM rango r
  LEFT JOIN LATERAL (
    SELECT count(*) AS n, COALESCE(sum(abs(g2.monto)), 0) AS t
    FROM erogaciones_geclisa g2
    WHERE g2.anio = r.anio AND g2.mes = r.mes
  ) g ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS n, COALESCE(sum(abs(c2.monto)), 0) AS t
    FROM erogaciones_clasificacion c2
    WHERE c2.anio = r.anio AND c2.mes = r.mes
  ) c ON true
  ORDER BY r.anio, r.mes;
END;
$$;

COMMENT ON FUNCTION public.app_cobertura_erogaciones_meses(integer, integer, integer, integer) IS
  'Cobertura de clasificación de erogaciones por mes (crudas vs clasificadas, cantidad y monto), para la validación de integridad del Informe de Gestión. SECURITY DEFINER gateado por permiso analisis_marginal; no expone detalle por comprobante.';

REVOKE ALL ON FUNCTION public.app_cobertura_erogaciones_meses(integer, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_cobertura_erogaciones_meses(integer, integer, integer, integer) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'app_cobertura_erogaciones_meses'
  ) THEN
    RAISE EXCEPTION 'FALLO 40: no se creó app_cobertura_erogaciones_meses';
  END IF;
  RAISE NOTICE 'OK 40: RPC app_cobertura_erogaciones_meses creada.';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.app_cobertura_erogaciones_meses(integer, integer, integer, integer);
-- COMMIT;
