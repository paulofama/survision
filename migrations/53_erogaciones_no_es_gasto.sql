-- ============================================================
-- Migración 53 — tipo_costo 'no_es_gasto': movimientos de fondos
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- EL PROBLEMA
-- -----------
-- `erogaciones_geclisa` trae todo lo que sale por caja y por proveedores. En
-- 2025, cuando casi todo se pagaba por caja, eso incluye cosas que NO son un
-- gasto del instituto sino movimientos de fondos:
--
--   RENDICION CAJA CIRUGIA ....... 36 comprobantes · $84.406.987
--   RENDICION VOUCHER ............ 19               · $84.066.850
--   RENDICION EFECTIVO ........... 18               · $39.443.590
--   RENDICION CAJA EFECTIVO ......  9               · $23.174.300
--   RENDICION CAJA VOUCHER .......  4               · $21.854.200
--   RENDICION VOUCHER CIRUGIA ....  3               · $18.226.600
--   TESORERIA .................... 27               · $16.784.680
--   DEPOSITO BANCARIO ............  4               ·  $7.860.000
--
-- Hasta ahora había tres estados posibles y ninguno servía para esto:
--
--   'fijo'           -> suma al costo fijo del mes. Sería inventar un gasto.
--   'variable'       -> no entra al resultado, pero sí a la conciliación de
--                       pagos, donde un depósito bancario no pinta nada.
--   'sin_clasificar' -> cae en la línea "COSTOS NO IDENTIFICADOS", o sea que
--                       IGUAL se lee como un costo que nadie clasificó.
--
-- Dejarlas sin fila tampoco: el aviso de costos incompletos (que mide lo
-- clasificado contra el espejo crudo) las contaría como faltantes para
-- siempre, y un aviso que nunca se puede apagar se deja de leer.
--
-- LA DECISIÓN (Paulo, 23/09/2026): "las rendiciones no son gasto".
--
-- `no_es_gasto` es el cuarto estado: alguien MIRÓ el comprobante y decidió que
-- no corresponde al resultado. No suma a ninguna línea del estado de
-- resultados, no va a la conciliación, y cuenta como clasificado —porque lo
-- está—. La diferencia con `sin_clasificar` es la que importa: uno es una
-- decisión, el otro es una tarea pendiente, y hasta hoy se veían igual.
-- ============================================================

BEGIN;

ALTER TABLE public.erogaciones_clasificacion
  DROP CONSTRAINT IF EXISTS chk_tipo_costo;

ALTER TABLE public.erogaciones_clasificacion
  ADD CONSTRAINT chk_tipo_costo
  CHECK (tipo_costo::text = ANY (ARRAY['sin_clasificar', 'fijo', 'variable', 'no_es_gasto']));

COMMENT ON COLUMN public.erogaciones_clasificacion.tipo_costo IS
  'fijo = suma al costo fijo del mes · variable = se pagó, pero el resultado '
  'lo calcula el modelo (fórmula + recetas), así que no suma; sirve para la '
  'conciliación · no_es_gasto = movimiento de fondos (rendiciones, depósitos, '
  'transferencias a tesorería): alguien lo miró y decidió que no corresponde '
  'al resultado · sin_clasificar = todavía nadie lo miró.';

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_def text;
  v_ok  boolean;
BEGIN
  SELECT pg_get_constraintdef(con.oid) INTO v_def
    FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'erogaciones_clasificacion' AND con.conname = 'chk_tipo_costo';

  IF v_def IS NULL THEN RAISE EXCEPTION 'ABORTA: se perdió el CHECK de tipo_costo'; END IF;
  IF position('no_es_gasto' in v_def) = 0 THEN
    RAISE EXCEPTION 'ABORTA: el CHECK no admite no_es_gasto: %', v_def;
  END IF;

  -- Que los tres viejos sigan entrando: esto no reemplaza nada, agrega.
  SELECT position('sin_clasificar' in v_def) > 0
     AND position('fijo' in v_def) > 0
     AND position('variable' in v_def) > 0
    INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'ABORTA: el CHECK perdió alguno de los tres valores viejos: %', v_def; END IF;

  RAISE NOTICE 'tipo_costo admite ahora: sin_clasificar, fijo, variable, no_es_gasto.';
END $$;
