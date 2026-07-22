-- ============================================================
-- MIGRACIÓN 28: matches presupuesto → práctica/cirugía realizada (Fase C)
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
-- Una fila por CANDIDATO (presupuesto ↔ atención realizada del espejo
-- movimientos_geclisa). El motor (matchPracticasService.js) cruza por DNI +
-- código (o alias de la migración 27) + fecha posterior:
--   - único candidato  -> estado 'confirmado', auto=true, y marca el presupuesto
--     practicado (estado='practicado' + fecha_practica, columnas ya existentes).
--   - varios candidatos -> 'sugerido' (van a la pantalla de revisión).
-- 'descartado' = el operador dijo "no es esta cirugía" (no se re-sugiere).
--
-- RLS: permiso 'presupuestador' (operativo, mismos usuarios). Idempotente. Atómica.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.presupuestos_practica_match (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id    uuid NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  atencion_id       integer NOT NULL,
  codigo_realizado  text,
  practica_nombre   text,
  prestador_nombre  text,
  fecha_practica    date,
  estado            text NOT NULL DEFAULT 'sugerido' CHECK (estado IN ('sugerido','confirmado','descartado')),
  confianza         text CHECK (confianza IN ('unica','ambigua')),
  auto              boolean NOT NULL DEFAULT false,
  revisado_por      text,
  revisado_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_practica_match UNIQUE (presupuesto_id, atencion_id)
);

DROP TRIGGER IF EXISTS trg_updated_at ON public.presupuestos_practica_match;
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.presupuestos_practica_match
  FOR EACH ROW EXECUTE FUNCTION public.tg_presupuestos_updated_at();

CREATE INDEX IF NOT EXISTS ix_practica_match_presupuesto ON public.presupuestos_practica_match (presupuesto_id);
CREATE INDEX IF NOT EXISTS ix_practica_match_estado ON public.presupuestos_practica_match (estado);

ALTER TABLE public.presupuestos_practica_match ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_practica_match_all ON public.presupuestos_practica_match;
CREATE POLICY pol_practica_match_all ON public.presupuestos_practica_match
  FOR ALL TO authenticated
  USING (public.app_tiene_permiso('presupuestador'))
  WITH CHECK (public.app_tiene_permiso('presupuestador'));

DO $$
BEGIN
  IF to_regclass('public.presupuestos_practica_match') IS NULL THEN
    RAISE EXCEPTION 'FALLO 28: no se creó presupuestos_practica_match';
  END IF;
  RAISE NOTICE 'OK 28: presupuestos_practica_match + RLS.';
END $$;

COMMIT;
