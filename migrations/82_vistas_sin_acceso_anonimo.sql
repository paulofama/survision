-- ============================================================
-- 82 · Vistas: sin acceso con la anon key pública
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- PROBLEMA (encontrado el 30/10/2026)
--   12 vistas del esquema public se podían leer con la anon key, que viaja en
--   el bundle publicado: cualquiera con la dirección de la página, sin iniciar
--   sesión. Probado leyendo con el rol anon:
--     v_sueldos_detalle_empleado (311 filas), v_sueldos_resumen_mensual (54),
--     v_sueldos_total_mensual (17), v_liq_honorarios (60), v_usuarios_permisos
--     (14), v_recetas_costos_* (104), v_pools_prorrateo (10),
--     vista_prestaciones (183), v_prestacion_insumos, v_recetas_con_costos.
--
--   Por qué: una vista corre con los permisos de su DUEÑO (postgres), así que
--   no aplica la RLS de las tablas de abajo, y Supabase le da GRANT a anon a
--   todo lo que se crea en public. La auditoría (auditar-rls.cjs) miraba sólo
--   tablas: decía "sin exposición". Desde este commit mira también vistas.
--
-- QUÉ HACE
--   Saca TODO privilegio de anon (y de PUBLIC) sobre cada vista de public que
--   anon pueda leer. Se recorre el catálogo en vez de listar nombres, así una
--   vista que se agregue con el mismo defecto antes de correr esto también se
--   cierra. authenticated no cambia: ninguna pantalla deja de andar.
--   Verificado en el código: ninguna de estas vistas se usa sin sesión (las
--   únicas que lee el frontend son v_recetas_costos_*, desde pantallas que
--   piden login; el backend usa la service key).
--
-- QUÉ NO HACE (tarea siguiente)
--   Un usuario LOGUEADO sigue leyendo estas vistas sin pasar por la RLS de las
--   tablas (por ejemplo, sueldos sin el permiso 'sueldos'). Se cierra con
--   `security_invoker = true` vista por vista, probando cada rol.
--
-- Las funciones SECURITY DEFINER que anon puede ejecutar (tes_caja_*,
-- app_costo_laboral_meses, app_cobertura_erogaciones_meses) se probaron con
-- anon: todas responden "Sin permiso". No se tocan.
--
-- IDEMPOTENTE: REVOKE sobre lo que anon todavía puede leer. ATÓMICA.
-- REVERSIÓN: 82_vistas_sin_acceso_anonimo_revert.sql (reabre la exposición).
-- ============================================================

BEGIN;

DO $$
DECLARE
  v record;
  n int := 0;
BEGIN
  FOR v IN
    SELECT c.oid, c.relname
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relkind IN ('v', 'm')
       AND (has_table_privilege('anon', c.oid, 'SELECT')
            OR has_table_privilege('anon', c.oid, 'INSERT')
            OR has_table_privilege('anon', c.oid, 'UPDATE')
            OR has_table_privilege('anon', c.oid, 'DELETE'))
     ORDER BY c.relname
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v.relname);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', v.relname);
    n := n + 1;
    RAISE NOTICE '82: cerrada %', v.relname;
  END LOOP;
  RAISE NOTICE '82: % vistas cerradas para anon.', n;
END $$;

-- Verificación: ninguna vista legible por anon, y authenticated conserva la
-- lectura de las que usa el frontend.
DO $$
DECLARE
  v_abiertas text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO v_abiertas
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relkind IN ('v', 'm')
     AND has_table_privilege('anon', c.oid, 'SELECT');
  IF v_abiertas IS NOT NULL THEN
    RAISE EXCEPTION 'FALLO 82: siguen legibles por anon: %', v_abiertas;
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.v_recetas_costos_por_pool', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.v_recetas_costos_completos', 'SELECT') THEN
    RAISE EXCEPTION 'FALLO 82: authenticated perdió la lectura de v_recetas_costos_*';
  END IF;
  RAISE NOTICE 'OK 82: ninguna vista de public es legible con la anon key.';
END $$;

COMMIT;
