-- ============================================================
-- REVERSIÓN de la 78 · "Lleva lente" + LIO Mininuc
-- ============================================================
-- Ojo antes de correrla: el código del frontend posterior a la 78 lee
-- `prestaciones.lleva_lio`. Revertir la base sin revertir ese commit deja al
-- modal de aceptación pidiendo LIO para todo (comportamiento anterior).
--
-- - Vuelve a cargar el LIO "Básico" de P-2026-733, como estaba.
-- - El ítem "LIO definido" de la 733 vuelve a aplicar.
-- - Da de baja (activo = false) el LIO Mininuc en vez de borrarlo si alguna
--   aceptación ya lo usa; si nadie lo usa, lo borra.
-- - Quita la función y la columna.
-- El historial NO se borra: queda la constancia de la 78 y de su reversión.
-- ============================================================

BEGIN;

UPDATE public.presupuestos_aceptacion a
   SET lio_id = (SELECT id FROM public.presupuestos_lios WHERE nombre = 'Básico')
  FROM public.presupuestos p
 WHERE p.id = a.presupuesto_id
   AND p.numero_presupuesto = 'P-2026-733'
   AND a.lio_id IS NULL;

INSERT INTO public.presupuestos_historial
  (presupuesto_id, campo, valor_anterior, valor_nuevo, observaciones, usuario)
SELECT p.id, 'lio_id', NULL, 'Básico', 'Reversión de la migración 78.', 'migracion_78_revert'
  FROM public.presupuestos p
 WHERE p.numero_presupuesto = 'P-2026-733';

UPDATE public.presupuestos_checklist ch
   SET no_aplica = false
  FROM public.presupuestos p
 WHERE p.id = ch.presupuesto_id
   AND p.numero_presupuesto = 'P-2026-733'
   AND ch.item_clave = 'lio_definido';

UPDATE public.presupuestos_lios
   SET activo = false
 WHERE codigo_practica = '030510'
   AND EXISTS (SELECT 1 FROM public.presupuestos_aceptacion a
                WHERE a.lio_id = presupuestos_lios.id);

DELETE FROM public.presupuestos_lios
 WHERE codigo_practica = '030510'
   AND NOT EXISTS (SELECT 1 FROM public.presupuestos_aceptacion a
                    WHERE a.lio_id = presupuestos_lios.id);

DROP FUNCTION IF EXISTS public.prestacion_set_lleva_lio(text, boolean);

-- El CHECK del historial vuelve a la lista de la 71. Las filas 'lio_id' ya
-- escritas se conservan: NOT VALID no las revisa (no se borra historial).
ALTER TABLE public.presupuestos_historial
  DROP CONSTRAINT IF EXISTS presupuestos_historial_campo_check;
ALTER TABLE public.presupuestos_historial
  ADD CONSTRAINT presupuestos_historial_campo_check CHECK (campo = ANY (ARRAY[
    'resultado', 'estado', 'rama_cobertura', 'convenio_id', 'ojo',
    'fecha_tentativa_cirugia', 'requiere_analisis_ecg', 'diagnostico_opcion_id'
  ]::text[])) NOT VALID;

COMMENT ON COLUMN public.presupuestos_diagnosticos.lleva_lio IS NULL;

ALTER TABLE public.prestaciones DROP COLUMN IF EXISTS lleva_lio;

COMMIT;
