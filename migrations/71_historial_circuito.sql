-- ============================================================
-- Migración 71 — el historial también registra el circuito
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- La migración 70 creó `presupuestos_historial` para las transiciones de
-- estado y resultado. Ahora los datos del circuito de un presupuesto ya
-- aceptado se pueden modificar (ojo, convenio, fecha, análisis/ECG, opción de
-- diagnóstico), y esos cambios tienen que quedar registrados igual.
--
-- POR QUÉ IMPORTA MÁS DE LO QUE PARECE
-- -------------------------------------
-- El ojo, el convenio y la opción de diagnóstico SALEN IMPRESOS. De las 21
-- aceptaciones vigentes al 03/10/2026, **11 ya tienen el sobre impreso** — y
-- todas ésas tienen entregas de caja registradas.
--
-- O sea: cambiar el ojo de uno de esos presupuestos deja al paciente y a
-- quirófano con un papel que dice otra cosa. El modal avisa antes de guardar,
-- y acá queda la constancia de qué cambió, quién y cuándo, para poder
-- reconstruirlo después.
--
-- Se amplía el CHECK en vez de sacarlo: una lista cerrada evita que mañana
-- alguien escriba `campo = 'ojo '` con un espacio y el historial se parta en
-- dos categorías que parecen una.
-- ============================================================

BEGIN;

ALTER TABLE public.presupuestos_historial
  DROP CONSTRAINT IF EXISTS presupuestos_historial_campo_check;

ALTER TABLE public.presupuestos_historial
  ADD CONSTRAINT presupuestos_historial_campo_check
  CHECK (campo IN (
    -- Transiciones (migración 70)
    'resultado',
    'estado',
    -- Datos del circuito (migración 71)
    'rama_cobertura',
    'convenio_id',
    'ojo',
    'fecha_tentativa_cirugia',
    'requiere_analisis_ecg',
    'diagnostico_opcion_id'
  ));

COMMENT ON COLUMN public.presupuestos_historial.campo IS
  'Qué cambió. "resultado"/"estado" son transiciones; el resto son campos del '
  'circuito, que en su mayoría salen impresos en el sobre.';

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_def text;
  v_previas integer;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.presupuestos_historial'::regclass
     AND conname = 'presupuestos_historial_campo_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'ABORTA: el CHECK de campo no quedó';
  END IF;

  -- Los dos valores de la migración 70 tienen que seguir aceptándose: si se
  -- cayeran, las 3 filas que ya existen quedarían fuera de su propia tabla.
  IF v_def NOT LIKE '%resultado%' OR v_def NOT LIKE '%estado%' THEN
    RAISE EXCEPTION 'ABORTA: el CHECK nuevo perdió los valores de la migración 70: %', v_def;
  END IF;
  IF v_def NOT LIKE '%ojo%' OR v_def NOT LIKE '%convenio_id%' THEN
    RAISE EXCEPTION 'ABORTA: el CHECK no admite los campos del circuito: %', v_def;
  END IF;

  SELECT count(*) INTO v_previas FROM public.presupuestos_historial;
  RAISE NOTICE 'Historial habilitado para el circuito. % fila(s) previas intactas.', v_previas;
END $$;
