-- ============================================================
-- 42 · Versionar el costeo de recetas que vivía solo en Supabase
-- ============================================================
-- Sistema de Gestión Integral · Survisión S.A.
--
-- POR QUÉ ESTA MIGRACIÓN
-- ----------------------
-- Las tres vistas y las dos funciones que calculan el costo de una práctica
-- se crearon a mano en Supabase y nunca estuvieron en el repositorio. Nadie
-- podía leer la fórmula sin conectarse a la base, ni revisar un cambio, ni
-- reconstruirlas si se perdían.
--
-- Esto NO cambia nada: es la definición vigente al 31/08/2026, recuperada con
-- pg_get_viewdef() y pg_get_functiondef() y guardada tal cual. Correrla sobre
-- la base actual la deja igual. Es el punto de partida para poder discutir la
-- corrección del prorrateo.
--
-- CÓMO SE CALCULA HOY EL COSTO DE UNA PRÁCTICA
-- --------------------------------------------
--   costo unitario del pool = fn_costo_pool(pool)
--                             / suma de cantidad_mensual_estimada de las
--                               recetas activas que usan ese pool
--
--   costo de la práctica    = SUMA(costo unitario del pool x % asignación)
--                             + SUMA(cantidad_por_practica x precio insumo)
--
-- EL PROBLEMA DEL DENOMINADOR (medido el 31/08/2026)
-- --------------------------------------------------
-- cantidad_mensual_estimada se carga a mano en cada receta y no se parece a
-- lo que pasa: Exoftalmología está en 9 prácticas por mes cuando hace 859. Y
-- el desvío no va siempre para el mismo lado:
--
--   pool                        estimado   real   efecto en el costo unitario
--   Insumos Grales Consultorio   394/mes  1.358   lo INFLA (divide por 3,4 de menos)
--   Insumos Grales Quirófano     208/mes     49   lo HUNDE (divide por 4,2 de más)
--   Re Esterilizable Catarata     63/mes     22   lo HUNDE
--   Re Esterilizable Retina       15/mes      3   lo HUNDE
--
-- Sobre los 8 meses de 2026:
--   · los pools cuestan            $21.129.690
--   · el sistema asigna            $36.753.232  (1,7 veces: inventa $15,6 M)
--   · con cantidades reales daría  $21.063.121  (cierra, que es lo que debe
--                                                hacer un prorrateo)
--   · Consultas cargan $24,2 M de más y Cirugías $8,6 M de menos, así que el
--     margen por segmento sale distorsionado en direcciones opuestas.
--
-- Además, cargar una receta nueva cambia el costo de todas las que comparten
-- el pool: al sumar Topografía Corneal al de consultorio, las otras 32
-- prácticas bajaron de $3.166 a $2.888 y el costo total de 2026 CAYÓ
-- $2.133.854. Por eso se revirtió.
--
-- QUÉ FALTA DEFINIR ANTES DE CORREGIRLO (no es técnico)
-- -----------------------------------------------------
--   1. pools_insumos.tipo_consumo dice 'Anual' en el pool de consultorio,
--      pero la fórmula divide ese costo por cantidades MENSUALES sin
--      convertir. Si esos $1.247.421 son de un año, hay un factor 12 encima
--      de todo lo demás.
--   2. Si el denominador debe ser el volumen real de GECLISA —con lo que el
--      prorrateo cerraría solo y nadie tendría que mantener 103 estimaciones—
--      o seguir siendo una estimación de gestión.
--
-- Mientras eso no se defina, NO conviene cargar recetas de prácticas que usen
-- un pool compartido: mueven el costo de todas las demás.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- fn_costo_pool — costo total de un pool = SUMA(cantidad x factor x precio).
-- Ignora los insumos inactivos. NO prorratea: eso lo hace la vista.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_costo_pool(p_pool_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_costo NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(
    pi.cantidad * pi.factor_ajuste * iv.precio_unitario
  ), 0)
  INTO v_costo
  FROM pool_items pi
  JOIN insumos_variables iv ON pi.insumo_id = iv.id
  WHERE pi.pool_id = p_pool_id
    AND iv.activo = true;
    
  RETURN v_costo;
END;
$function$;

-- ------------------------------------------------------------
-- v_recetas_costos_por_pool — la que consume el Análisis Marginal.
-- Abre el costo de pools en una columna por pool y suma los insumos directos.
-- OJO: identifica cada pool por ILIKE sobre su nombre, así que renombrar un
-- pool en pools_insumos deja su columna en cero sin avisar.
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
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_nombre::text ~~* '%consultorio%'::text
         LIMIT 1), 0::numeric) AS costo_pool_consultorio,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_nombre::text ~~* '%quirofano%'::text
         LIMIT 1), 0::numeric) AS costo_pool_quirofano,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_nombre::text ~~* '%parabulbar%'::text
         LIMIT 1), 0::numeric) AS costo_pool_parabulbar,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_nombre::text ~~* '%rfg%'::text
         LIMIT 1), 0::numeric) AS costo_pool_rfg,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_nombre::text ~~* '%re esterilizable%'::text AND cup.pool_nombre::text !~~* '%lavado%'::text
         LIMIT 1), 0::numeric) AS costo_pool_reesterilizables,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_nombre::text ~~* '%lavado%'::text
         LIMIT 1), 0::numeric) AS costo_pool_lavado,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_nombre::text ~~* '%faco%'::text
         LIMIT 1), 0::numeric) AS costo_pool_faco,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_nombre::text ~~* '%implante%'::text
         LIMIT 1), 0::numeric) AS costo_pool_implante,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_nombre::text ~~* '%medicamento%'::text
         LIMIT 1), 0::numeric) AS costo_pool_medicamentos,
    COALESCE(( SELECT cup.costo_unitario * (rp.porcentaje_asignacion / 100::numeric)
           FROM receta_pools rp
             JOIN costo_unitario_pool cup ON rp.pool_id = cup.pool_id
          WHERE rp.receta_id = pr.id AND rp.activo = true AND cup.pool_nombre::text ~~* '%descartable%'::text
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
-- v_recetas_costos_completos — misma base, formato plano.
-- La usan useRecetasCostos y el módulo de Insumos. Redondea los pools a dos
-- decimales, por eso daba $3 de diferencia contra la vista por_pool en el
-- margen mensual (ver el commit del 27/08/2026 en useEvolucionMensual).
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_recetas_costos_completos AS
SELECT id AS receta_id,
    codigo_practica,
    nombre_practica,
    categoria,
    subcategoria,
    cantidad_mensual_estimada,
    COALESCE(( SELECT sum(fn_costo_unitario_pool(rp.pool_id) * (rp.porcentaje_asignacion / 100::numeric)) AS sum
           FROM receta_pools rp
          WHERE rp.receta_id = pr.id AND rp.activo = true), 0::numeric) AS costo_pools_unitario,
    COALESCE(( SELECT sum(rid.cantidad_por_practica * iv.precio_unitario) AS sum
           FROM receta_insumos_directos rid
             JOIN insumos_variables iv ON rid.insumo_id = iv.id
          WHERE rid.receta_id = pr.id AND rid.activo = true AND iv.activo = true), 0::numeric) AS costo_insumos_unitario,
    COALESCE(( SELECT sum(fn_costo_unitario_pool(rp.pool_id) * (rp.porcentaje_asignacion / 100::numeric)) AS sum
           FROM receta_pools rp
          WHERE rp.receta_id = pr.id AND rp.activo = true), 0::numeric) + COALESCE(( SELECT sum(rid.cantidad_por_practica * iv.precio_unitario) AS sum
           FROM receta_insumos_directos rid
             JOIN insumos_variables iv ON rid.insumo_id = iv.id
          WHERE rid.receta_id = pr.id AND rid.activo = true AND iv.activo = true), 0::numeric) AS costo_total_unitario,
    ( SELECT count(*) AS count
           FROM receta_pools rp
          WHERE rp.receta_id = pr.id AND rp.activo = true) AS cantidad_pools,
    ( SELECT count(*) AS count
           FROM receta_insumos_directos rid
          WHERE rid.receta_id = pr.id AND rid.activo = true) AS cantidad_insumos,
    observaciones,
    activo,
    created_at,
    updated_at
   FROM practicas_recetas pr
  WHERE activo = true
  ORDER BY codigo_practica;

-- ------------------------------------------------------------
-- v_recetas_con_costos — variante histórica.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_recetas_con_costos AS
SELECT pr.id,
    pr.codigo_practica,
    pr.nombre_practica,
    pr.categoria,
    pr.subcategoria,
    pr.cantidad_anual_estimada,
    pr.observaciones,
    pr.activo,
    pr.created_at,
    pr.updated_at,
    COALESCE(costos.costo_pools, 0::numeric) AS costo_pools,
    COALESCE(costos.costo_insumos_directos, 0::numeric) AS costo_insumos_directos,
    COALESCE(costos.costo_total, 0::numeric) AS costo_total,
    ( SELECT count(*) AS count
           FROM receta_pools
          WHERE receta_pools.receta_id = pr.id AND receta_pools.activo = true) AS cantidad_pools,
    ( SELECT count(*) AS count
           FROM receta_insumos_directos
          WHERE receta_insumos_directos.receta_id = pr.id AND receta_insumos_directos.activo = true) AS cantidad_insumos_directos
   FROM practicas_recetas pr
     LEFT JOIN LATERAL calcular_costo_receta(pr.id) costos(costo_pools, costo_insumos_directos, costo_total, detalle_pools, detalle_insumos) ON true
  WHERE pr.activo = true;

-- ------------------------------------------------------------
-- rpc_obtener_costo_receta — lee una receta puntual desde la vista.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_obtener_costo_receta(p_receta_id uuid)
 RETURNS TABLE(receta_id uuid, codigo_practica character varying, nombre_practica character varying, cantidad_mensual integer, costo_pools numeric, costo_insumos numeric, costo_total numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    v.receta_id,
    v.codigo_practica,
    v.nombre_practica,
    v.cantidad_mensual_estimada,
    v.costo_pools_unitario,
    v.costo_insumos_unitario,
    v.costo_total_unitario
  FROM v_recetas_costos_completos v
  WHERE v.receta_id = p_receta_id;
END;
$function$;

COMMIT;

-- ============================================================
-- Verificación: que las tres vistas y las dos funciones existan.
-- ============================================================
DO $$
DECLARE
  v_faltan text := '';
BEGIN
  IF to_regclass('public.v_recetas_costos_por_pool')  IS NULL THEN v_faltan := v_faltan || ' v_recetas_costos_por_pool'; END IF;
  IF to_regclass('public.v_recetas_costos_completos') IS NULL THEN v_faltan := v_faltan || ' v_recetas_costos_completos'; END IF;
  IF to_regclass('public.v_recetas_con_costos')       IS NULL THEN v_faltan := v_faltan || ' v_recetas_con_costos'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'fn_costo_pool')
    THEN v_faltan := v_faltan || ' fn_costo_pool'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'rpc_obtener_costo_receta')
    THEN v_faltan := v_faltan || ' rpc_obtener_costo_receta'; END IF;

  IF v_faltan <> '' THEN
    RAISE EXCEPTION 'Faltan objetos después de la migración 42:%', v_faltan;
  END IF;
  RAISE NOTICE 'OK 42: costeo de recetas versionado (3 vistas + 2 funciones).';
END
$$;
