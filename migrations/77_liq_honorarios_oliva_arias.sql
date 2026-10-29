-- ============================================================
-- 77 · Liq. Honorarios: Dra. Ignacia Oliva y Dra. Francisca Arias
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- QUÉ HACE
--   1. Pone UNIQUE a `liq_honorarios_prestadores.pre_id_geclisa` (índice
--      parcial: sólo filas con ID). Hoy las 4 filas tienen IDs distintos
--      (2, 3, 4, 14), así que no hay nada que limpiar.
--   2. Da de alta a las dos médicas que faltaban, vinculadas a su ID de
--      GECLISA: Oliva = 17, Arias = 18.
--
-- POR QUÉ
--   A las dos se les liquidan honorarios, pero no estaban en el selector del
--   módulo (la tabla se cargó a mano con los 4 médicos de febrero-2026).
--
--   Es una SOLUCIÓN TRANSITORIA: el destino es la tabla `prestadores` como
--   única fuente. El UNIQUE sobre `pre_id_geclisa` es lo que garantiza que ese
--   pase no las duplique: cada fila queda atada a un solo prestador de GECLISA.
--
-- DATOS (verificados en GECLISA `Prestadores` el 2026-10-29)
--   17 · OLIVA IGNACIA   · CUIT 27-35512487-3
--   18 · ARIAS FRANCISCA · sin CUIT cargado en GECLISA
--   `condicion_iva` queda NULL a propósito: no la conocemos y el módulo no la
--   usa en ningún cálculo ni pantalla. El default de la columna ('Exento') se
--   pisa explícitamente para no inventar el dato. Completarla cuando se sepa.
--
-- IDEMPOTENTE: el índice es IF NOT EXISTS y el alta es ON CONFLICT DO NOTHING
-- sobre ese índice. Correrla dos veces no duplica.
-- RLS: la tabla ya la tiene (migración 36); no se toca.
-- REVERSIÓN: 77_liq_honorarios_oliva_arias_revert.sql
-- ============================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ux_liq_prestadores_pre_id_geclisa
  ON public.liq_honorarios_prestadores (pre_id_geclisa)
  WHERE pre_id_geclisa IS NOT NULL;

INSERT INTO public.liq_honorarios_prestadores
  (nombre, nombre_corto, pre_id_geclisa, es_socio, condicion_iva, cuit, activo, orden)
VALUES
  ('Dra. Ignacia Oliva',   'OLIVA', 17, false, NULL, '27-35512487-3', true, 5),
  ('Dra. Francisca Arias', 'ARIAS', 18, false, NULL, NULL,            true, 6)
ON CONFLICT (pre_id_geclisa) WHERE pre_id_geclisa IS NOT NULL DO NOTHING;

-- ------------------------------------------------------------
-- Verificación: si algo no quedó como se espera, aborta todo.
-- ------------------------------------------------------------
DO $$
DECLARE
  n_total int;
  n_ids   int;
BEGIN
  SELECT count(*) INTO n_total
    FROM public.liq_honorarios_prestadores
   WHERE pre_id_geclisa IN (17, 18);
  IF n_total <> 2 THEN
    RAISE EXCEPTION 'Se esperaban 2 filas para Oliva (17) y Arias (18), hay %', n_total;
  END IF;

  SELECT count(*) - count(DISTINCT pre_id_geclisa) INTO n_ids
    FROM public.liq_honorarios_prestadores
   WHERE pre_id_geclisa IS NOT NULL;
  IF n_ids <> 0 THEN
    RAISE EXCEPTION 'Hay % pre_id_geclisa repetidos', n_ids;
  END IF;
END $$;

COMMIT;
