-- ============================================================
-- REVERSIÓN de la 80 · Verificación de practicados a mano
-- ============================================================
-- Borra las filas de match que insertó la 80 y que nadie tocó después:
--   - confirmadas por regla (revisado_por = 'verificacion_practicados');
--   - sugeridas todavía sin revisar (misma marca).
-- Las que alguien ya revisó desde la pantalla llevan su usuario en
-- revisado_por: son decisiones de una persona y NO se borran.
--
-- Ojo: el motor de match posterior a la 80 también cruza los practicados a
-- mano. Si se revierte la base sin revertir ese commit, la próxima corrida del
-- motor vuelve a confirmar los de una sola práctica.
-- No toca `presupuestos` (la 80 tampoco lo hizo).
-- ============================================================

BEGIN;

DELETE FROM public.presupuestos_practica_match
 WHERE revisado_por = 'verificacion_practicados';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.presupuestos_practica_match
              WHERE revisado_por = 'verificacion_practicados') THEN
    RAISE EXCEPTION 'FALLO revert 80: quedaron filas de la verificación';
  END IF;
  RAISE NOTICE 'OK revert 80: filas de la verificación borradas.';
END $$;

COMMIT;
