-- ============================================================
-- Migración 73 — persistir la conciliación agenda vs facturación
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- POR QUÉ ESTA TABLA EXISTE: `Turnos` SE PURGA
-- ---------------------------------------------
-- La agenda de GECLISA es una VENTANA MÓVIL de ~4.500 filas. Medido:
--
--   05/10/2026 → quedaban restos de junio
--   13/10/2026 → la tabla arranca en julio; junio ya no existe
--
-- O sea: sostiene tres meses cerrados y cada mes que pasa se cae el más viejo.
-- La conciliación de un mes sólo se puede calcular mientras ese mes esté en la
-- ventana. Lo que no se persiste, deja de ser verificable para siempre.
--
-- Lo que hay hoy, y es lo que esta tabla sale a rescatar:
--
--   julio       1.112 atendidos · 14 discrepancias (1,3 %) · $  2.596.969
--   agosto      1.187 atendidos · 18 discrepancias (1,5 %) · $ 24.121.008
--   septiembre  1.234 atendidos · 18 discrepancias (1,5 %) · $ 26.497.734
--
-- No es plata perdida: está contada en la fila de otro código o en otro mes.
-- Es la medida de cuánto se mueve de lugar. Verificado que el importe NO está
-- inflado por grano: cero turnos aparecen dos veces, factor 1,00x en los tres
-- meses.
--
-- GRANO: UN TURNO ATENDIDO CON DISCREPANCIA
-- ------------------------------------------
-- El detalle es lo único accionable: sin paciente, fecha y los dos códigos,
-- Administración no puede ir a corregir nada en GECLISA. El agregado por mes y
-- causa se DERIVA de esta tabla; no se guarda aparte, para que no haya dos
-- lugares donde el mismo número pueda decir distinto.
--
-- `turno_id` es único: re-correr un mes actualiza, no duplica.
--
-- LAS FILAS NO SE BORRAN: SE MARCAN RESUELTAS
-- --------------------------------------------
-- Cuando Administración corrige el código en GECLISA, la discrepancia
-- desaparece del cálculo. Si la fila se borrara, se perdería justamente la
-- métrica que queremos: cuánto se corrigió. Así que el extractor marca
-- `resuelta_at` y la fila queda.
--
-- Y SÓLO toca los meses que procesó esa corrida: un mes que ya salió de la
-- ventana no se puede recalcular, así que sus filas no se pueden marcar
-- resueltas ni borrar. Quedan como el registro de lo que pasó.
--
-- SEGURIDAD
-- ----------
-- RLS habilitada con el permiso `informes`, el mismo que gatea Análisis ›
-- Por Prestación, que es el informe del que salió la pregunta. Nada para
-- `anon`: la anon key viaja en el bundle y es pública por diseño.
-- Escribe el daemon on-prem con la service key, que bypassa RLS.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.conciliacion_agenda (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Período del TURNO (no del movimiento): es el mes en que se atendió.
  mes text NOT NULL,

  -- Identidad del turno en GECLISA. Único: re-correr el mes actualiza.
  turno_id integer NOT NULL UNIQUE,

  fecha_turno date NOT NULL,
  paciente text,
  obra_social text,
  prestador text,

  -- Los dos códigos que no coinciden. `cod_facturado` queda vacío cuando no
  -- hay práctica cargada: no es un dato que falte, es la discrepancia misma.
  cod_agendado text,
  cod_facturado text,
  practica text,

  -- Fecha del movimiento, para la causa "cae en otro período".
  fecha_movimiento date,

  -- Importe de la ATENCIÓN (`MovEnca.Me_Cose` + `Me_ValorPrac`). Los de
  -- MovPrac están en cero en esta base: usarlos daría $0 en todo el informe.
  monto numeric(14,2) NOT NULL DEFAULT 0,

  causa text NOT NULL,

  -- Cuándo se detectó y cuándo se vio corregida.
  detectada_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  resuelta_at timestamptz,

  CONSTRAINT conciliacion_agenda_mes_check
    CHECK (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT conciliacion_agenda_causa_check
    CHECK (causa IN ('codigo_distinto', 'otro_mes', 'sin_practica', 'sin_atencion'))
);

-- El listado natural es por mes, y dentro del mes lo que más plata mueve.
CREATE INDEX IF NOT EXISTS ix_conciliacion_agenda_mes
  ON public.conciliacion_agenda (mes, monto DESC);

-- Para la métrica de cuánto se corrigió.
CREATE INDEX IF NOT EXISTS ix_conciliacion_agenda_pendientes
  ON public.conciliacion_agenda (mes) WHERE resuelta_at IS NULL;

COMMENT ON TABLE public.conciliacion_agenda IS
  'Turnos atendidos cuya facturación no coincide con lo agendado. Existe porque '
  'la tabla Turnos de GECLISA es una ventana móvil que se purga: sin este '
  'espejo, la conciliación de un mes deja de ser verificable cuando el mes sale '
  'de la ventana. El informe Por Prestación NO sub-registra; lo que difiere es '
  'la agenda, en ~1,5 % de los turnos atendidos.';

COMMENT ON COLUMN public.conciliacion_agenda.causa IS
  'codigo_distinto: el turno dice un código y el movimiento se cargó con otro '
  '(la práctica está contada, en la fila de otro código). otro_mes: la fecha '
  'del movimiento cae en otro período. sin_practica: hay atención pero ninguna '
  'MovPrac, así que la práctica no existe para ningún informe. sin_atencion: '
  'el turno no tiene MovEnca.';

COMMENT ON COLUMN public.conciliacion_agenda.resuelta_at IS
  'Cuándo se dejó de detectar la discrepancia, o sea cuándo se corrigió en '
  'GECLISA. La fila NO se borra: borrarla perdería la métrica de cuánto se '
  'corrigió. Sólo se marca en los meses que todavía están en la ventana y se '
  'pueden recalcular.';

ALTER TABLE public.conciliacion_agenda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_conciliacion_agenda ON public.conciliacion_agenda;
CREATE POLICY pol_conciliacion_agenda ON public.conciliacion_agenda
  FOR ALL TO authenticated
  USING (public.app_tiene_permiso('informes'))
  WITH CHECK (public.app_tiene_permiso('informes'));

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_rls boolean;
  v_pol integer;
  v_anon integer;
  v_uniq integer;
  v_filas integer;
BEGIN
  SELECT relrowsecurity INTO v_rls
    FROM pg_class WHERE oid = 'public.conciliacion_agenda'::regclass;
  IF NOT v_rls THEN
    RAISE EXCEPTION 'ABORTA: la tabla quedó SIN RLS, o sea pública con la anon key';
  END IF;

  SELECT count(*) INTO v_pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'conciliacion_agenda';
  IF v_pol <> 1 THEN
    RAISE EXCEPTION 'ABORTA: se esperaba 1 policy, hay %', v_pol;
  END IF;

  -- Nada para anon: la anon key del bundle es pública.
  SELECT count(*) INTO v_anon FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'conciliacion_agenda'
     AND ('anon' = ANY (roles) OR 'public' = ANY (roles));
  IF v_anon > 0 THEN
    RAISE EXCEPTION 'ABORTA: % policy(s) alcanzan al rol anónimo', v_anon;
  END IF;

  -- Sin el único por turno_id, re-correr un mes duplicaría cada discrepancia.
  SELECT count(*) INTO v_uniq FROM pg_constraint
   WHERE conrelid = 'public.conciliacion_agenda'::regclass AND contype = 'u';
  IF v_uniq < 1 THEN
    RAISE EXCEPTION 'ABORTA: falta el único por turno_id';
  END IF;

  SELECT count(*) INTO v_filas FROM public.conciliacion_agenda;
  RAISE NOTICE 'conciliacion_agenda lista (RLS con permiso informes). % fila(s).', v_filas;
END $$;
