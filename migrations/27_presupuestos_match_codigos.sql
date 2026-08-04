-- ============================================================
-- MIGRACIÓN 27: equivalencias de códigos para el match de prácticas (Fase B)
-- Sistema de Gestión Integral - Survisión S.A.
-- ============================================================
-- El match "presupuesto → práctica realizada" cruza por código. Los códigos
-- 030xxx COINCIDEN en su mayoría entre el presupuesto y movimientos_geclisa
-- (mismo esquema), así que el motor trata la IDENTIDAD (código X → X) de forma
-- implícita. Esta tabla guarda solo los ALIAS: cuando la MISMA práctica quedó
-- registrada con OTRO código del lado realizado (códigos paralelos de GECLISA).
--
-- Motor (Fase C): equivalentes(X) = { X } ∪ { codigo_realizado : codigo_presupuesto=X, activo }.
--
-- Configurable: Paulo agrega alias si aparece otra práctica con código divergente.
-- RLS: SELECT con 'presupuestador'; edición con 'presupuestador:config' (como los
-- otros catálogos del circuito). Idempotente. Atómica.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.presupuestos_match_codigos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_presupuesto text NOT NULL,   -- prestacion_codigo del presupuesto
  codigo_realizado   text NOT NULL,   -- practica_codigo equivalente en movimientos_geclisa
  activo             boolean NOT NULL DEFAULT true,
  notas              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_match_codigos UNIQUE (codigo_presupuesto, codigo_realizado)
);

-- updated_at por trigger (reusa la función de la migración 25).
DROP TRIGGER IF EXISTS trg_updated_at ON public.presupuestos_match_codigos;
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.presupuestos_match_codigos
  FOR EACH ROW EXECUTE FUNCTION public.tg_presupuestos_updated_at();

CREATE INDEX IF NOT EXISTS ix_match_codigos_presupuesto
  ON public.presupuestos_match_codigos (codigo_presupuesto);

-- RLS
ALTER TABLE public.presupuestos_match_codigos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_match_codigos_select ON public.presupuestos_match_codigos;
CREATE POLICY pol_match_codigos_select ON public.presupuestos_match_codigos
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('presupuestador'));
DROP POLICY IF EXISTS pol_match_codigos_write ON public.presupuestos_match_codigos;
CREATE POLICY pol_match_codigos_write ON public.presupuestos_match_codigos
  FOR ALL TO authenticated
  USING (public.app_tiene_permiso('presupuestador:config'))
  WITH CHECK (public.app_tiene_permiso('presupuestador:config'));

-- Seed de alias (código paralelo del lado realizado). La identidad NO se seedea
-- (el motor la asume).
INSERT INTO public.presupuestos_match_codigos (codigo_presupuesto, codigo_realizado, notas) VALUES
  ('030502', '460703', 'Faco monofocal ↔ código paralelo Faco+LIO (460703)'),
  ('030501', '460703', 'Faco básico ↔ código paralelo Faco+LIO (460703)'),
  ('030503', '460703', 'Faco tórico ↔ código paralelo Faco+LIO (460703)'),
  ('030505', '460703', 'Faco rango extendido ↔ código paralelo Faco+LIO (460703)'),
  ('030601', '21005',  'Inyección intravítrea ↔ colocación de inyección (21005)'),
  ('030002', '460204', 'Yag capsulotomía ↔ YAG Láser (460204)')
ON CONFLICT (codigo_presupuesto, codigo_realizado) DO NOTHING;

DO $$
BEGIN
  IF to_regclass('public.presupuestos_match_codigos') IS NULL THEN
    RAISE EXCEPTION 'FALLO 27: no se creó presupuestos_match_codigos';
  END IF;
  RAISE NOTICE 'OK 27: presupuestos_match_codigos + RLS + seed de alias.';
END $$;

COMMIT;
