-- ============================================================
-- MIGRACIÓN 10: snapshot del análisis de turnos (GECLISA -> Supabase)
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
-- Tabla de UNA fila (singleton id=1) que guarda el payload completo del
-- dashboard de turnos (resumen, próximos 7 días, por prestador/servicio,
-- turnos de hoy y pendientes) como JSON. La refresca el daemon on-prem
-- (turnosExtractor.js) 2 veces/día; el frontend remoto la lee directo.
--
-- Contiene nombres de pacientes (turnosHoy/turnosPendientes) -> RLS: solo
-- usuarios autenticados con permiso 'turnos'. El daemon escribe con
-- service_role (bypassa RLS).
--
-- Idempotente. Patrón: igual que 09_pacientes_geclisa.sql.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.turnos_analisis (
  id        smallint PRIMARY KEY DEFAULT 1,
  payload   jsonb       NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turnos_analisis_singleton CHECK (id = 1)
);

COMMENT ON TABLE public.turnos_analisis IS
  'Snapshot (singleton) del dashboard de turnos. Lo refresca el daemon de sync on-prem desde GECLISA. Frontend remoto lee de acá.';

ALTER TABLE public.turnos_analisis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_turnos_analisis_select ON public.turnos_analisis;
CREATE POLICY pol_turnos_analisis_select ON public.turnos_analisis
  FOR SELECT TO authenticated
  USING (public.app_tiene_permiso('turnos'));

COMMIT;
