-- ============================================================
-- MIGRACIÓN 20: registro de recordatorios enviados (sección Turnos)
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
-- Guarda qué turnos ya fueron avisados por WhatsApp, para que la marca
-- "✓ Avisado" persista. NO puede vivir en turnos_futuros porque el daemon
-- reescribe esa tabla entera 2 veces/día (delete + insert); esta tabla, en
-- cambio, no la toca el daemon y se cruza por turno_id (estable en GECLISA).
--
-- La escribe el FRONTEND (cliente autenticado, RLS aplica) al tocar WhatsApp
-- o el check. "Desmarcar" = DELETE de la fila.
--
-- RLS: permiso 'turnos' para SELECT/INSERT/UPDATE/DELETE (mismas secretarías).
-- Idempotente. Atómica.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.turnos_recordatorios (
  turno_id    integer PRIMARY KEY,
  avisado_at  timestamptz NOT NULL DEFAULT now(),
  avisado_por text,                       -- username del que lo despachó
  canal       text NOT NULL DEFAULT 'whatsapp'
);

COMMENT ON TABLE public.turnos_recordatorios IS
  'Turnos ya avisados (sección Turnos). Cruce por turno_id con turnos_futuros. La escribe el frontend; el daemon no la toca.';

ALTER TABLE public.turnos_recordatorios ENABLE ROW LEVEL SECURITY;

-- Una policy por operación: todas exigen el permiso 'turnos'.
DROP POLICY IF EXISTS pol_turnos_recordatorios_select ON public.turnos_recordatorios;
CREATE POLICY pol_turnos_recordatorios_select ON public.turnos_recordatorios
  FOR SELECT TO authenticated
  USING (public.app_tiene_permiso('turnos'));

DROP POLICY IF EXISTS pol_turnos_recordatorios_insert ON public.turnos_recordatorios;
CREATE POLICY pol_turnos_recordatorios_insert ON public.turnos_recordatorios
  FOR INSERT TO authenticated
  WITH CHECK (public.app_tiene_permiso('turnos'));

DROP POLICY IF EXISTS pol_turnos_recordatorios_update ON public.turnos_recordatorios;
CREATE POLICY pol_turnos_recordatorios_update ON public.turnos_recordatorios
  FOR UPDATE TO authenticated
  USING (public.app_tiene_permiso('turnos'))
  WITH CHECK (public.app_tiene_permiso('turnos'));

DROP POLICY IF EXISTS pol_turnos_recordatorios_delete ON public.turnos_recordatorios;
CREATE POLICY pol_turnos_recordatorios_delete ON public.turnos_recordatorios
  FOR DELETE TO authenticated
  USING (public.app_tiene_permiso('turnos'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'turnos_recordatorios'
  ) THEN
    RAISE EXCEPTION 'FALLO: no se creó turnos_recordatorios';
  END IF;
  RAISE NOTICE 'OK 20: turnos_recordatorios creada + RLS (4 policies, permiso turnos).';
END $$;

COMMIT;
