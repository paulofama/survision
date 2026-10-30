-- ============================================================
-- REVERSIÓN de la 82 · Vistas sin acceso anónimo
-- ============================================================
-- ⚠️ REABRE LA EXPOSICIÓN: vuelve a dejar los sueldos, las liquidaciones de
-- honorarios y los permisos de usuarios legibles con la anon key pública.
-- Correrla sólo si la 82 rompió algo y mientras se corrige.
--
-- Devuelve SELECT a anon sobre las 12 vistas que estaban abiertas el
-- 30/10/2026 (no los demás privilegios: alcanza para restaurar lo que la app
-- pudiera estar leyendo).
-- ============================================================

BEGIN;

DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'v_liq_honorarios', 'v_pools_prorrateo', 'v_prestacion_insumos',
    'v_recetas_con_costos', 'v_recetas_costos_completos', 'v_recetas_costos_por_pool',
    'v_recetas_costos_por_pool_v2', 'v_sueldos_detalle_empleado', 'v_sueldos_resumen_mensual',
    'v_sueldos_total_mensual', 'v_usuarios_permisos', 'vista_prestaciones'
  ] LOOP
    IF to_regclass('public.' || v) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT ON public.%I TO anon', v);
    END IF;
  END LOOP;
  RAISE NOTICE 'OK revert 82: SELECT de anon devuelto (exposición reabierta).';
END $$;

COMMIT;
