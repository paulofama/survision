-- ============================================================
-- MIGRACIÓN 38: Sacar la nota interna del placeholder del consentimiento
-- Sistema de Gestión Integral - Survisión S.A.
-- ============================================================
-- El texto placeholder del consentimiento informado (seed de la migración 25)
-- incluía una nota de trabajo dirigida al equipo:
--
--   "...será provisto por P. Famá y cargado como una NUEVA versión vigente
--    antes de usarse en producción."
--
-- Ese texto SE IMPRIME en la hoja de consentimiento del Sobre Quirúrgico, que
-- firma el paciente y se archiva en quirófano. Detectado al revisar el sobre
-- de P-2026-813: era la única página de las 11 que seguía nombrando al
-- desarrollador, después de sacar el crédito de los pies de página.
--
-- Se reemplaza por un placeholder neutro, con el mismo sentido (avisar que el
-- texto no es el definitivo) pero sin nombres ni notas internas. El contenido
-- legal real lo entrega Administración y se carga como una versión NUEVA.
--
-- Idempotente (UPDATE por clave/versión). Atómica.
-- ============================================================

BEGIN;

UPDATE public.presupuestos_textos_legales
   SET contenido = '[{"titulo":"PLACEHOLDER — pendiente del texto legal definitivo","cuerpo":"Este documento todavía NO contiene el texto definitivo del consentimiento informado para cirugía de catarata (Leyes 26.529 y 26.742, Decreto Reglamentario 1089/2012, modelo aprobado por el Consejo Argentino de Oftalmología). NO utilizar para un consentimiento real: el texto vigente será cargado antes de su uso en producción."}]'::jsonb,
       notas = 'Placeholder neutro (migración 38). Reemplazar por el texto legal definitivo cargándolo como una NUEVA versión vigente, no editando esta fila.'
 WHERE clave = 'consentimiento_catarata'
   AND version = 1;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
DO $$
DECLARE
  cuerpo text;
BEGIN
  SELECT contenido::text INTO cuerpo
    FROM public.presupuestos_textos_legales
   WHERE clave = 'consentimiento_catarata' AND vigente;

  IF cuerpo IS NULL THEN
    RAISE EXCEPTION 'FALLO 38: no hay texto vigente para consentimiento_catarata';
  END IF;
  IF cuerpo ILIKE '%Fam%' THEN
    RAISE EXCEPTION 'FALLO 38: el texto vigente todavía nombra al desarrollador';
  END IF;
  IF cuerpo NOT ILIKE '%PLACEHOLDER%' THEN
    RAISE EXCEPTION 'FALLO 38: se perdió la marca PLACEHOLDER del texto';
  END IF;

  RAISE NOTICE 'OK 38: placeholder del consentimiento sin notas internas.';
END $$;

COMMIT;
