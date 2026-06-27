-- ============================================================
-- MIGRACIÓN 11: snapshots de dashboards por período (GECLISA -> Supabase)
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
-- Tabla genérica que guarda el payload calculado de dashboards mensuales como
-- JSON, una fila por (modulo, anio, mes). La refresca el daemon on-prem; el
-- frontend remoto lee de acá. Reusable para varios módulos:
--   modulo = 'seguimiento' (informe mensual de pacientes) -> ESTE PASO
--   modulo = 'informes'    (gestión mensual)              -> futuro
--   modulo = 'analisis'    (comparativa, etc.)            -> futuro
--
-- `resumen` guarda datos livianos para el selector de meses del frontend (ej.
-- {atenciones}), para no traer el payload completo solo para armar el dropdown.
--
-- RLS por fila: cada módulo se cierra con su propio permiso. La columna `modulo`
-- coincide con el nombre del permiso del sistema -> USING(app_tiene_permiso(modulo)).
-- (Seguimiento tiene PII de pacientes; queda cerrado a quien no tenga el permiso.)
-- El daemon escribe con service_role (bypassa RLS).
--
-- Idempotente. Patrón: igual que 10_turnos_analisis.sql.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.dashboards_snapshot (
  modulo    text        NOT NULL,
  anio      integer     NOT NULL,
  mes       integer     NOT NULL,
  payload   jsonb       NOT NULL,
  resumen   jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (modulo, anio, mes)
);

COMMENT ON TABLE public.dashboards_snapshot IS
  'Snapshots por (modulo, anio, mes) de dashboards mensuales. Los refresca el daemon de sync on-prem desde GECLISA. Frontend remoto lee de acá.';

ALTER TABLE public.dashboards_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_dashboards_snapshot_select ON public.dashboards_snapshot;
CREATE POLICY pol_dashboards_snapshot_select ON public.dashboards_snapshot
  FOR SELECT TO authenticated
  USING (public.app_tiene_permiso(modulo));

COMMIT;
