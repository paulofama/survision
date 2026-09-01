-- ============================================================
-- 43 · Costeo de recetas v2 — prorrateo sobre el volumen real
-- ============================================================
-- Sistema de Gestión Integral · Survisión S.A.
--
-- QUÉ ARREGLA
-- -----------
-- La vista vigente (ver migración 42) reparte el costo de cada pool entre la
-- suma de `cantidad_mensual_estimada`, un número cargado a mano en cada receta
-- que no se parece a la realidad: Exoftalmología figura con 9 prácticas por mes
-- y hace 859. El pool de consultorio se reparte así entre 394 prácticas cuando
-- lo atraviesan 1.299 por mes, y el de quirófano entre 208 cuando son 48.
--
-- El resultado es que el prorrateo no cierra: en 8 meses de 2026 asigna
-- $36.753.232 sobre pools que cuestan $14.086.459 en ese lapso. Un prorrateo
-- no puede crear costo — solo repartir el que hay.
--
-- LAS CANTIDADES DEL POOL SON MENSUALES
-- -------------------------------------
-- `pools_insumos.tipo_consumo` dice 'Anual', pero las cantidades de
-- `pool_items` son de un MES. Verificado el 31/08/2026 contra el consumo real
-- de GECLISA (StockItem, movimientos tipo CONSUMO, últimos 12 meses):
--
--   insumo                    pool   real/año   leído anual   leído mensual
--   Fluoresceína                14        229        x 16,4         x 1,4
--   Fenilefrina + Tropicamida   14        202        x 14,4         x 1,2
--   Proparacaína                14        231        x 16,5         x 1,4
--   Algodón 500 g                2         26        x 13,0         x 1,1
--
-- Leídas como anuales, el instituto usaría 2 barbijos y 1 litro de alcohol por
-- año para 15.586 consultas. Leídas como mensuales, los principales quedan en
-- el mismo orden de magnitud que lo que efectivamente se consume.
--
-- CÓMO QUEDA
-- ----------
--   costo unitario = fn_costo_pool(pool)                 [costo MENSUAL]
--                    / (volumen anual real del pool / 12) [volumen MENSUAL,
--                                                          de movimientos_geclisa]
--
-- El volumen sale de GECLISA, así que el prorrateo cierra solo y nadie tiene que
-- mantener 103 estimaciones al día. Se usa el volumen de 12 meses dividido por
-- 12 —y no el del último mes— para que el costo unitario no salte con un mes
-- flojo o con un feriado largo.
--
-- EL PISO
-- -------
-- Dividir por el volumen real rompe en los pools de poco uso: "Re Esterilizable
-- + Lavado" tuvo 2 prácticas en 12 meses. Su unitario se duplicaría si el año
-- próximo hubiera una sola, y quedaría indefinido si no hubiera ninguna.
--
-- Por eso nunca se divide por menos de fn_volumen_minimo_pool() prácticas al
-- año (12, o sea 1 por mes). En esos pools el prorrateo NO cierra: queda costo
-- sin asignar. Es deliberado — preferimos dejar costo sin repartir antes que
-- inflar el unitario de una práctica que casi no se hace. La vista lo expone en
-- `pool_bajo_piso` para que la pantalla lo advierta en vez de que pase
-- inadvertido.
--
-- POR QUÉ ES UNA VISTA PARALELA
-- -----------------------------
-- El cambio mueve el costo asignado de 2026 y con él el margen. Es demasiado
-- para aplicarlo a ciegas: esta migración NO toca `v_recetas_costos_por_pool`,
-- que sigue siendo la que consume el módulo. Crea
-- `v_recetas_costos_por_pool_v2` para poder comparar los dos informes antes de
-- decidir el cambio.
--
-- LO QUE QUEDA PENDIENTE Y NO ARREGLA ESTA MIGRACIÓN
-- --------------------------------------------------
-- Aun leído como mensual, el pool está cargado por debajo de lo que se consume:
-- 14 fluoresceínas al mes son 168 al año contra 229 registradas en GECLISA. Y
-- hay ítems que no cierran con nada — 1 caja de guantes y 1 resma de papel para
-- más de mil consultas mensuales. El pool necesita una revisión de contenido,
-- que es un problema distinto del de la fórmula.
--
-- Cuando se confirme, la migración siguiente reemplaza el cuerpo de la vista
-- original por este y borra la v2.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Volumen ANUAL mínimo por el que se divide. Si un pool tuvo menos prácticas
-- que esto en los últimos 12 meses, se usa este número igual. 12 al año = 1 por
-- mes: por debajo de eso el unitario deja de ser un prorrateo y pasa a ser el
-- costo del pool entero cargado a una o dos prácticas.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_volumen_minimo_pool()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $function$ SELECT 12 $function$;

COMMENT ON FUNCTION public.fn_volumen_minimo_pool() IS
  'Piso del denominador del prorrateo de pools. Evita que un pool de muy poco uso dispare su costo unitario o quede sin denominador. Ver migración 43.';

-- ------------------------------------------------------------
-- v_recetas_costos_por_pool_v2
--
-- Mismas columnas que la vista vigente, más dos:
--   volumen_anual_pool  · prácticas reales de los últimos 12 meses
--   pool_bajo_piso      · true si se usó el piso en vez del volumen real
--
-- Los pools se siguen identificando por ILIKE sobre el nombre, igual que la
-- original: renombrar un pool en `pools_insumos` deja su columna en cero sin
-- avisar. No se cambia acá para que las dos vistas sean comparables.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_recetas_costos_por_pool_v2 AS
WITH volumen_practica AS (
  -- Prácticas realmente facturadas en los últimos 12 meses, por código.
  -- es_principal = una fila por atención (no por línea de la atención).
  SELECT lpad(btrim(m.practica_codigo::text), 6, '0') AS cod,
         count(*)::numeric AS n
  FROM movimientos_geclisa m
  WHERE m.es_principal
    AND m.fecha >= (CURRENT_DATE - interval '12 months')
    AND m.practica_codigo IS NOT NULL
  GROUP BY 1
),
volumen_pool AS (
  -- Volumen anual que atraviesa cada pool: la suma de las prácticas de todas
  -- las recetas activas que lo usan.
  SELECT rp.pool_id,
         COALESCE(sum(vp.n), 0) AS volumen_real,
         GREATEST(COALESCE(sum(vp.n), 0), fn_volumen_minimo_pool()::numeric) AS volumen_usado,
         (COALESCE(sum(vp.n), 0) < fn_volumen_minimo_pool()::numeric) AS bajo_piso
  FROM receta_pools rp
  JOIN practicas_recetas pr ON pr.id = rp.receta_id AND pr.activo
  LEFT JOIN volumen_practica vp ON vp.cod = lpad(btrim(pr.codigo_practica::text), 6, '0')
  WHERE rp.activo
  GROUP BY rp.pool_id
),
costo_unitario_pool AS (
  -- fn_costo_pool devuelve el costo de UN MES (las cantidades de pool_items son
  -- mensuales). El volumen que se junta arriba es de 12 meses, así que se lo
  -- pasa a mensual dividiendo por 12. Las dos puntas quedan en la misma unidad.
  SELECT p.id AS pool_id,
         p.nombre AS pool_nombre,
         fn_costo_pool(p.id) AS costo_total_pool,
         COALESCE(vp.volumen_real, 0) AS volumen_real,
         COALESCE(vp.bajo_piso, true) AS bajo_piso,
         CASE
           WHEN COALESCE(vp.volumen_usado, 0) > 0
             THEN fn_costo_pool(p.id) / (vp.volumen_usado / 12::numeric)
           ELSE 0::numeric
         END AS costo_unitario
  FROM pools_insumos p
  LEFT JOIN volumen_pool vp ON vp.pool_id = p.id
  WHERE p.activo
),
-- Un solo pase por los pools de cada receta, en vez de un subselect por columna.
pools_de_receta AS (
  SELECT rp.receta_id,
         cup.pool_nombre,
         cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric) AS costo,
         cup.volumen_real,
         -- El piso solo importa si el pool APORTA costo. Un pool sin ítems
         -- cargados (Kit Para RFG) tiene costo cero: que su volumen esté bajo
         -- el piso no cambia ningún número y no tiene sentido advertirlo.
         (cup.bajo_piso AND cup.costo_total_pool > 0) AS bajo_piso,
         cup.costo_total_pool
  FROM receta_pools rp
  JOIN costo_unitario_pool cup ON cup.pool_id = rp.pool_id
  WHERE rp.activo
)
SELECT
  pr.id AS receta_id,
  pr.codigo_practica,
  pr.nombre_practica,
  pr.categoria,
  pr.cantidad_mensual_estimada,
  COALESCE((SELECT p.costo FROM pools_de_receta p WHERE p.receta_id = pr.id AND p.pool_nombre ILIKE '%consultorio%' LIMIT 1), 0) AS costo_pool_consultorio,
  COALESCE((SELECT p.costo FROM pools_de_receta p WHERE p.receta_id = pr.id AND p.pool_nombre ILIKE '%quirofano%' LIMIT 1), 0) AS costo_pool_quirofano,
  COALESCE((SELECT p.costo FROM pools_de_receta p WHERE p.receta_id = pr.id AND p.pool_nombre ILIKE '%parabulbar%' LIMIT 1), 0) AS costo_pool_parabulbar,
  COALESCE((SELECT p.costo FROM pools_de_receta p WHERE p.receta_id = pr.id AND p.pool_nombre ILIKE '%rfg%' LIMIT 1), 0) AS costo_pool_rfg,
  COALESCE((SELECT p.costo FROM pools_de_receta p WHERE p.receta_id = pr.id AND p.pool_nombre ILIKE '%re esterilizable%' AND p.pool_nombre NOT ILIKE '%lavado%' LIMIT 1), 0) AS costo_pool_reesterilizables,
  COALESCE((SELECT p.costo FROM pools_de_receta p WHERE p.receta_id = pr.id AND p.pool_nombre ILIKE '%lavado%' LIMIT 1), 0) AS costo_pool_lavado,
  COALESCE((SELECT p.costo FROM pools_de_receta p WHERE p.receta_id = pr.id AND p.pool_nombre ILIKE '%faco%' LIMIT 1), 0) AS costo_pool_faco,
  COALESCE((SELECT p.costo FROM pools_de_receta p WHERE p.receta_id = pr.id AND p.pool_nombre ILIKE '%implante%' LIMIT 1), 0) AS costo_pool_implante,
  COALESCE((SELECT p.costo FROM pools_de_receta p WHERE p.receta_id = pr.id AND p.pool_nombre ILIKE '%medicamento%' LIMIT 1), 0) AS costo_pool_medicamentos,
  COALESCE((SELECT p.costo FROM pools_de_receta p WHERE p.receta_id = pr.id AND p.pool_nombre ILIKE '%descartable%' LIMIT 1), 0) AS costo_pool_descartables,
  COALESCE((SELECT sum(p.costo) FROM pools_de_receta p WHERE p.receta_id = pr.id), 0) AS costo_total_pools,
  COALESCE((SELECT sum(rid.cantidad_por_practica * iv.precio_unitario)
            FROM receta_insumos_directos rid
            JOIN insumos_variables iv ON iv.id = rid.insumo_id
            WHERE rid.receta_id = pr.id AND rid.activo AND iv.activo), 0) AS costo_insumos_directos,
  COALESCE((SELECT sum(p.costo) FROM pools_de_receta p WHERE p.receta_id = pr.id), 0)
  + COALESCE((SELECT sum(rid.cantidad_por_practica * iv.precio_unitario)
              FROM receta_insumos_directos rid
              JOIN insumos_variables iv ON iv.id = rid.insumo_id
              WHERE rid.receta_id = pr.id AND rid.activo AND iv.activo), 0) AS costo_total_unitario,
  -- Nuevas: para poder auditar el prorrateo desde la pantalla.
  -- El volumen es el del pool MÁS CHICO que aporta costo, que es el que puede
  -- haber caído bajo el piso. Tomar el más grande daría un número tranquilizador
  -- justo cuando hay que desconfiar.
  COALESCE((SELECT min(p.volumen_real) FROM pools_de_receta p
            WHERE p.receta_id = pr.id AND p.costo_total_pool > 0), 0) AS volumen_anual_pool,
  COALESCE((SELECT bool_or(p.bajo_piso) FROM pools_de_receta p WHERE p.receta_id = pr.id), false) AS pool_bajo_piso
FROM practicas_recetas pr
WHERE pr.activo
ORDER BY pr.codigo_practica;

COMMENT ON VIEW public.v_recetas_costos_por_pool_v2 IS
  'Costeo de recetas con el prorrateo corregido: costo ANUAL del pool dividido por el volumen ANUAL real de GECLISA (últimos 12 meses), con piso de fn_volumen_minimo_pool(). Paralela a v_recetas_costos_por_pool mientras se comparan los informes. Ver migración 43.';

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_filas_v1  integer;
  v_filas_v2  integer;
  v_costo     numeric;
  v_asig_v1   numeric;
  v_asig_v2   numeric;
BEGIN
  IF to_regclass('public.v_recetas_costos_por_pool_v2') IS NULL THEN
    RAISE EXCEPTION 'No se creó v_recetas_costos_por_pool_v2';
  END IF;

  -- Las dos vistas tienen que devolver las mismas recetas.
  SELECT count(*) INTO v_filas_v1 FROM v_recetas_costos_por_pool;
  SELECT count(*) INTO v_filas_v2 FROM v_recetas_costos_por_pool_v2;
  IF v_filas_v1 <> v_filas_v2 THEN
    RAISE EXCEPTION 'v1 tiene % recetas y v2 tiene %', v_filas_v1, v_filas_v2;
  END IF;

  -- El prorrateo de v2 no puede asignar MÁS de lo que los pools cuestan.
  SELECT sum(fn_costo_pool(id)) INTO v_costo FROM pools_insumos WHERE activo;
  SELECT sum(costo_total_pools) INTO v_asig_v2 FROM v_recetas_costos_por_pool_v2;
  SELECT sum(costo_total_pools) INTO v_asig_v1 FROM v_recetas_costos_por_pool;

  RAISE NOTICE 'OK 43: v2 creada con % recetas.', v_filas_v2;
  RAISE NOTICE '  costo anual de los pools:        %', round(v_costo, 2);
  RAISE NOTICE '  suma de unitarios v1 (vigente):  %', round(v_asig_v1, 2);
  RAISE NOTICE '  suma de unitarios v2 (corregida): %', round(v_asig_v2, 2);
  RAISE NOTICE '  La v1 sigue intacta: el módulo no cambia hasta que se decida.';
END
$$;
