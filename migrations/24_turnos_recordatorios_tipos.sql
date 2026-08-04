-- ============================================================
-- MIGRACIÓN 24: recordatorios de turnos por TIPO de mensaje
-- Sistema de Gestión Integral - Survisión S.A.
-- ============================================================
-- La sección Turnos ahora manda 3 mensajes distintos por turno:
--   inicial → al sacar el turno (confirmación)
--   previo  → un día antes (pide confirmar)
--   final   → tres horas antes (aviso final)
--
-- Para evitar duplicados (cada mensaje UNA sola vez por turno) se registra
-- cuándo se envió CADA uno. Antes había un único flag (avisado_at) que no
-- distinguía el tipo. Se agregan 3 columnas timestamptz nullable (NULL = no
-- enviado todavía). "Desmarcar" un tipo = poner su columna en NULL.
--
-- Backfill: las marcas viejas (avisado_at genérico) se mapean a aviso_previo_at
-- (el recordatorio "día antes" era el uso dominante de la ventana "Para mañana").
-- Los otros dos tipos quedan NULL → se re-muestran para enviar (lado seguro:
-- mejor volver a mostrar que suprimir un aviso).
--
-- RLS: la tabla ya tiene sus 4 policies (permiso 'turnos'); agregar columnas no
-- las afecta. Idempotente. Atómica.
-- ============================================================

BEGIN;

ALTER TABLE public.turnos_recordatorios
  ADD COLUMN IF NOT EXISTS aviso_inicial_at timestamptz,
  ADD COLUMN IF NOT EXISTS aviso_previo_at  timestamptz,
  ADD COLUMN IF NOT EXISTS aviso_final_at   timestamptz;

-- Backfill de las marcas viejas al tipo "previo" (día antes).
UPDATE public.turnos_recordatorios
SET aviso_previo_at = avisado_at
WHERE aviso_previo_at IS NULL AND avisado_at IS NOT NULL;

COMMENT ON COLUMN public.turnos_recordatorios.aviso_inicial_at IS 'Cuándo se envió el mensaje de confirmación al sacar el turno (NULL = no enviado).';
COMMENT ON COLUMN public.turnos_recordatorios.aviso_previo_at  IS 'Cuándo se envió el recordatorio del día antes (NULL = no enviado).';
COMMENT ON COLUMN public.turnos_recordatorios.aviso_final_at   IS 'Cuándo se envió el aviso de 3 horas antes (NULL = no enviado).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'turnos_recordatorios'
      AND column_name = 'aviso_final_at'
  ) THEN
    RAISE EXCEPTION 'FALLO: no se agregaron las columnas de tipo de aviso';
  END IF;
  RAISE NOTICE 'OK 24: turnos_recordatorios con aviso_inicial_at/previo/final.';
END $$;

COMMIT;
