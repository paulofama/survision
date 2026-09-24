-- ============================================================
-- Migración 55 — sacar el UNIQUE(segmento) que impedía versionar
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- La migración 54 agregó `vigencia_desde` y el índice único
-- (segmento, vigencia_desde), pero dejó en pie una restricción vieja:
--
--     honorarios_config_segmento_key  UNIQUE (segmento)
--
-- O sea que la tabla seguía admitiendo UNA SOLA FILA POR SEGMENTO y versionar
-- era imposible. Al probar el camino nuevo en la pantalla —cambiar el
-- porcentaje de Estudios de 40 a 41— el guardado falló con
-- "duplicate key value violates unique constraint".
--
-- Falló fuerte y no escribió nada, que es lo que uno quiere de un error: la
-- fila original quedó intacta. Si en vez de una restricción hubiera habido un
-- UPSERT silencioso, el porcentaje viejo se habría perdido igual que antes y
-- nadie se habría enterado.
--
-- La garantía que importa NO se pierde: (segmento, vigencia_desde) sigue
-- siendo único, así que dos versiones del mismo segmento no pueden empezar el
-- mismo día. Lo que se levanta es la limitación a una sola versión.
-- ============================================================

BEGIN;

ALTER TABLE public.honorarios_config
  DROP CONSTRAINT IF EXISTS honorarios_config_segmento_key;

-- Por si el índice de la 54 no llegó a crearse en algún entorno.
DROP INDEX IF EXISTS ux_honorarios_config_segmento_vigencia;
CREATE UNIQUE INDEX ux_honorarios_config_segmento_vigencia
  ON public.honorarios_config (segmento, vigencia_desde);

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_viejo int;
  v_nuevo int;
  v_filas int;
BEGIN
  SELECT count(*) INTO v_viejo FROM pg_constraint
   WHERE conrelid = 'public.honorarios_config'::regclass
     AND conname = 'honorarios_config_segmento_key';
  SELECT count(*) INTO v_nuevo FROM pg_indexes
   WHERE tablename = 'honorarios_config' AND indexname = 'ux_honorarios_config_segmento_vigencia';
  SELECT count(*) INTO v_filas FROM public.honorarios_config;

  IF v_viejo > 0 THEN
    RAISE EXCEPTION 'ABORTA: sigue el UNIQUE(segmento), no se puede versionar';
  END IF;
  IF v_nuevo <> 1 THEN
    RAISE EXCEPTION 'ABORTA: falta el índice único (segmento, vigencia_desde) — sin él dos versiones podrían empezar el mismo día';
  END IF;
  IF v_filas < 3 THEN
    RAISE EXCEPTION 'ABORTA: quedaron % filas de configuración, se esperaban al menos 3', v_filas;
  END IF;

  RAISE NOTICE 'Se puede versionar: % filas, único por (segmento, vigencia_desde).', v_filas;
END $$;
