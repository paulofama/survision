-- ============================================================
-- REVERSIÓN de la 77 · Liq. Honorarios: Oliva y Arias
-- ============================================================
-- Borra las dos filas SÓLO si no tienen liquidaciones cargadas (FK desde
-- `liq_honorarios.prestador_id`). Si ya tienen, aborta: en ese caso se dan de
-- baja con `activo = false`, nunca se borran, para no perder el histórico.
-- Después quita el índice único.
-- ============================================================

BEGIN;

DO $$
DECLARE
  n_liq int;
BEGIN
  SELECT count(*) INTO n_liq
    FROM public.liq_honorarios l
    JOIN public.liq_honorarios_prestadores p ON p.id = l.prestador_id
   WHERE p.pre_id_geclisa IN (17, 18);
  IF n_liq > 0 THEN
    RAISE EXCEPTION 'Oliva/Arias ya tienen % liquidaciones: no se borran. Usar activo = false.', n_liq;
  END IF;
END $$;

DELETE FROM public.liq_honorarios_prestadores
 WHERE pre_id_geclisa IN (17, 18);

DROP INDEX IF EXISTS public.ux_liq_prestadores_pre_id_geclisa;

COMMIT;
