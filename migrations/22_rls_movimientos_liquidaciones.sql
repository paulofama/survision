-- ============================================================
-- MIGRACIÓN 22: RLS movimientos_geclisa también para 'liquidaciones'
-- Sistema de Gestión Integral - Survisión S.A.
-- ============================================================
-- BUG: la pantalla "Liquidación de Derivaciones" (módulo Liquidaciones) lee
-- movimientos_geclisa para armar el listado y el dropdown de derivadores. Pero
-- el RLS de esa tabla solo permitía a quienes tienen permiso 'analisis'. El rol
-- Tesorería (y cualquier rol con 'liquidaciones' pero sin 'analisis') veía el
-- dropdown de derivadores VACÍO, porque el RLS le devolvía 0 filas.
--
-- FIX: ampliar la policy para permitir 'analisis' O 'liquidaciones'. Ambos son
-- usos legítimos de esos movimientos (análisis marginal / liquidación de
-- derivaciones). Los admin siguen pasando por app_tiene_permiso.
--
-- Idempotente. Atómica.
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS pol_movimientos_geclisa_select ON public.movimientos_geclisa;
CREATE POLICY pol_movimientos_geclisa_select ON public.movimientos_geclisa
  FOR SELECT TO authenticated
  USING (public.app_tiene_permiso('analisis') OR public.app_tiene_permiso('liquidaciones'));

DO $$
BEGIN
  RAISE NOTICE 'OK 22: RLS movimientos_geclisa ahora permite analisis OR liquidaciones.';
END $$;

COMMIT;
