-- ============================================================
-- Migración 47 — poder anular una entrega de caja
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- EL PROBLEMA
-- -----------
-- Una entrega de caja cargada por error no se podía deshacer. El diseño de la
-- migración 44 es correcto —cada entrega es una fila y NUNCA se pisa, para que
-- un segundo pago no borre el primero— pero le faltaba la contrapartida:
-- corregir una que no debía existir.
--
-- El 23/09/2026 Administración probó un ingreso de $150.000 sobre el
-- presupuesto REAL de un paciente (P-2026-895), no pudo deshacerlo, y lo único
-- que el sistema le ofrecía era CANCELAR EL PRESUPUESTO ENTERO. Terminó
-- cancelando el del otro ojo por error y rehaciéndolo. Un martillazo para
-- sacar un clavo.
--
-- POR QUÉ ANULAR Y NO BORRAR
-- --------------------------
-- La fila se queda. Borrarla dejaría un comprobante impreso, entregado al
-- paciente, sin respaldo en el sistema — y nadie podría explicar después por
-- qué el saldo cambió. Anular deja el rastro completo: qué se cargó, quién lo
-- anuló, cuándo y por qué.
--
-- El saldo y `entregasPrevias` ignoran las anuladas. El motivo es OBLIGATORIO
-- (CHECK): una anulación sin explicación es indistinguible de un error nuevo.
-- ============================================================

BEGIN;

ALTER TABLE public.presupuestos_caja_entregas
  ADD COLUMN IF NOT EXISTS anulada_at      timestamptz,
  ADD COLUMN IF NOT EXISTS anulada_por     text,
  ADD COLUMN IF NOT EXISTS anulacion_motivo text;

COMMENT ON COLUMN public.presupuestos_caja_entregas.anulada_at IS
  'Cuándo se anuló. NULL = entrega vigente. Las anuladas NO suman al saldo, '
  'pero la fila se conserva: hubo un comprobante impreso y tiene que quedar rastro.';

COMMENT ON COLUMN public.presupuestos_caja_entregas.anulacion_motivo IS
  'Por qué se anuló. Obligatorio: una anulación sin explicación es '
  'indistinguible de un error nuevo.';

-- Las tres columnas viajan juntas: o la entrega está vigente, o tiene los tres
-- datos de la anulación. Un estado a medias sería peor que no poder anular.
ALTER TABLE public.presupuestos_caja_entregas
  DROP CONSTRAINT IF EXISTS chk_anulacion_completa;
ALTER TABLE public.presupuestos_caja_entregas
  ADD CONSTRAINT chk_anulacion_completa CHECK (
    (anulada_at IS NULL AND anulada_por IS NULL AND anulacion_motivo IS NULL)
    OR
    (anulada_at IS NOT NULL AND anulada_por IS NOT NULL
     AND anulacion_motivo IS NOT NULL AND length(btrim(anulacion_motivo)) >= 3)
  );

-- El saldo se calcula sobre las vigentes, así que se indexan por ahí.
CREATE INDEX IF NOT EXISTS idx_caja_entregas_vigentes
  ON public.presupuestos_caja_entregas (presupuesto_id)
  WHERE anulada_at IS NULL;

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_cols  int;
  v_chk   int;
  v_filas int;
  v_anul  int;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_name = 'presupuestos_caja_entregas'
     AND column_name IN ('anulada_at', 'anulada_por', 'anulacion_motivo');

  SELECT count(*) INTO v_chk FROM pg_constraint
   WHERE conname = 'chk_anulacion_completa';

  SELECT count(*) INTO v_filas FROM public.presupuestos_caja_entregas;
  SELECT count(*) INTO v_anul  FROM public.presupuestos_caja_entregas WHERE anulada_at IS NOT NULL;

  IF v_cols <> 3 THEN RAISE EXCEPTION 'ABORTA: faltan columnas (hay %)', v_cols; END IF;
  IF v_chk  <> 1 THEN RAISE EXCEPTION 'ABORTA: no se creó el CHECK'; END IF;

  -- Nada de lo que ya existía puede haber cambiado de estado.
  IF v_anul <> 0 THEN
    RAISE EXCEPTION 'ABORTA: la migración marcó % entregas como anuladas y no debía tocar ninguna', v_anul;
  END IF;

  RAISE NOTICE 'columnas de anulación: 3 · CHECK activo · % entregas existentes, todas vigentes', v_filas;
END $$;
