-- ============================================================
-- MIGRACIÓN 15: funciones RPC de Tesorería Caja (agregados server-side)
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
-- El saldo de caja suma ~110k filas -> no conviene traerlas al browser. Estas
-- funciones agregan en Postgres y el frontend las llama con supabase.rpc().
-- SECURITY INVOKER -> respetan la RLS de tesoreria_caja (permiso 'tesoreria').
-- El listado de movimientos y proveedores se consultan directo (son acotados).
-- Idempotente (CREATE OR REPLACE).
-- ============================================================

BEGIN;

-- Saldo a una fecha (o total si p_fecha es NULL)
CREATE OR REPLACE FUNCTION public.tes_caja_saldo(p_fecha date DEFAULT NULL)
RETURNS json LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT json_build_object(
    'saldo', COALESCE(SUM(CASE WHEN signo > 0 THEN importe ELSE -ABS(importe) END), 0),
    'total_ingresos', COALESCE(SUM(CASE WHEN signo > 0 THEN importe ELSE 0 END), 0),
    'total_egresos', COALESCE(SUM(CASE WHEN signo < 0 THEN ABS(importe) ELSE 0 END), 0),
    'total_movimientos', COUNT(*)
  )
  FROM public.tesoreria_caja
  WHERE p_fecha IS NULL OR fecha <= p_fecha;
$$;

-- Tipos de comprobante presentes (para el dropdown de filtro)
CREATE OR REPLACE FUNCTION public.tes_caja_tipos()
RETURNS json LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT COALESCE(json_agg(t), '[]'::json) FROM (
    SELECT tipo_comprobante AS sigla, MAX(tipo_nombre) AS nombre, COUNT(*) AS cantidad
    FROM public.tesoreria_caja
    WHERE tipo_comprobante IS NOT NULL
    GROUP BY tipo_comprobante
    ORDER BY COUNT(*) DESC
  ) t;
$$;

-- Dashboard completo de caja
CREATE OR REPLACE FUNCTION public.tes_caja_dashboard()
RETURNS json LANGUAGE sql STABLE SECURITY INVOKER AS $$
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
  );
$$;

GRANT EXECUTE ON FUNCTION public.tes_caja_saldo(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tes_caja_tipos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tes_caja_dashboard() TO authenticated;

COMMIT;
