-- ============================================================
-- Revert de la migración 79 — "Volver a pendiente" y "Anular"
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- Deja todo como en la migración 70: sin triggers, sin funciones y con la
-- policy FOR ALL del historial.
--
-- LO QUE NO SE REVIERTE, A PROPÓSITO
-- ----------------------------------
--   · Las filas de historial que se escribieron mientras la 79 estuvo
--     aplicada. Son constancias de cambios reales; borrarlas sería mentir.
--   · Las columnas `resultado_fecha_anterior` y `resultado_por_anterior`. Son
--     nullable y no molestan a nada; tirarlas perdería quién y cuándo había
--     registrado los resultados revertidos. Si de verdad hay que sacarlas:
--       ALTER TABLE public.presupuestos_historial
--         DROP COLUMN IF EXISTS resultado_fecha_anterior,
--         DROP COLUMN IF EXISTS resultado_por_anterior;
--
-- Ojo: sin la 79, la pantalla nueva no puede volver a pendiente ni anular
-- (llama a las funciones). Revertir la base va junto con revertir el commit.
-- ============================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_presupuestos_historial_resultado ON public.presupuestos;
DROP TRIGGER IF EXISTS trg_presupuestos_guardia_resultado ON public.presupuestos;
DROP FUNCTION IF EXISTS public.tg_presupuestos_historial_resultado();
DROP FUNCTION IF EXISTS public.tg_presupuestos_guardia_resultado();
DROP FUNCTION IF EXISTS public.presupuesto_cambiar_resultado(uuid, text, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.presupuesto_chequear_cambio(uuid, text);

DROP POLICY IF EXISTS pol_presupuestos_historial_select ON public.presupuestos_historial;
DROP POLICY IF EXISTS pol_presupuestos_historial_insert ON public.presupuestos_historial;
DROP POLICY IF EXISTS pol_presupuestos_historial ON public.presupuestos_historial;
CREATE POLICY pol_presupuestos_historial ON public.presupuestos_historial
  FOR ALL TO authenticated
  USING (public.app_tiene_permiso('presupuestador'))
  WITH CHECK (public.app_tiene_permiso('presupuestador'));

COMMIT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('presupuesto_cambiar_resultado', 'presupuesto_chequear_cambio')) THEN
    RAISE EXCEPTION 'ABORTA: quedaron funciones de la 79';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname IN ('trg_presupuestos_historial_resultado', 'trg_presupuestos_guardia_resultado')) THEN
    RAISE EXCEPTION 'ABORTA: quedaron triggers de la 79';
  END IF;
  RAISE NOTICE 'Revert 79 OK.';
END $$;
