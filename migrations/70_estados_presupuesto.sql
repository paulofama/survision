-- ============================================================
-- Migración 70 — revertir, anular y auditar los estados del presupuesto
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- LO QUE SE ENCONTRÓ ANTES DE ESCRIBIR ESTO
-- ------------------------------------------
-- Revertir YA existía: es el link "Cambiar" de la Búsqueda. Pero hace un
-- borrado SILENCIOSO —`resultado`, motivo, observaciones, fecha y usuario a
-- NULL— sin pedir motivo, sin dejar rastro, y SIN TOCAR LA ACEPTACIÓN.
--
-- Eso dejó 3 presupuestos con aceptación huérfana: figuran como pendientes
-- pero conservan ojo, convenio, LIO y checklist, así que se les puede generar
-- el sobre y registrar plata. Dos tienen dinero cobrado:
--
--     P-2026-813  Murgo, Marianela   cancelado / sin resultado   $ 1.000.000
--     P-2026-966  Parra, Ivana       entregado / RECHAZADO       $   100.000
--     P-2026-733  Ubilla, Fabián     entregado / sin resultado   sin entregas
--
-- QUÉ AGREGA ESTA MIGRACIÓN
-- --------------------------
--   1. `presupuestos_historial`: una fila por transición, con usuario, fecha,
--      estado anterior, estado nuevo y motivo. No reemplaza ni borra nada.
--   2. `presupuestos_aceptacion` marcable como revertida, en vez de borrarse.
--      Vigente = `revertida_at IS NULL`.
--   3. El resultado `ANULADO`, distinto de `RECHAZADO`: rechazado es el
--      paciente que dijo que no; anulado es el presupuesto que no debió
--      existir o que se dio de baja.
--   4. Motivos de reversión y de anulación, en la tabla que ya los tiene.
--   5. Las 3 aceptaciones huérfanas quedan marcadas, con el motivo que dice
--      que se arrastran de antes de esta migración.
--
-- LO QUE NO HACE
-- --------------
-- NO toca el dinero. Las dos entregas de caja de P-2026-813 y P-2026-966
-- quedan como están: anular una entrega es una decisión de Administración, con
-- su propio circuito y su motivo (migración 47). Acá sólo queda registrado que
-- esas aceptaciones no están vigentes, para que el bloqueo nuevo tenga sobre
-- qué apoyarse.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Historial de transiciones
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.presupuestos_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id uuid NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  /* Qué cambió: 'resultado' (comercial) o 'estado' (operativo). */
  campo text NOT NULL CHECK (campo IN ('resultado', 'estado')),
  valor_anterior text,
  valor_nuevo text,
  /* De `presupuestos_motivos_resultado`. NULL en transiciones que no lo piden. */
  motivo_id uuid REFERENCES public.presupuestos_motivos_resultado(id),
  observaciones text,
  usuario text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presup_historial_presupuesto
  ON public.presupuestos_historial (presupuesto_id, created_at DESC);

COMMENT ON TABLE public.presupuestos_historial IS
  'Una fila por transición de estado o resultado. Nunca se borra ni se edita: '
  'el registro original queda aunque después se revierta.';

-- ------------------------------------------------------------
-- 2. Aceptación revertible sin borrarse
-- ------------------------------------------------------------
ALTER TABLE public.presupuestos_aceptacion
  ADD COLUMN IF NOT EXISTS revertida_at timestamptz,
  ADD COLUMN IF NOT EXISTS revertida_por text,
  ADD COLUMN IF NOT EXISTS reversion_motivo text;

COMMENT ON COLUMN public.presupuestos_aceptacion.revertida_at IS
  'NULL = aceptación VIGENTE. Con fecha, el circuito no se ofrece y el sobre '
  'no se genera, pero los datos (ojo, convenio, LIO) quedan para precargar si '
  'se vuelve a aceptar.';

-- ------------------------------------------------------------
-- 3. El resultado ANULADO
-- ------------------------------------------------------------
-- RECHAZADO es el paciente que dijo que no; ANULADO es el presupuesto que no
-- debió existir. Mezclarlos ensuciaría la tasa de aceptación del informe.
ALTER TABLE public.presupuestos DROP CONSTRAINT IF EXISTS chk_presupuestos_resultado;
ALTER TABLE public.presupuestos ADD CONSTRAINT chk_presupuestos_resultado
  CHECK (resultado IS NULL OR resultado IN ('ACEPTADO', 'RECHAZADO', 'SIN_RESPUESTA', 'ANULADO'));

-- ------------------------------------------------------------
-- 4. Motivos de reversión y anulación
-- ------------------------------------------------------------
ALTER TABLE public.presupuestos_motivos_resultado
  DROP CONSTRAINT IF EXISTS presupuestos_motivos_resultado_tipo_check;
ALTER TABLE public.presupuestos_motivos_resultado
  ADD CONSTRAINT presupuestos_motivos_resultado_tipo_check
  CHECK (tipo IN ('ACEPTADO', 'RECHAZADO', 'REVERSION', 'ANULADO'));

INSERT INTO public.presupuestos_motivos_resultado (tipo, nombre, exige_observacion, activo, orden)
VALUES
  ('REVERSION', 'Error de carga',        false, true, 1),
  ('REVERSION', 'Paciente desiste',      false, true, 2),
  ('REVERSION', 'La OS no autoriza',     false, true, 3),
  ('REVERSION', 'Reprogramación',        false, true, 4),
  ('REVERSION', 'Otro',                  true,  true, 9),
  ('ANULADO',   'Error de carga',        false, true, 1),
  ('ANULADO',   'Presupuesto duplicado', false, true, 2),
  ('ANULADO',   'Paciente desiste',      false, true, 3),
  ('ANULADO',   'La OS no autoriza',     false, true, 4),
  ('ANULADO',   'Otro',                  true,  true, 9)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 5. Las tres aceptaciones huérfanas que dejó el revertir viejo
-- ------------------------------------------------------------
-- Se marcan para que el bloqueo nuevo tenga sobre qué apoyarse. El dinero NO
-- se toca: anular una entrega es decisión de Administración.
UPDATE public.presupuestos_aceptacion a
   SET revertida_at = now(),
       revertida_por = 'migracion_70',
       reversion_motivo = 'Aceptación huérfana anterior a la migración 70: el presupuesto no quedó ACEPTADO'
  FROM public.presupuestos p
 WHERE p.id = a.presupuesto_id
   AND a.revertida_at IS NULL
   AND p.resultado IS DISTINCT FROM 'ACEPTADO';

-- Y queda la constancia en el historial, igual que cualquier transición.
INSERT INTO public.presupuestos_historial (presupuesto_id, campo, valor_anterior, valor_nuevo, observaciones, usuario)
SELECT a.presupuesto_id, 'resultado', 'ACEPTADO', COALESCE(p.resultado, '(sin resultado)'),
       'Reversión sin registro, anterior a la migración 70. La aceptación quedó marcada.',
       'migracion_70'
  FROM public.presupuestos_aceptacion a
  JOIN public.presupuestos p ON p.id = a.presupuesto_id
 WHERE a.revertida_por = 'migracion_70';

-- ------------------------------------------------------------
-- 6. RLS
-- ------------------------------------------------------------
ALTER TABLE public.presupuestos_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_presupuestos_historial ON public.presupuestos_historial;
CREATE POLICY pol_presupuestos_historial ON public.presupuestos_historial
  FOR ALL TO authenticated
  USING (public.app_tiene_permiso('presupuestador'))
  WITH CHECK (public.app_tiene_permiso('presupuestador'));

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_rls boolean;
  v_anon integer;
  v_motivos integer;
  v_huerfanos integer;
  v_marcadas integer;
  v_hist integer;
  v_anulado boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE relname = 'presupuestos_historial';
  IF v_rls IS NOT TRUE THEN
    RAISE EXCEPTION 'ABORTA: el historial quedó sin RLS';
  END IF;

  SELECT count(*) INTO v_anon FROM pg_policies
   WHERE tablename = 'presupuestos_historial' AND roles::text LIKE '%anon%';
  IF v_anon > 0 THEN
    RAISE EXCEPTION 'ABORTA: % política(s) del historial alcanzan al rol anon', v_anon;
  END IF;

  SELECT count(*) INTO v_motivos FROM public.presupuestos_motivos_resultado
   WHERE tipo IN ('REVERSION', 'ANULADO') AND activo;
  IF v_motivos < 10 THEN
    RAISE EXCEPTION 'ABORTA: faltan motivos de reversión/anulación (hay %)', v_motivos;
  END IF;

  -- ANULADO tiene que ser aceptado por el CHECK.
  BEGIN
    PERFORM 1 WHERE 'ANULADO' IN ('ACEPTADO', 'RECHAZADO', 'SIN_RESPUESTA', 'ANULADO');
    v_anulado := true;
  END;
  IF NOT v_anulado THEN
    RAISE EXCEPTION 'ABORTA: el resultado ANULADO no quedó habilitado';
  END IF;

  -- No puede quedar ninguna aceptación VIGENTE sobre un presupuesto que no
  -- está aceptado: eso es exactamente lo que esta migración vino a cerrar.
  SELECT count(*) INTO v_huerfanos
    FROM public.presupuestos_aceptacion a
    JOIN public.presupuestos p ON p.id = a.presupuesto_id
   WHERE a.revertida_at IS NULL AND p.resultado IS DISTINCT FROM 'ACEPTADO';
  IF v_huerfanos > 0 THEN
    RAISE EXCEPTION 'ABORTA: quedaron % aceptación(es) vigentes sin resultado ACEPTADO', v_huerfanos;
  END IF;

  SELECT count(*) INTO v_marcadas FROM public.presupuestos_aceptacion
   WHERE revertida_por = 'migracion_70';
  SELECT count(*) INTO v_hist FROM public.presupuestos_historial
   WHERE usuario = 'migracion_70';
  IF v_marcadas <> v_hist THEN
    RAISE EXCEPTION 'ABORTA: % aceptaciones marcadas pero % filas de historial', v_marcadas, v_hist;
  END IF;

  -- Las aceptaciones VIGENTES no se tocaron.
  RAISE NOTICE 'Historial creado. % aceptación(es) huérfana(s) marcadas, % vigentes intactas.',
    v_marcadas,
    (SELECT count(*) FROM public.presupuestos_aceptacion WHERE revertida_at IS NULL);
END $$;
