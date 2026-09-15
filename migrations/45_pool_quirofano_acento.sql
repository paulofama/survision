-- ============================================================
-- Migración 45 — el desglose por pool ignoraba los acentos
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- EL PROBLEMA
-- -----------
-- `v_recetas_costos_por_pool` abre el costo de pools en una columna por pool, y
-- para saber qué pool va en qué columna hace un ILIKE sobre el NOMBRE. ILIKE
-- ignora mayúsculas, pero NO ignora acentos: el pool
--
--     "Insumos Generales en Quirófano"        (con tilde en la ó)
--
-- no matchea el patrón '%quirofano%'. Su costo entra en `costo_total_pools`
-- —que suma todos los pools de la receta sin mirar nombres— y en NINGUNA
-- columna. El desglose no suma su propio total.
--
-- Medido el 10/09/2026: pasa en 54 de las 103 recetas, $104.288,49 acumulados.
-- En la faco con LIO monofocal (030502) son $1.931,27 sobre $4.741,89 de pools.
--
-- Lo destapó la hoja de receta de costos del Sobre Quirúrgico, que imprime el
-- detalle y el total juntos y se firma. Afectaba igual al panel de costos de
-- Prestaciones Realizadas, que lee las mismas columnas.
--
-- QUÉ CAMBIA Y QUÉ NO
-- -------------------
-- NINGÚN COSTO TOTAL CAMBIA. `costo_total_pools`, `costo_insumos_directos` y
-- `costo_total_unitario` se calculan sumando los pools de la receta, sin mirar
-- el nombre: eran correctos antes y siguen igual. Lo único que cambia es en qué
-- COLUMNA aparece cada pool, o sea el detalle. El bloque de verificación aborta
-- la migración si algún total se mueve.
--
-- CÓMO SE ARREGLA
-- ---------------
-- El CTE expone `pool_norm`: el nombre en minúsculas y sin acentos. Las diez
-- columnas comparan contra eso. Queda en UN solo lugar, así que el próximo pool
-- que alguien cargue con tilde ya entra bien.
--
-- LO QUE SIGUE SIN COLUMNA (a propósito)
-- --------------------------------------
-- Tres pools no caen en ninguna de las diez columnas ni normalizando:
-- "gastos administrativos prk unilateral", "Kit Sedación" y "xxxx este es una
-- prueba". No es un defecto de esta migración: no existe columna para ellos. Su
-- costo sigue en el total, y el frontend lo muestra como "Otros pools" — que es
-- la razón por la que esa línea no se saca junto con este arreglo.
--
-- Verificado antes de aplicar: ninguna receta tiene DOS pools que caigan en la
-- misma columna, así que el `LIMIT 1` de cada subconsulta no pierde nada.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Foto del estado actual, para comparar después del reemplazo.
-- ------------------------------------------------------------
CREATE TEMP TABLE _antes_45 ON COMMIT DROP AS
SELECT receta_id,
       costo_total_pools,
       costo_insumos_directos,
       costo_total_unitario,
       costo_pool_quirofano,
       (costo_pool_consultorio + costo_pool_quirofano + costo_pool_parabulbar
        + costo_pool_rfg + costo_pool_reesterilizables + costo_pool_lavado
        + costo_pool_faco + costo_pool_implante + costo_pool_medicamentos
        + costo_pool_descartables) AS suma_columnas
FROM v_recetas_costos_por_pool;

-- ------------------------------------------------------------
-- 2. La vista, idéntica salvo el matcheo de nombres.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_recetas_costos_por_pool AS
WITH pools_activos AS (
         SELECT pools_insumos.id,
            pools_insumos.nombre
           FROM pools_insumos
          WHERE pools_insumos.activo = true
        ), costos_pools AS (
         SELECT p.id AS pool_id,
            p.nombre AS pool_nombre,
            fn_costo_pool(p.id) AS costo_total_pool
           FROM pools_activos p
        ), practicas_por_pool AS (
         SELECT rp.pool_id,
            COALESCE(sum(pr_1.cantidad_mensual_estimada), 0::bigint) AS total_practicas_mes
           FROM receta_pools rp
             JOIN practicas_recetas pr_1 ON rp.receta_id = pr_1.id
          WHERE rp.activo = true AND pr_1.activo = true
          GROUP BY rp.pool_id
        ), costo_unitario_pool AS (
         SELECT cp.pool_id,
            cp.pool_nombre,
            -- Nombre normalizado: minúsculas y sin acentos. Es lo único que se
            -- agrega, y es lo que hace que "Quirófano" caiga en su columna.
            translate(lower(cp.pool_nombre::text), 'áéíóúü', 'aeiouu') AS pool_norm,
            cp.costo_total_pool,
            pp.total_practicas_mes,
                CASE
                    WHEN pp.total_practicas_mes > 0 THEN cp.costo_total_pool / pp.total_practicas_mes::numeric
                    ELSE 0::numeric
                END AS costo_unitario
           FROM costos_pools cp
             LEFT JOIN practicas_por_pool pp ON cp.pool_id = pp.pool_id
        )
 SELECT id AS receta_id,
    codigo_practica,
    nombre_practica,
    categoria,
    cantidad_mensual_estimada,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_norm LIKE '%consultorio%'
         LIMIT 1), 0::numeric) AS costo_pool_consultorio,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_norm LIKE '%quirofano%'
         LIMIT 1), 0::numeric) AS costo_pool_quirofano,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_norm LIKE '%parabulbar%'
         LIMIT 1), 0::numeric) AS costo_pool_parabulbar,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_norm LIKE '%rfg%'
         LIMIT 1), 0::numeric) AS costo_pool_rfg,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_norm LIKE '%re esterilizable%' AND cup.pool_norm NOT LIKE '%lavado%'
         LIMIT 1), 0::numeric) AS costo_pool_reesterilizables,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_norm LIKE '%lavado%'
         LIMIT 1), 0::numeric) AS costo_pool_lavado,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_norm LIKE '%faco%'
         LIMIT 1), 0::numeric) AS costo_pool_faco,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_norm LIKE '%implante%'
         LIMIT 1), 0::numeric) AS costo_pool_implante,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_norm LIKE '%medicamento%'
         LIMIT 1), 0::numeric) AS costo_pool_medicamentos,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_norm LIKE '%descartable%'
         LIMIT 1), 0::numeric) AS costo_pool_descartables,
    COALESCE(( SELECT sum(cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)) AS sum
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true), 0::numeric) AS costo_total_pools,
    COALESCE(( SELECT sum(rid.cantidad_por_practica * iv.precio_unitario) AS sum
           FROM receta_insumos_directos rid
             JOIN insumos_variables iv ON rid.insumo_id = iv.id
          WHERE rid.receta_id = pr.id AND rid.activo = true AND iv.activo = true), 0::numeric) AS costo_insumos_directos,
    COALESCE(( SELECT sum(cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)) AS sum
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true), 0::numeric) + COALESCE(( SELECT sum(rid.cantidad_por_practica * iv.precio_unitario) AS sum
           FROM receta_insumos_directos rid
             JOIN insumos_variables iv ON rid.insumo_id = iv.id
          WHERE rid.receta_id = pr.id AND rid.activo = true AND iv.activo = true), 0::numeric) AS costo_total_unitario
   FROM practicas_recetas pr
  WHERE activo = true
  ORDER BY codigo_practica;

-- ------------------------------------------------------------
-- 3. Verificación. Si un costo total cambió, la migración se aborta.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_recetas          int;
  v_totales_movidos  int;
  v_cerraban_antes   int;
  v_cierran_ahora    int;
  v_quirofano_antes  numeric;
  v_quirofano_ahora  numeric;
BEGIN
  SELECT count(*) INTO v_recetas FROM _antes_45;

  -- Ningún total puede haberse movido: sólo cambió el reparto en columnas.
  SELECT count(*) INTO v_totales_movidos
  FROM _antes_45 a
  JOIN v_recetas_costos_por_pool d ON d.receta_id = a.receta_id
  WHERE abs(a.costo_total_pools      - d.costo_total_pools)      > 0.005
     OR abs(a.costo_insumos_directos - d.costo_insumos_directos) > 0.005
     OR abs(a.costo_total_unitario   - d.costo_total_unitario)   > 0.005;

  IF v_totales_movidos > 0 THEN
    RAISE EXCEPTION 'ABORTA: % recetas cambiaron algún costo total. La migración sólo puede mover el DETALLE.', v_totales_movidos;
  END IF;

  -- Cuántas recetas tienen el desglose cerrando contra su total, antes y ahora.
  SELECT count(*) INTO v_cerraban_antes
  FROM _antes_45 WHERE abs(costo_total_pools - suma_columnas) <= 0.01;

  SELECT count(*) INTO v_cierran_ahora
  FROM v_recetas_costos_por_pool
  WHERE abs(costo_total_pools - (costo_pool_consultorio + costo_pool_quirofano
      + costo_pool_parabulbar + costo_pool_rfg + costo_pool_reesterilizables
      + costo_pool_lavado + costo_pool_faco + costo_pool_implante
      + costo_pool_medicamentos + costo_pool_descartables)) <= 0.01;

  SELECT COALESCE(sum(costo_pool_quirofano), 0) INTO v_quirofano_antes FROM _antes_45;
  SELECT COALESCE(sum(costo_pool_quirofano), 0) INTO v_quirofano_ahora FROM v_recetas_costos_por_pool;

  RAISE NOTICE 'recetas: %', v_recetas;
  RAISE NOTICE 'ningún costo total se movió: OK';
  RAISE NOTICE 'desglose que cierra contra su total: % antes -> % ahora', v_cerraban_antes, v_cierran_ahora;
  RAISE NOTICE 'columna Quirófano: $% antes -> $% ahora', round(v_quirofano_antes, 2), round(v_quirofano_ahora, 2);

  IF v_cierran_ahora <= v_cerraban_antes THEN
    RAISE EXCEPTION 'ABORTA: el arreglo no mejoró el cierre del desglose (% -> %)', v_cerraban_antes, v_cierran_ahora;
  END IF;
END $$;

COMMIT;
