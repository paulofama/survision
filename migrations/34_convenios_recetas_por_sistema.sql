-- ============================================================
-- MIGRACIÓN 34: Convenios que cargan las recetas por su propio sistema
-- Sistema de Gestión Integral - Survisión S.A.
-- ============================================================
-- Origen: respuestas de Administración al testeo del circuito (11/08/2026).
--
-- Cuando el presupuesto incluye medicación adicional (ej. la ampolla de
-- Avastin), el Sobre Quirúrgico debe emitir también SU RECETA, separada y con
-- membrete completo — EXCEPTO para OSEP, que tiene un sistema propio para
-- cargar recetas electrónicas.
--
-- En vez de hardcodear "OSEP" en el frontend, la excepción se declara en el
-- `config` jsonb del convenio: así mañana se suma OSDE (u otra) sin tocar
-- código. El frontend igual conserva un match por nombre como respaldo.
--
-- Sólo actualiza DATOS de configuración (no cambia el esquema). Idempotente.
-- ============================================================

BEGIN;

-- OSEP: recetas por sistema propio (electrónicas).
UPDATE public.presupuestos_convenios
   SET config = COALESCE(config, '{}'::jsonb) || '{"recetas_por_sistema": true}'::jsonb
 WHERE nombre = 'OSEP';

-- El resto de los convenios emiten la receta en papel: se deja el flag
-- explícito en false para que la configuración sea legible de un vistazo.
UPDATE public.presupuestos_convenios
   SET config = COALESCE(config, '{}'::jsonb) || '{"recetas_por_sistema": false}'::jsonb
 WHERE nombre <> 'OSEP'
   AND NOT (COALESCE(config, '{}'::jsonb) ? 'recetas_por_sistema');

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
DO $$
DECLARE
  n_osep    integer;
  n_sinflag integer;
BEGIN
  SELECT count(*) INTO n_osep
    FROM public.presupuestos_convenios
   WHERE nombre = 'OSEP' AND config->>'recetas_por_sistema' = 'true';
  IF n_osep <> 1 THEN
    RAISE EXCEPTION 'FALLO 34: OSEP debía quedar con recetas_por_sistema=true (encontrados %)', n_osep;
  END IF;

  SELECT count(*) INTO n_sinflag
    FROM public.presupuestos_convenios
   WHERE NOT (COALESCE(config, '{}'::jsonb) ? 'recetas_por_sistema');
  IF n_sinflag > 0 THEN
    RAISE EXCEPTION 'FALLO 34: quedaron % convenios sin el flag recetas_por_sistema', n_sinflag;
  END IF;

  RAISE NOTICE 'OK 34: OSEP marcado con recetas por sistema propio; resto en papel.';
END $$;

COMMIT;
