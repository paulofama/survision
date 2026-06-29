-- ============================================================
-- MIGRACIÓN 18: fix RLS Turnos + Seguimiento (permisos inexistentes)
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
-- Dos RLS pedían un nombre de módulo que NO existe en el sistema, por lo que
-- app_tiene_permiso() devolvía false para todo no-admin (Paulo no lo notó por
-- ser admin total):
--   1. turnos_analisis     -> pedía 'turnos' (no existe). Se usa 'analisis'
--      (la pantalla de Turnos vive en el módulo Análisis).
--   2. dashboards_snapshot -> el snapshot de Seguimiento se guardó con
--      modulo='seguimiento', pero el permiso real es 'seguimiento_pacientes'.
--      La policy es genérica USING(app_tiene_permiso(modulo)); se renombra el
--      valor de la columna para que coincida con el permiso. (El extractor y el
--      frontend se actualizan a 'seguimiento_pacientes' en el mismo commit.)
-- Idempotente.
-- ============================================================

BEGIN;

-- Fix 1: Turnos -> permiso 'analisis'
DROP POLICY IF EXISTS pol_turnos_analisis_select ON public.turnos_analisis;
CREATE POLICY pol_turnos_analisis_select ON public.turnos_analisis
  FOR SELECT TO authenticated
  USING (public.app_tiene_permiso('analisis'));

-- Fix 2: Seguimiento -> renombrar modulo a 'seguimiento_pacientes'
UPDATE public.dashboards_snapshot
  SET modulo = 'seguimiento_pacientes'
  WHERE modulo = 'seguimiento';

COMMIT;
