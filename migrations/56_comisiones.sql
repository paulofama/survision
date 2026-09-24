-- ============================================================
-- Migración 56 — Comisiones sobre presupuestos (Fase 2, paso 1)
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- Remunera con un porcentaje a quien entrega un presupuesto que después se
-- opera, a los terceros que participaron, y a quien recupera un presupuesto
-- que ya se había enfriado.
--
-- LAS REGLAS, tal como las fijó la Dirección el 24/09/2026:
--
--   base     = subtotalOriginal − descuento + insumos   (SIN descontar la OS)
--   pool     = base × tasa_comision
--   devengo  = cuando la práctica se REALIZA (estado 'practicado')
--   alcance  = todas las coberturas
--
--   si hay N participantes:  parte_participantes = pool × participantes_pct
--                            parte_entregador    = pool − parte_participantes
--   si no:                   parte_entregador    = pool
--
--   si hubo recupero:        parte_recuperador = parte_entregador × recuperador_pct
--                            parte_entregador  = parte_entregador − parte_recuperador
--
-- El recuperador saca SÓLO de la parte del entregador: el participante nunca
-- cede. Es decisión expresa de la Dirección, con su consecuencia asumida
-- (participar rinde más que entregar).
--
-- POR QUÉ ESTA TABLA ES APPEND-ONLY
-- ---------------------------------
-- Una comisión mal liquidada no es un bug de pantalla: es plata mal pagada a
-- una persona, con un reclamo laboral atrás. Un movimiento emitido no se
-- edita ni se borra NUNCA: todo se corrige con un asiento en contrario, con
-- su motivo y su usuario. Es la única forma de que la liquidación se pueda
-- defender seis meses después.
--
-- EL RÉGIMEN NACE INERTE. Nadie es comisionable hasta que se lo marque, y sin
-- una tasa vigente cargada no se devenga nada. Es deliberado: que aplicar la
-- migración no empiece a acumular deuda con nadie.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Quién entregó, y quiénes pueden cobrar
-- ------------------------------------------------------------
ALTER TABLE public.presupuestos
  ADD COLUMN IF NOT EXISTS entregado_por text;

COMMENT ON COLUMN public.presupuestos.entregado_por IS
  'Quién entregó y asesoró el presupuesto. NO es `administrativa`, que es '
  'quien lo tipeó: a veces coinciden y a veces no, y de esa diferencia '
  'depende quién cobra la comisión.';

ALTER TABLE public.usuarios_sistema
  ADD COLUMN IF NOT EXISTS es_comisionable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.usuarios_sistema.es_comisionable IS
  'Si puede figurar como entregador, participante o recuperador. Arranca en '
  'false para TODOS: el régimen no alcanza a nadie hasta que la Dirección lo '
  'marque una persona a la vez.';

-- ------------------------------------------------------------
-- 2. Los participantes — varios por presupuesto
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.presupuestos_participantes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id uuid NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  usuario        text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     text,
  CONSTRAINT ux_participante UNIQUE (presupuesto_id, usuario)
);

COMMENT ON TABLE public.presupuestos_participantes IS
  'Terceros que participaron en la venta, además de quien entregó. Se cargan '
  'AL CREAR el presupuesto y quedan congelados (decisión de la Dirección): '
  'la app no puede modificarlos después. Un olvido no se corrige desde la '
  'pantalla; hace falta un acto administrativo explícito con la service key.';

CREATE INDEX IF NOT EXISTS ix_participantes_presupuesto
  ON public.presupuestos_participantes (presupuesto_id);

-- ------------------------------------------------------------
-- 3. Parámetros con vigencia
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comisiones_parametros (
  clave          text NOT NULL,
  valor          numeric NOT NULL,
  vigencia_desde date NOT NULL,
  notas          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     text,
  PRIMARY KEY (clave, vigencia_desde)
);

COMMENT ON TABLE public.comisiones_parametros IS
  'Tasa y porcentajes de reparto, con vigencia. Cambiar un valor AGREGA una '
  'fila, no edita la anterior, y cada movimiento guarda el valor que aplicó: '
  'recalcular el pasado es imposible por diseño. Claves: tasa_comision, '
  'participantes_pct, recuperador_pct, dias_para_frio, ventana_recupero_dias, '
  'fecha_vigencia_regimen.';

-- Los dos plazos SÍ se siembran, porque no son plata: son la definición de
-- "frío" y de la ventana, y ya estaban decididos.
INSERT INTO public.comisiones_parametros (clave, valor, vigencia_desde, notas, created_by) VALUES
  ('dias_para_frio',        45, '2000-01-01', 'Días desde la entrega tras los cuales el presupuesto se considera perdido. Coincide con `plazo_sin_respuesta_dias`.', 'migracion_56'),
  ('ventana_recupero_dias', 60, '2000-01-01', 'Días desde el contacto efectivo dentro de los cuales la práctica tiene que realizarse para que haya recupero.', 'migracion_56')
ON CONFLICT (clave, vigencia_desde) DO NOTHING;

-- tasa_comision, participantes_pct, recuperador_pct y fecha_vigencia_regimen
-- NO se siembran a propósito: sin tasa vigente el job no devenga nada.

-- ------------------------------------------------------------
-- 4. El libro de movimientos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comisiones_movimientos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id    uuid NOT NULL REFERENCES public.presupuestos(id),
  beneficiario      text NOT NULL,
  rol               text NOT NULL CHECK (rol IN ('ENTREGADOR','PARTICIPANTE','RECUPERADOR')),
  tipo              text NOT NULL CHECK (tipo IN ('DEVENGO','REVERSO','AJUSTE')),

  -- Qué hecho lo disparó. 'practica:<atencion_id>' para un devengo,
  -- 'recupero:<llamada_id>' para el ajuste, 'anulacion:<uuid>' para un reverso.
  evento_origen     text NOT NULL,
  -- Por qué el sistema atribuyó esto. En un recupero: qué llamada, qué día,
  -- qué usuario. Sin esto el régimen no se puede explicar y deja de ser
  -- defendible frente a un reclamo.
  evidencia         jsonb,

  base_comisionable numeric NOT NULL,
  tasa_aplicada     numeric NOT NULL,
  pct_reparto       numeric NOT NULL,
  importe           numeric NOT NULL,
  fecha_devengo     date NOT NULL,
  motivo            text,
  liquidacion_id    uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        text,

  -- Idempotencia: correr el job dos veces no duplica un devengo.
  CONSTRAINT ux_movimiento UNIQUE (presupuesto_id, beneficiario, rol, tipo, evento_origen)
);

COMMENT ON TABLE public.comisiones_movimientos IS
  'Libro APPEND-ONLY de comisiones. Un movimiento emitido no se edita ni se '
  'borra: se corrige con un asiento en contrario. Lo único que cambia después '
  'de emitido es `liquidacion_id`, cuando entra en una liquidación.';

CREATE INDEX IF NOT EXISTS ix_mov_beneficiario ON public.comisiones_movimientos (beneficiario, fecha_devengo);
CREATE INDEX IF NOT EXISTS ix_mov_presupuesto  ON public.comisiones_movimientos (presupuesto_id);
CREATE INDEX IF NOT EXISTS ix_mov_sin_liquidar ON public.comisiones_movimientos (beneficiario) WHERE liquidacion_id IS NULL;

-- ------------------------------------------------------------
-- 5. Las liquidaciones
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comisiones_liquidaciones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiario text NOT NULL,
  anio         integer NOT NULL,
  mes          integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  estado       text NOT NULL DEFAULT 'DEVENGADA'
                 CHECK (estado IN ('DEVENGADA','APROBADA','PAGADA')),
  total        numeric NOT NULL DEFAULT 0,
  aprobada_at  timestamptz, aprobada_por text,
  pagada_at    timestamptz, pagada_por   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   text,
  CONSTRAINT ux_liquidacion UNIQUE (beneficiario, anio, mes)
);

COMMENT ON TABLE public.comisiones_liquidaciones IS
  'Liquidación mensual por persona. Una APROBADA no admite movimientos '
  'nuevos: los que lleguen tarde caen en el período siguiente y quedan '
  'señalados.';

DO $$ BEGIN
  ALTER TABLE public.comisiones_movimientos
    ADD CONSTRAINT fk_mov_liquidacion
    FOREIGN KEY (liquidacion_id) REFERENCES public.comisiones_liquidaciones(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 6. El candado del append-only
-- ------------------------------------------------------------
-- No alcanza con la convención ni con la RLS: la service key del backend
-- bypassa RLS, así que un script con un bug podría pisar un importe. El
-- trigger lo hace imposible para todos.
CREATE OR REPLACE FUNCTION public.tg_comisiones_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un movimiento de comisión no se borra: corregilo con un asiento en contrario (REVERSO o AJUSTE)';
  END IF;

  IF NEW.importe           IS DISTINCT FROM OLD.importe
  OR NEW.base_comisionable IS DISTINCT FROM OLD.base_comisionable
  OR NEW.tasa_aplicada     IS DISTINCT FROM OLD.tasa_aplicada
  OR NEW.pct_reparto       IS DISTINCT FROM OLD.pct_reparto
  OR NEW.beneficiario      IS DISTINCT FROM OLD.beneficiario
  OR NEW.rol               IS DISTINCT FROM OLD.rol
  OR NEW.tipo              IS DISTINCT FROM OLD.tipo
  OR NEW.presupuesto_id    IS DISTINCT FROM OLD.presupuesto_id
  OR NEW.evento_origen     IS DISTINCT FROM OLD.evento_origen
  OR NEW.fecha_devengo     IS DISTINCT FROM OLD.fecha_devengo THEN
    RAISE EXCEPTION 'Un movimiento emitido no se edita. Lo único que puede cambiar es liquidacion_id.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_comisiones_append_only ON public.comisiones_movimientos;
CREATE TRIGGER trg_comisiones_append_only
  BEFORE UPDATE OR DELETE ON public.comisiones_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.tg_comisiones_append_only();

-- ------------------------------------------------------------
-- 7. Quién soy — hace falta para que nadie vea lo del otro
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_username()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT username FROM public.usuarios_sistema WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

COMMENT ON FUNCTION public.app_username() IS
  'El username del usuario logueado. SECURITY DEFINER porque la RLS de '
  'usuarios_sistema no dejaría leerlo desde una policy.';

REVOKE ALL ON FUNCTION public.app_username() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.app_username() TO authenticated;

-- ------------------------------------------------------------
-- 8. RLS — nadie ve lo que cobra otro
-- ------------------------------------------------------------
ALTER TABLE public.comisiones_movimientos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comisiones_liquidaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comisiones_parametros    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presupuestos_participantes ENABLE ROW LEVEL SECURITY;

-- Movimientos y liquidaciones: lo propio, o todo si sos admin.
DROP POLICY IF EXISTS pol_com_mov_select ON public.comisiones_movimientos;
CREATE POLICY pol_com_mov_select ON public.comisiones_movimientos
  FOR SELECT TO authenticated
  USING (beneficiario = public.app_username() OR public.app_es_admin());

DROP POLICY IF EXISTS pol_com_liq_select ON public.comisiones_liquidaciones;
CREATE POLICY pol_com_liq_select ON public.comisiones_liquidaciones
  FOR SELECT TO authenticated
  USING (beneficiario = public.app_username() OR public.app_es_admin());

-- NINGUNA policy de escritura sobre movimientos ni liquidaciones: los emite
-- el daemon con la service key, que bypassa RLS. Así la UI no puede inventar
-- un movimiento aunque alguien manipule la API con su propio token.

-- Parámetros: los lee cualquiera que use el módulo, los escribe sólo Dirección.
DROP POLICY IF EXISTS pol_com_par_select ON public.comisiones_parametros;
CREATE POLICY pol_com_par_select ON public.comisiones_parametros
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pol_com_par_write ON public.comisiones_parametros;
CREATE POLICY pol_com_par_write ON public.comisiones_parametros
  FOR ALL TO authenticated
  USING (public.app_es_admin()) WITH CHECK (public.app_es_admin());

-- Participantes: se ven y se crean con el permiso del presupuestador.
-- NO hay policy de UPDATE ni de DELETE: quedan congelados al crear, que es lo
-- que decidió la Dirección.
DROP POLICY IF EXISTS pol_participantes_select ON public.presupuestos_participantes;
CREATE POLICY pol_participantes_select ON public.presupuestos_participantes
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('presupuestador'));
DROP POLICY IF EXISTS pol_participantes_insert ON public.presupuestos_participantes;
CREATE POLICY pol_participantes_insert ON public.presupuestos_participantes
  FOR INSERT TO authenticated WITH CHECK (public.app_tiene_permiso('presupuestador'));

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_tablas int; v_trigger int; v_anon int; v_comisionables int; v_tasa int; v_plazos int;
BEGIN
  SELECT count(*) INTO v_tablas FROM information_schema.tables
   WHERE table_schema='public' AND table_name IN
     ('presupuestos_participantes','comisiones_parametros','comisiones_movimientos','comisiones_liquidaciones');
  IF v_tablas <> 4 THEN RAISE EXCEPTION 'ABORTA: se crearon % de 4 tablas', v_tablas; END IF;

  SELECT count(*) INTO v_trigger FROM pg_trigger
   WHERE tgrelid='public.comisiones_movimientos'::regclass AND tgname='trg_comisiones_append_only';
  IF v_trigger <> 1 THEN RAISE EXCEPTION 'ABORTA: sin el candado append-only, un script con un bug puede pisar un importe'; END IF;

  SELECT count(*) INTO v_anon FROM pg_policies
   WHERE tablename IN ('comisiones_movimientos','comisiones_liquidaciones','comisiones_parametros','presupuestos_participantes')
     AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  IF v_anon > 0 THEN RAISE EXCEPTION 'ABORTA: % policy(s) de comisiones alcanzan a anon', v_anon; END IF;

  -- El régimen tiene que nacer inerte.
  SELECT count(*) INTO v_comisionables FROM public.usuarios_sistema WHERE es_comisionable;
  IF v_comisionables <> 0 THEN RAISE EXCEPTION 'ABORTA: % usuarios quedaron comisionables sin que nadie los marcara', v_comisionables; END IF;

  SELECT count(*) INTO v_tasa FROM public.comisiones_parametros WHERE clave='tasa_comision';
  IF v_tasa <> 0 THEN RAISE EXCEPTION 'ABORTA: quedó una tasa sembrada; el régimen devengaría sin que nadie la haya fijado'; END IF;

  SELECT count(*) INTO v_plazos FROM public.comisiones_parametros WHERE clave IN ('dias_para_frio','ventana_recupero_dias');
  IF v_plazos <> 2 THEN RAISE EXCEPTION 'ABORTA: faltan los plazos de frío y de ventana'; END IF;

  RAISE NOTICE 'Comisiones: 4 tablas, candado append-only activo, 0 policies para anon.';
  RAISE NOTICE 'EL RÉGIMEN NACE INERTE: 0 comisionables y sin tasa. No devenga nada hasta que la Dirección lo habilite.';
END $$;
