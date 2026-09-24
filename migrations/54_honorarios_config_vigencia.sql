-- ============================================================
-- Migración 54 — honorarios_config con vigencia por fecha
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- EL PROBLEMA
-- -----------
-- `honorarios_config` guarda el porcentaje de honorarios por segmento y NO
-- tiene vigencia: hay una sola fila por segmento y el módulo le aplica el
-- porcentaje de HOY a CUALQUIER mes. Así que si el porcentaje cambia, todo el
-- histórico se recalcula con el valor nuevo y el comparativo entre años deja
-- de medir lo que pasó: mide lo que habría pasado con las reglas de hoy.
--
-- No es hipotético. La fila de Consultas se modificó el 15/06/2026 y el valor
-- anterior NO quedó en ningún lado (sólo cambió `updated_at`). Hoy dice 60 %
-- socio / 50 % no socio.
--
-- CUÁNTO PESA. Cada PUNTO de porcentaje de consultas mueve:
--
--     2024 ...... $353.901       ($35.390.066 de facturación de consultas)
--     2025 ...... $3.231.714     ($323.171.425)
--     2026 ...... $3.812.135     ($381.213.526)
--
-- O sea que si el porcentaje se movió cinco puntos, el 2025 que muestra el
-- sistema tiene ~$16 M de honorarios que no son los de 2025.
--
-- QUÉ HACE ESTA MIGRACIÓN
-- -----------------------
-- Agrega `vigencia_desde`. Una fila rige desde esa fecha hasta que empieza la
-- siguiente versión del mismo segmento; la última rige hasta hoy.
--
-- Las tres filas actuales arrancan en 2000-01-01, o sea que **cubren todo el
-- histórico y el comportamiento no cambia en nada**. Eso es deliberado: esta
-- migración habilita la corrección, no la aplica. Cargar el porcentaje viejo
-- de Consultas es un INSERT más, y hace falta que alguien diga cuál era y
-- desde cuándo — el dato no está en la base ni se puede deducir de las
-- liquidaciones (`liq_honorarios` guarda importes y IVA, no porcentajes).
-- ============================================================

BEGIN;

ALTER TABLE public.honorarios_config
  ADD COLUMN IF NOT EXISTS vigencia_desde date NOT NULL DEFAULT '2000-01-01';

COMMENT ON COLUMN public.honorarios_config.vigencia_desde IS
  'Desde cuándo rige este porcentaje. Para un mes dado se usa la fila del '
  'segmento con la vigencia_desde MÁS ALTA que no sea posterior al mes. '
  'Las filas originales arrancan en 2000-01-01 para cubrir todo el histórico.';

-- Dos versiones del mismo segmento no pueden empezar el mismo día: no habría
-- forma de decidir cuál gana.
DROP INDEX IF EXISTS ux_honorarios_config_segmento_vigencia;
CREATE UNIQUE INDEX ux_honorarios_config_segmento_vigencia
  ON public.honorarios_config (segmento, vigencia_desde);

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_col   int;
  v_filas int;
  v_viejo int;
BEGIN
  SELECT count(*) INTO v_col FROM information_schema.columns
   WHERE table_schema='public' AND table_name='honorarios_config' AND column_name='vigencia_desde';
  SELECT count(*) INTO v_filas FROM public.honorarios_config;
  SELECT count(*) INTO v_viejo FROM public.honorarios_config WHERE vigencia_desde = DATE '2000-01-01';

  IF v_col <> 1 THEN RAISE EXCEPTION 'ABORTA: no se creó vigencia_desde'; END IF;

  -- Todas las filas que ya existían tienen que quedar cubriendo el histórico:
  -- si alguna quedara con vigencia posterior, los meses anteriores se
  -- quedarían SIN porcentaje y los honorarios saldrían en cero, que es un
  -- error silencioso y enorme.
  IF v_viejo <> v_filas THEN
    RAISE EXCEPTION 'ABORTA: % de % filas no arrancan en 2000-01-01', v_filas - v_viejo, v_filas;
  END IF;

  RAISE NOTICE 'vigencia_desde creada · % filas cubriendo todo el histórico · el cálculo no cambia', v_filas;
END $$;
