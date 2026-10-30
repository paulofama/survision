-- ============================================================
-- REVERSIÓN de la 81 · Informe de presupuestos
-- ============================================================
-- Quita la función. Los permisos 'informes:presupuestos' que se hayan
-- asignado desde Gestión de Accesos quedan en `permisos_rol`: sin la función
-- no dan acceso a nada, y borrarlos sería deshacer una decisión de alguien.
-- Ojo: el frontend posterior a la 81 llama a esta función; sin ella el
-- informe muestra el error y no carga.
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS public.informe_presupuestos_datos();

DO $$
BEGIN
  IF to_regprocedure('public.informe_presupuestos_datos()') IS NOT NULL THEN
    RAISE EXCEPTION 'FALLO revert 81: la función sigue existiendo';
  END IF;
  RAISE NOTICE 'OK revert 81: informe_presupuestos_datos() eliminada.';
END $$;

COMMIT;
