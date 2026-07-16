-- ============================================================
-- MIGRACIÓN 23: agregar HC de empleados de recibo al costo laboral
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
-- CONTEXTO: la RPC app_costo_laboral_meses (migración 21) devolvía bruto (recibo)
-- + cargas patronales. Las HORAS COMPLEMENTARIAS quedaban afuera del informe.
--
-- Análisis (2026-07-16): la HC se parte en dos grupos:
--   1. Empleados de RECIBO (tienen línea en el bloque pago_sueldos): su HC se paga
--      por caja, SIN factura → NO aparece en erogaciones → hoy no está en el informe.
--   2. Facturado-only (solo HC, sin recibo): monotributistas que FACTURAN → ya están
--      en las erogaciones como "Honorarios Profesionales" (fijo) → contarlos acá sería
--      DOBLE CONTEO.
--
-- FIX (Opción A): agregar la columna hc_empleados = suma de HC SOLO de los empleados
-- que tienen línea de pago_sueldos ese mes (grupo 1). Los facturado-only quedan
-- excluidos automáticamente (no están en pago_sueldos). costo_laboral se mantiene
-- = bruto + cargas (sin cambio); el frontend suma la nueva línea aparte.
--
-- Cambia el RETURNS TABLE → hay que DROP + CREATE (CREATE OR REPLACE no puede
-- cambiar el tipo de retorno). Idempotente. Atómica.
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS public.app_costo_laboral_meses(integer, integer, integer, integer);

CREATE FUNCTION public.app_costo_laboral_meses(
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
  hc_empleados  numeric,
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
    COALESCE(hc.total, 0)::numeric AS hc_empleados,
    (a.bruto_total + COALESCE(f.contrib_ss_351, 0) + COALESCE(f.contrib_os_352, 0)
      + COALESCE(f.art, 0) + COALESCE(f.scvo, 0))::numeric AS costo_laboral
  FROM asientos_sueldos a
  JOIN f931_declaraciones f
    ON f.anio = a.anio AND f.mes = a.mes AND f.estado = 'REVISADO_CONFIRMADO'
  -- HC de los empleados que ADEMÁS están en el recibo (pago_sueldos) del mismo mes.
  -- Los facturado-only (solo HC) NO están en ese sub-select → se excluyen (ya están
  -- en Honorarios de las erogaciones).
  LEFT JOIN LATERAL (
    SELECT SUM(le.monto_neto_cargado) AS total
    FROM liquidacion_bloques b
    JOIN liquidacion_lineas_empleado le ON le.bloque_id = b.id
    WHERE b.liquidacion_id = a.liquidacion_id
      AND b.tipo = 'horas_complementarias'
      AND le.empleado_id IN (
        SELECT lep.empleado_id
        FROM liquidacion_bloques bp
        JOIN liquidacion_lineas_empleado lep ON lep.bloque_id = bp.id
        WHERE bp.liquidacion_id = a.liquidacion_id
          AND bp.tipo = 'pago_sueldos'
      )
  ) hc ON true
  WHERE (a.anio * 12 + a.mes) BETWEEN (p_anio_desde * 12 + p_mes_desde)
                                  AND (p_anio_hasta * 12 + p_mes_hasta)
  ORDER BY a.anio, a.mes;
END;
$$;

COMMENT ON FUNCTION public.app_costo_laboral_meses(integer, integer, integer, integer) IS
  'Costo laboral mensual para Análisis Marginal: bruto (recibo) + cargas patronales + hc_empleados (HC de empleados de recibo, sin los facturado-only que ya están en Honorarios). SECURITY DEFINER gateado por analisis_marginal; no expone detalle por empleado.';

REVOKE ALL ON FUNCTION public.app_costo_laboral_meses(integer, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_costo_laboral_meses(integer, integer, integer, integer) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'app_costo_laboral_meses'
  ) THEN
    RAISE EXCEPTION 'FALLO: no se recreó app_costo_laboral_meses';
  END IF;
  RAISE NOTICE 'OK 23: RPC app_costo_laboral_meses ahora devuelve hc_empleados.';
END $$;

COMMIT;
