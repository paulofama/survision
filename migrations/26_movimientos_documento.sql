-- ============================================================
-- MIGRACIÓN 26: DNI/ficha del paciente en el espejo movimientos_geclisa
-- Sistema de Gestión Integral - Survisión S.A.
-- ============================================================
-- Para el match automático "presupuesto → cirugía/práctica realizada" hace falta
-- identificar al paciente de forma EXACTA. El espejo tenía solo el nombre (sin
-- DNI). MovEnca de GECLISA trae el documento denormalizado (Me_NroDoc, 100% de
-- cobertura) + Ficha_id. Se agregan esas dos columnas; las llena el extractor
-- (movimientosExtractor.js) al re-sincronizar.
--
-- RLS: la tabla ya tiene su policy (permiso 'analisis'); agregar columnas no la
-- afecta. Idempotente. Atómica.
-- ============================================================

BEGIN;

ALTER TABLE public.movimientos_geclisa
  ADD COLUMN IF NOT EXISTS paciente_documento text,
  ADD COLUMN IF NOT EXISTS ficha_id integer;

-- Índice para el match por documento (se consulta por DNI del presupuesto).
CREATE INDEX IF NOT EXISTS ix_movimientos_geclisa_documento
  ON public.movimientos_geclisa (paciente_documento);

COMMENT ON COLUMN public.movimientos_geclisa.paciente_documento IS 'DNI del paciente (MovEnca.Me_NroDoc, para el match con presupuestos). Puede venir con ceros a la izquierda.';
COMMENT ON COLUMN public.movimientos_geclisa.ficha_id IS 'Ficha_id de GECLISA (MovEnca.Ficha_id).';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='movimientos_geclisa' AND column_name='paciente_documento') THEN
    RAISE EXCEPTION 'FALLO 26: no se agregó paciente_documento';
  END IF;
  RAISE NOTICE 'OK 26: movimientos_geclisa con paciente_documento + ficha_id.';
END $$;

COMMIT;
