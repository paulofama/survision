-- ============================================================
-- Migración 66 — ICL (lente intraocular fáquica)
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
--   030107  ICL unilateral, esférica miópica e hipermetrópica .... 3 presup.
--   030113  ICL unilateral, tórica miópica ....................... 1
--
-- LA INDICACIÓN LA TRAE EL NOMBRE DE LA LENTE
-- --------------------------------------------
-- A diferencia del PRK, acá no hizo falta preguntar: el tipo de lente dice
-- para qué sirve.
--   · La ESFÉRICA corrige miopía o hipermetropía, y no astigmatismo — por
--     eso son dos opciones y no tres.
--   · La TÓRICA MIÓPICA corrige miopía CON astigmatismo: es una sola
--     indicación, así que va como diagnóstico único y sin menú.
--
-- `lleva_lio` VA EN **NO**, Y NO ES UN DESCUIDO
-- ----------------------------------------------
-- La ICL es, literalmente, una lente intraocular, así que lo intuitivo sería
-- marcar que sí. Pero `lleva_lio` no describe la cirugía: hace que el pedido
-- imprima el renglón "LIO indicado" con la lente que se eligió del catálogo
-- `presupuestos_lios`. Y ese catálogo tiene sólo lentes de CATARATA —
-- monofocal, tórico, PanOptix, Vivity, rígido, implante secundario—: no hay
-- ninguna ICL.
--
-- Con `lleva_lio = true` el pedido imprimiría una lente de catarata en una
-- cirugía donde no se implanta ninguna de ésas. Queda en NO, y la lente se
-- entiende igual porque la solicitud dice "implante de lente intraocular
-- fáquica (ICL)".
--
-- Si algún día se cargan las ICL en el catálogo de lentes, esto se da vuelta.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. ICL esférica: miopía o hipermetropía
-- ------------------------------------------------------------
INSERT INTO public.presupuestos_diagnostico_opciones
  (codigo_practica, diagnostico, solicitud, lleva_lio, orden, created_by, nota_interna)
VALUES
  ('030107', 'Miopía {ojo}',
   'Implante de lente intraocular fáquica (ICL) esférica, unilateral.', false, 1, 'migracion_66',
   'La lente esférica corrige miopía o hipermetropía; el astigmatismo lo corrige la tórica (030113).'),
  ('030107', 'Hipermetropía {ojo}',
   'Implante de lente intraocular fáquica (ICL) esférica, unilateral.', false, 2, 'migracion_66',
   'La lente esférica corrige miopía o hipermetropía; el astigmatismo lo corrige la tórica (030113).')
ON CONFLICT (codigo_practica, diagnostico) DO NOTHING;

-- ------------------------------------------------------------
-- 2. ICL tórica miópica: una sola indicación
-- ------------------------------------------------------------
INSERT INTO public.presupuestos_diagnosticos
  (codigo_practica, diagnostico, solicitud, lleva_lio, activo, nota_interna)
VALUES
  ('030113', 'Miopía con astigmatismo {ojo}',
   'Implante de lente intraocular fáquica (ICL) tórica, unilateral.', false, true,
   'La indicación la trae el nombre de la lente: tórica miópica corrige miopía CON astigmatismo. '
   || 'Una sola indicación, así que va sin menú. `lleva_lio` en NO a propósito: el catálogo de '
   || 'lentes sólo tiene lentes de catarata y no hay ICL, así que el renglón imprimiría una lente '
   || 'que no es la que se implanta.')
ON CONFLICT (codigo_practica) DO NOTHING;

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_esf integer;
  v_tor boolean;
  v_lio_icl integer;
  v_choque integer;
  v_solas integer;
  v_cubiertos integer;
  v_total integer;
BEGIN
  SELECT count(*) INTO v_esf FROM public.presupuestos_diagnostico_opciones
   WHERE codigo_practica = '030107' AND activo;
  IF v_esf <> 2 THEN
    RAISE EXCEPTION 'ABORTA: la ICL esférica tiene % opciones, deberían ser 2', v_esf;
  END IF;

  SELECT activo INTO v_tor FROM public.presupuestos_diagnosticos WHERE codigo_practica = '030113';
  IF v_tor IS NOT TRUE THEN
    RAISE EXCEPTION 'ABORTA: la ICL tórica no quedó activa';
  END IF;

  -- Ninguna ICL puede pedir el renglón del LIO: no hay ICL en el catálogo de
  -- lentes y se imprimiría una de catarata.
  SELECT count(*) INTO v_lio_icl FROM (
    SELECT lleva_lio FROM public.presupuestos_diagnosticos WHERE codigo_practica IN ('030107', '030113')
    UNION ALL
    SELECT lleva_lio FROM public.presupuestos_diagnostico_opciones WHERE codigo_practica IN ('030107', '030113')
  ) q WHERE lleva_lio;
  IF v_lio_icl > 0 THEN
    RAISE EXCEPTION 'ABORTA: % fila(s) de ICL quedaron pidiendo el renglón del LIO', v_lio_icl;
  END IF;

  SELECT count(*) INTO v_choque
    FROM public.presupuestos_diagnostico_opciones o
    JOIN public.presupuestos_diagnosticos d ON d.codigo_practica = o.codigo_practica
   WHERE o.activo AND d.activo;
  IF v_choque > 0 THEN
    RAISE EXCEPTION 'ABORTA: % práctica(s) con diagnóstico único Y opciones activas', v_choque;
  END IF;

  SELECT count(*) INTO v_solas FROM (
    SELECT codigo_practica FROM public.presupuestos_diagnostico_opciones
     WHERE activo GROUP BY codigo_practica HAVING count(*) < 2) q;
  IF v_solas > 0 THEN
    RAISE EXCEPTION 'ABORTA: % práctica(s) con una sola opción', v_solas;
  END IF;

  SELECT count(*) FILTER (WHERE
           EXISTS (SELECT 1 FROM public.presupuestos_diagnosticos d
                    WHERE d.codigo_practica = p.prestacion_codigo AND d.activo)
        OR EXISTS (SELECT 1 FROM public.presupuestos_diagnostico_opciones o
                    WHERE o.codigo_practica = p.prestacion_codigo AND o.activo)),
         count(*)
    INTO v_cubiertos, v_total
    FROM public.presupuestos p
   WHERE p.prestacion_codigo IS NOT NULL AND p.prestacion_codigo <> '';

  RAISE NOTICE 'ICL cargadas. Diagnósticos: % de % presupuestos (%%%).',
    v_cubiertos, v_total, round(v_cubiertos * 100.0 / NULLIF(v_total, 0), 1);
END $$;
