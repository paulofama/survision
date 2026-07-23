-- ============================================================
-- MIGRACIÓN 30: espejo del DETALLE DE VALORES (medios de pago) de Tesorería
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
-- PROBLEMA QUE RESUELVE
-- --------------------
-- El dashboard de Tesorería calculaba el "Saldo Actual de Caja" como la suma
-- de TODOS los comprobantes de MovValoresEnca desde 2018. Eso daba
-- $1.040.993.947 al 22/07/2026, un número ficticio, por tres motivos:
--
--   (a) MovValoresEnca es el COMPROBANTE, no el medio de pago. Una factura
--       cobrada por transferencia o tarjeta va al BANCO, no a la caja. En 2026
--       $164M de los $507M de "ingresos" no eran efectivo.
--   (b) Los pagos a proveedores (MovProv OP/PV) también salen de la caja pero
--       viven en otra tabla y no se restaban: $355,5M en efectivo durante 2026.
--   (c) Acumulaba desde 2018 sin arqueo ni saldo inicial.
--
--   Verificado contra GECLISA: efectivo que entra − egresos de caja − OP/PV en
--   efectivo da un acumulado de −$30,5M (una caja que se vacía), no +$1.041M.
--
-- SOLUCIÓN
-- --------
-- Espejar el DETALLE de valores para poder separar efectivo de banco/tarjeta:
--   tesoreria_valores       <- MovValores      (medios de pago de cada comprobante de caja)
--   tesoreria_prov_valores  <- MovProv_Valores (medios de pago de cada OP/PV)
--
-- Alcance histórico: 2024+ (mismo criterio que movimientos_geclisa).
-- Un comprobante puede pagarse con VARIOS medios (ej. parte efectivo + parte
-- transferencia), por eso es una tabla a grano de valor, no columnas del espejo.
--
-- La métrica principal del dashboard pasa a ser el EFECTIVO NETO DEL MES
-- (entra en efectivo − sale por egreso de caja − sale por OP/PV en efectivo),
-- que es chico, real y verificable. Se abandona el saldo acumulado.
--
-- RLS: permiso 'tesoreria'. Escribe el daemon con service_role.
-- Idempotente. Refresh por DELETE de rango de fechas + INSERT.
-- ============================================================

BEGIN;

-- ============================================================
-- 1) DETALLE DE VALORES DE CAJA (MovValores)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tesoreria_valores (
  id               integer PRIMARY KEY,               -- MovVal_id
  mve_id           integer NOT NULL,                  -- Mve_id -> tesoreria_caja.id
  fecha            date    NOT NULL,                  -- fecha del comprobante (encabezado)
  anio             integer NOT NULL,
  mes              integer NOT NULL,
  signo            integer NOT NULL DEFAULT 1,        -- Mve_Signo del encabezado (>0 entra, <0 sale)
  tipo_comprobante text,                              -- FAC / IC / EC / NC / DG / RI ...
  medio_id         integer,                           -- Tv_id
  medio_nombre     text,                              -- "Pesos", "Transferencia Santander Río", ...
  categoria        text    NOT NULL DEFAULT 'otro',   -- efectivo|transferencia|tarjeta|cheque|cta_cte|retencion|otro
  es_efectivo      boolean NOT NULL DEFAULT false,    -- TipoValores.esEfectivo (la caja de verdad)
  importe          numeric(18,2) NOT NULL DEFAULT 0,  -- MovValores.Imp (siempre positivo; el sentido lo da signo)
  synced_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tesval_fecha     ON public.tesoreria_valores (fecha);
CREATE INDEX IF NOT EXISTS idx_tesval_anio_mes  ON public.tesoreria_valores (anio, mes);
CREATE INDEX IF NOT EXISTS idx_tesval_mve       ON public.tesoreria_valores (mve_id);
CREATE INDEX IF NOT EXISTS idx_tesval_efectivo  ON public.tesoreria_valores (anio, mes) WHERE es_efectivo;

COMMENT ON TABLE  public.tesoreria_valores IS 'Espejo de GECLISA.MovValores: medios de pago de cada comprobante de caja. Permite separar efectivo (caja real) de transferencia/tarjeta (banco).';
COMMENT ON COLUMN public.tesoreria_valores.categoria IS 'Derivada en el extractor. Los flags de TipoValores no distinguen tarjeta de transferencia (ambas tienen esTransferencia=1), por eso la categoría se calcula con reglas explícitas.';

-- ============================================================
-- 2) DETALLE DE VALORES DE PAGOS A PROVEEDORES (MovProv_Valores)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tesoreria_prov_valores (
  id               integer PRIMARY KEY,               -- MpVal_id
  mprov_id         integer NOT NULL,                  -- MProv_id -> tesoreria_proveedores.id
  fecha            date    NOT NULL,                  -- fecha del pago (encabezado MovProv)
  anio             integer NOT NULL,
  mes              integer NOT NULL,
  tcomp_id         integer,                           -- 4 = OP, 13 = PV
  tipo_comprobante text,
  proveedor        text,
  medio_id         integer,                           -- Tv_id
  medio_nombre     text,
  categoria        text    NOT NULL DEFAULT 'otro',
  es_efectivo      boolean NOT NULL DEFAULT false,    -- si es efectivo, SALE DE LA CAJA
  importe          numeric(18,2) NOT NULL DEFAULT 0,
  synced_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tesprovval_fecha    ON public.tesoreria_prov_valores (fecha);
CREATE INDEX IF NOT EXISTS idx_tesprovval_anio_mes ON public.tesoreria_prov_valores (anio, mes);
CREATE INDEX IF NOT EXISTS idx_tesprovval_mprov    ON public.tesoreria_prov_valores (mprov_id);

COMMENT ON TABLE public.tesoreria_prov_valores IS 'Espejo de GECLISA.MovProv_Valores: con qué se pagó cada OP/PV. Los pagados en efectivo salen de la caja y hay que restarlos del efectivo del período.';

-- ============================================================
-- 3) RLS — permiso 'tesoreria' (mismo criterio que tesoreria_caja)
-- ============================================================
ALTER TABLE public.tesoreria_valores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tesoreria_prov_valores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_tesoreria_valores_sel      ON public.tesoreria_valores;
DROP POLICY IF EXISTS pol_tesoreria_prov_valores_sel ON public.tesoreria_prov_valores;

CREATE POLICY pol_tesoreria_valores_sel ON public.tesoreria_valores
  FOR SELECT TO authenticated
  USING (public.app_tiene_permiso('tesoreria'));

CREATE POLICY pol_tesoreria_prov_valores_sel ON public.tesoreria_prov_valores
  FOR SELECT TO authenticated
  USING (public.app_tiene_permiso('tesoreria'));

-- ============================================================
-- 4) RPC DEL DASHBOARD (reemplaza el saldo ficticio por flujo de efectivo)
-- ============================================================
-- SECURITY DEFINER + chequeo de permiso UNA vez (patrón de la migración 16:
-- con INVOKER la policy se evalúa por fila y sobre 110k filas da timeout).
--
-- p_anio/p_mes NULL = mes en curso en hora de Argentina (antes usaba
-- CURRENT_DATE en UTC: después de las 21 hs "hoy" saltaba al día siguiente).
-- ============================================================

DROP FUNCTION IF EXISTS public.tes_caja_dashboard();

CREATE OR REPLACE FUNCTION public.tes_caja_dashboard(
  p_anio integer DEFAULT NULL,
  p_mes  integer DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoy      date;
  v_anio     integer;
  v_mes      integer;
  v_desde    date;
  v_hasta    date;
BEGIN
  IF NOT public.app_tiene_permiso('tesoreria') THEN
    RAISE EXCEPTION 'Sin permiso para tesorería';
  END IF;

  v_hoy  := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_anio := COALESCE(p_anio, EXTRACT(YEAR  FROM v_hoy)::integer);
  v_mes  := COALESCE(p_mes,  EXTRACT(MONTH FROM v_hoy)::integer);
  v_desde := make_date(v_anio, v_mes, 1);
  v_hasta := (v_desde + INTERVAL '1 month - 1 day')::date;

  RETURN json_build_object(
    'periodo', json_build_object('anio', v_anio, 'mes', v_mes, 'desde', v_desde, 'hasta', v_hasta),

    -- ---- EFECTIVO: la caja de verdad ----
    'efectivo', (
      SELECT json_build_object(
        'entra',            COALESCE(e.entra, 0),
        'saleCaja',         COALESCE(e.sale, 0),
        'saleProveedores',  COALESCE(p.sale_prov, 0),
        'neto',             COALESCE(e.entra, 0) - COALESCE(e.sale, 0) - COALESCE(p.sale_prov, 0),
        'movimientos',      COALESCE(e.n, 0)
      )
      FROM (
        SELECT
          SUM(CASE WHEN signo > 0 THEN importe ELSE 0 END) AS entra,
          SUM(CASE WHEN signo < 0 THEN importe ELSE 0 END) AS sale,
          COUNT(*) AS n
        FROM public.tesoreria_valores
        WHERE es_efectivo AND anio = v_anio AND mes = v_mes
      ) e
      CROSS JOIN (
        SELECT SUM(importe) AS sale_prov
        FROM public.tesoreria_prov_valores
        WHERE es_efectivo AND anio = v_anio AND mes = v_mes
      ) p
    ),

    -- ---- Cómo cobró la clínica en el mes (todos los medios) ----
    'ingresosPorMedio', (
      SELECT COALESCE(json_agg(x ORDER BY x.total DESC), '[]'::json) FROM (
        SELECT categoria, SUM(importe) AS total, COUNT(*) AS n
        FROM public.tesoreria_valores
        WHERE signo > 0 AND anio = v_anio AND mes = v_mes
        GROUP BY categoria
      ) x
    ),

    -- ---- Egresos del mes: de la caja + a proveedores ----
    'egresos', (
      SELECT json_build_object(
        'caja', (SELECT COALESCE(SUM(importe), 0) FROM public.tesoreria_valores
                  WHERE signo < 0 AND anio = v_anio AND mes = v_mes),
        -- Total pagado: del ENCABEZADO (tesoreria_proveedores), no de la suma de
        -- los valores. Si un pago lleva retenciones, el detalle puede no cerrar
        -- contra el total; el monto que salió es el del comprobante.
        'proveedores', (SELECT COALESCE(SUM(importe), 0) FROM public.tesoreria_proveedores
                  WHERE anio = v_anio AND mes = v_mes),
        'proveedoresPorMedio', (
          SELECT COALESCE(json_agg(y ORDER BY y.total DESC), '[]'::json) FROM (
            SELECT categoria, SUM(importe) AS total, COUNT(*) AS n
            FROM public.tesoreria_prov_valores
            WHERE anio = v_anio AND mes = v_mes
            GROUP BY categoria
          ) y
        )
      )
    ),

    -- ---- Comprobantes del mes (lo que antes se mostraba como ingresos/egresos) ----
    'comprobantes', (
      SELECT json_build_object(
        'movimientos', COUNT(*),
        'ingresos', COALESCE(SUM(CASE WHEN signo > 0 THEN importe ELSE 0 END), 0),
        'egresos',  COALESCE(SUM(CASE WHEN signo < 0 THEN ABS(importe) ELSE 0 END), 0)
      )
      FROM public.tesoreria_caja WHERE anio = v_anio AND mes = v_mes
    ),

    -- ---- Últimos movimientos de caja ----
    'ultimosMovimientos', (
      SELECT COALESCE(json_agg(u), '[]'::json) FROM (
        SELECT id, fecha, tipo_comprobante AS tipo, nombre,
          CASE WHEN signo > 0 THEN importe ELSE 0 END AS ingreso,
          CASE WHEN signo < 0 THEN ABS(importe) ELSE 0 END AS egreso
        FROM public.tesoreria_caja ORDER BY fecha DESC, id DESC LIMIT 8
      ) u
    ),

    -- ---- Evolución de efectivo, últimos 14 días CON los días sin movimiento en cero ----
    'evolucionEfectivo', (
      SELECT COALESCE(json_agg(z ORDER BY z.fecha), '[]'::json) FROM (
        SELECT d.dia::date AS fecha,
               COALESCE(v.entra, 0) AS entra,
               COALESCE(v.sale, 0) + COALESCE(pv.sale_prov, 0) AS sale
        FROM generate_series(v_hoy - INTERVAL '13 days', v_hoy, INTERVAL '1 day') d(dia)
        LEFT JOIN (
          SELECT fecha,
                 SUM(CASE WHEN signo > 0 THEN importe ELSE 0 END) AS entra,
                 SUM(CASE WHEN signo < 0 THEN importe ELSE 0 END) AS sale
          FROM public.tesoreria_valores
          WHERE es_efectivo AND fecha >= v_hoy - INTERVAL '13 days'
          GROUP BY fecha
        ) v ON v.fecha = d.dia::date
        LEFT JOIN (
          SELECT fecha, SUM(importe) AS sale_prov
          FROM public.tesoreria_prov_valores
          WHERE es_efectivo AND fecha >= v_hoy - INTERVAL '13 days'
          GROUP BY fecha
        ) pv ON pv.fecha = d.dia::date
      ) z
    ),

    -- ---- Frescura real del dato (el daemon corre 08/12/17) ----
    'frescura', (
      SELECT json_build_object(
        'sincronizado', (SELECT MAX(synced_at) FROM public.tesoreria_caja),
        'ultimaFechaDato', (SELECT MAX(fecha) FROM public.tesoreria_caja),
        'hoy', v_hoy
      )
    )
  );
END;
$$;

-- ============================================================
-- 5) RPC de flujo de efectivo por mes (para la serie histórica)
-- ============================================================
CREATE OR REPLACE FUNCTION public.tes_efectivo_por_mes(p_desde date DEFAULT NULL)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_desde date;
BEGIN
  IF NOT public.app_tiene_permiso('tesoreria') THEN
    RAISE EXCEPTION 'Sin permiso para tesorería';
  END IF;
  v_desde := COALESCE(p_desde, '2024-01-01'::date);

  RETURN (
    SELECT COALESCE(json_agg(x ORDER BY x.anio, x.mes), '[]'::json) FROM (
      SELECT anio, mes,
             SUM(entra) AS entra,
             SUM(sale_caja) AS sale_caja,
             SUM(sale_prov) AS sale_prov,
             SUM(entra) - SUM(sale_caja) - SUM(sale_prov) AS neto
      FROM (
        SELECT anio, mes,
               SUM(CASE WHEN signo > 0 THEN importe ELSE 0 END) AS entra,
               SUM(CASE WHEN signo < 0 THEN importe ELSE 0 END) AS sale_caja,
               0::numeric AS sale_prov
        FROM public.tesoreria_valores
        WHERE es_efectivo AND fecha >= v_desde
        GROUP BY anio, mes
        UNION ALL
        SELECT anio, mes, 0, 0, SUM(importe)
        FROM public.tesoreria_prov_valores
        WHERE es_efectivo AND fecha >= v_desde
        GROUP BY anio, mes
      ) u
      GROUP BY anio, mes
    ) x
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.tes_caja_dashboard(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tes_efectivo_por_mes(date) TO authenticated;

-- ============================================================
-- 6) VERIFICACIÓN
-- ============================================================
DO $$
DECLARE
  n_tablas integer;
  n_pol    integer;
BEGIN
  SELECT COUNT(*) INTO n_tablas FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN ('tesoreria_valores', 'tesoreria_prov_valores');
  SELECT COUNT(*) INTO n_pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('tesoreria_valores', 'tesoreria_prov_valores');

  IF n_tablas <> 2 THEN RAISE EXCEPTION 'Faltan tablas: % de 2', n_tablas; END IF;
  IF n_pol    <> 2 THEN RAISE EXCEPTION 'Faltan policies: % de 2', n_pol; END IF;

  RAISE NOTICE 'Migración 30 OK: % tablas, % policies, RPC tes_caja_dashboard + tes_efectivo_por_mes', n_tablas, n_pol;
END $$;

COMMIT;
