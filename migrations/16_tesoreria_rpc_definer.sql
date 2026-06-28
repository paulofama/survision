-- ============================================================
-- MIGRACIÓN 16: RPC de Tesorería Caja como SECURITY DEFINER
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
-- FIX de la 15: con SECURITY INVOKER la policy RLS app_tiene_permiso('tesoreria')
-- se evaluaba por CADA fila (110k) -> statement timeout. Acá las funciones son
-- SECURITY DEFINER (bypassan RLS) y chequean el permiso UNA sola vez al inicio.
-- Así el guard de seguridad se mantiene y la agregación es rápida.
-- Idempotente (CREATE OR REPLACE).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.tes_caja_saldo(p_fecha date DEFAULT NULL)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.app_tiene_permiso('tesoreria') THEN
    RAISE EXCEPTION 'Sin permiso para tesorería';
  END IF;
  RETURN (
    SELECT json_build_object(
      'saldo', COALESCE(SUM(CASE WHEN signo > 0 THEN importe ELSE -ABS(importe) END), 0),
      'total_ingresos', COALESCE(SUM(CASE WHEN signo > 0 THEN importe ELSE 0 END), 0),
      'total_egresos', COALESCE(SUM(CASE WHEN signo < 0 THEN ABS(importe) ELSE 0 END), 0),
      'total_movimientos', COUNT(*)
    )
    FROM public.tesoreria_caja
    WHERE p_fecha IS NULL OR fecha <= p_fecha
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tes_caja_tipos()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.app_tiene_permiso('tesoreria') THEN
    RAISE EXCEPTION 'Sin permiso para tesorería';
  END IF;
  RETURN (
    SELECT COALESCE(json_agg(t), '[]'::json) FROM (
      SELECT tipo_comprobante AS sigla, MAX(tipo_nombre) AS nombre, COUNT(*) AS cantidad
      FROM public.tesoreria_caja
      WHERE tipo_comprobante IS NOT NULL
      GROUP BY tipo_comprobante
      ORDER BY COUNT(*) DESC
    ) t
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tes_caja_dashboard()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.app_tiene_permiso('tesoreria') THEN
    RAISE EXCEPTION 'Sin permiso para tesorería';
  END IF;
  RETURN (
    SELECT json_build_object(
      'saldoActual', (SELECT COALESCE(SUM(CASE WHEN signo > 0 THEN importe ELSE -ABS(importe) END), 0) FROM public.tesoreria_caja),
      'hoy', (SELECT json_build_object(
          'movimientos', COUNT(*),
          'ingresos', COALESCE(SUM(CASE WHEN signo > 0 THEN importe ELSE 0 END), 0),
          'egresos', COALESCE(SUM(CASE WHEN signo < 0 THEN ABS(importe) ELSE 0 END), 0)
        ) FROM public.tesoreria_caja WHERE fecha = CURRENT_DATE),
      'mes', (SELECT json_build_object(
          'movimientos', COUNT(*),
          'ingresos', COALESCE(SUM(CASE WHEN signo > 0 THEN importe ELSE 0 END), 0),
          'egresos', COALESCE(SUM(CASE WHEN signo < 0 THEN ABS(importe) ELSE 0 END), 0)
        ) FROM public.tesoreria_caja WHERE anio = EXTRACT(YEAR FROM CURRENT_DATE) AND mes = EXTRACT(MONTH FROM CURRENT_DATE)),
      'ultimosMovimientos', (SELECT COALESCE(json_agg(u), '[]'::json) FROM (
          SELECT id, fecha, tipo_comprobante AS tipo, nombre,
            CASE WHEN signo > 0 THEN importe ELSE 0 END AS ingreso,
            CASE WHEN signo < 0 THEN ABS(importe) ELSE 0 END AS egreso
          FROM public.tesoreria_caja ORDER BY fecha DESC, id DESC LIMIT 5
        ) u),
      'evolucion7Dias', (SELECT COALESCE(json_agg(e ORDER BY e.fecha), '[]'::json) FROM (
          SELECT fecha,
            SUM(CASE WHEN signo > 0 THEN importe ELSE 0 END) AS ingresos,
            SUM(CASE WHEN signo < 0 THEN ABS(importe) ELSE 0 END) AS egresos
          FROM public.tesoreria_caja WHERE fecha >= CURRENT_DATE - INTERVAL '7 days'
          GROUP BY fecha
        ) e)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.tes_caja_saldo(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tes_caja_tipos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tes_caja_dashboard() TO authenticated;

COMMIT;
