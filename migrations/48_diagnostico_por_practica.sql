-- ============================================================
-- Migración 48 — el diagnóstico del pedido de cirugía sale de la PRÁCTICA
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- EL PROBLEMA
-- -----------
-- El pedido de cirugía imprime tres cosas que hoy asumen que toda cirugía es
-- una catarata:
--
--   1. "Solicito: Cirugía de catarata con técnica de facoemulsificación
--      implante de lio plegable."   <- texto FIJO en el código
--   2. "Diagnóstico: ..."           <- sale de la config del CONVENIO, y en los
--                                      tres convenios dice "Catarata"
--   3. "LIO indicado: ..."          <- sólo tiene sentido en una catarata
--
-- O sea que un pterigión se pide con diagnóstico "Catarata" y solicitando una
-- facoemulsificación. No es hipotético: de 991 presupuestos quirúrgicos,
-- **92 son de pterigión** (el 2º más presupuestado) y 91 de Yag Láser.
--
-- Ya salió al menos uno: P-2026-733, de Ubilla Fabián (cirugía del 31/07), era
-- una Fotocoagulación Láser Diodo y su pedido decía "Catarata".
--
-- Lo detectó Administración el 23/09/2026: "en el pedido de cirugía tiene que ir
-- el diagnóstico correspondiente a la cirugía que estás solicitando, no puede ir
-- diagnóstico 'cirugía ocular'... tiene que decir catarata, pterigión,
-- chalazión". (Ojo: las RECETAS quedan como están, con el Dx unificado
-- "Cirugía ocular". Son dos documentos distintos y la regla es distinta.)
--
-- QUÉ SE SIEMBRA Y QUÉ NO
-- -----------------------
-- Sólo se cargan los diagnósticos que el NOMBRE de la práctica dice
-- literalmente: las facoemulsificaciones (catarata), el pterigión y el
-- chalazión. El resto queda SIN CARGAR a propósito.
--
-- Poner "Desprendimiento de retina" en una vitrectomía o elegir la indicación
-- de una inyección intravítrea (¿DMAE? ¿edema macular diabético? ¿oclusión
-- venosa?) es una decisión médica, no de sistema. Inventarla sería repetir el
-- problema que esta migración corrige, con la agravante de que parecería
-- correcta.
--
-- Mientras una práctica no tenga diagnóstico cargado, el pedido imprime el
-- renglón EN BLANCO para completar a mano. Un blanco se nota y se llena; un
-- diagnóstico equivocado se firma y se presenta.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.presupuestos_diagnosticos (
  codigo_practica text PRIMARY KEY,

  -- Diagnóstico tal como va impreso. Admite el marcador {ojo}, que se reemplaza
  -- por OD / OI / AO (mismo criterio que la config de convenio que reemplaza).
  diagnostico     text NOT NULL CHECK (length(btrim(diagnostico)) > 0),

  -- Qué se está solicitando. Reemplaza al texto fijo de facoemulsificación.
  solicitud       text NOT NULL CHECK (length(btrim(solicitud)) > 0),

  -- Si la práctica lleva lente intraocular. Cuando es false, el pedido NO
  -- imprime el renglón "LIO indicado": en un pterigión no significa nada.
  lleva_lio       boolean NOT NULL DEFAULT false,

  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.presupuestos_diagnosticos IS
  'Diagnóstico y texto de solicitud del pedido de cirugía, por código de '
  'práctica. Una práctica sin fila acá imprime el renglón en blanco para '
  'completar a mano: nunca se asume un diagnóstico.';

DROP TRIGGER IF EXISTS trg_updated_at ON public.presupuestos_diagnosticos;
CREATE TRIGGER trg_updated_at
  BEFORE UPDATE ON public.presupuestos_diagnosticos
  FOR EACH ROW EXECUTE FUNCTION public.tg_presupuestos_updated_at();

-- ------------------------------------------------------------
-- Siembra: SÓLO lo que el nombre de la práctica afirma
-- ------------------------------------------------------------
INSERT INTO public.presupuestos_diagnosticos (codigo_practica, diagnostico, solicitud, lleva_lio) VALUES
  -- Facoemulsificación = cirugía de catarata. El lente varía; el diagnóstico no.
  ('030501', 'Catarata {ojo}', 'Cirugía de catarata con técnica de facoemulsificación e implante de LIO plegable.', true),
  ('030502', 'Catarata {ojo}', 'Cirugía de catarata con técnica de facoemulsificación e implante de LIO plegable.', true),
  ('030503', 'Catarata {ojo}', 'Cirugía de catarata con técnica de facoemulsificación e implante de LIO plegable.', true),
  ('030504', 'Catarata {ojo}', 'Cirugía de catarata con técnica de facoemulsificación e implante de LIO plegable.', true),
  ('030505', 'Catarata {ojo}', 'Cirugía de catarata con técnica de facoemulsificación e implante de LIO plegable.', true),
  ('030511', 'Catarata {ojo}', 'Cirugía de catarata con técnica de facoemulsificación e implante de lente rígido.', true),
  ('030514', 'Catarata {ojo}', 'Cirugía de catarata con técnica de facoemulsificación e implante de LIO plegable.', true),

  -- Pterigión: el nombre de la práctica ES el diagnóstico.
  ('030408', 'Pterigión {ojo}', 'Cirugía de pterigión sin injerto de limbo.', false),
  ('030409', 'Pterigión {ojo}', 'Cirugía de pterigión con injerto de limbo.', false),

  -- Chalazión: ídem.
  ('030302', 'Chalazión {ojo}', 'Cirugía de chalazión.', false)
ON CONFLICT (codigo_practica) DO NOTHING;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
-- La anon key viaja en el bundle: una tabla sin RLS es de lectura y escritura
-- pública. Mismo patrón que el resto del módulo.
ALTER TABLE public.presupuestos_diagnosticos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_diagnosticos_all ON public.presupuestos_diagnosticos;
CREATE POLICY pol_diagnosticos_all
  ON public.presupuestos_diagnosticos
  FOR ALL
  TO authenticated
  USING      (public.app_tiene_permiso('presupuestador'))
  WITH CHECK (public.app_tiene_permiso('presupuestador'));

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_filas int;
  v_rls   boolean;
  v_anon  int;
BEGIN
  SELECT count(*) INTO v_filas FROM public.presupuestos_diagnosticos;
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.presupuestos_diagnosticos'::regclass;
  SELECT count(*) INTO v_anon FROM pg_policies
   WHERE tablename = 'presupuestos_diagnosticos' AND ('anon' = ANY(roles) OR 'public' = ANY(roles));

  IF v_filas < 10 THEN RAISE EXCEPTION 'ABORTA: la siembra cargó % filas', v_filas; END IF;
  IF NOT v_rls THEN RAISE EXCEPTION 'ABORTA: quedó sin RLS'; END IF;
  IF v_anon > 0 THEN RAISE EXCEPTION 'ABORTA: % policy(s) alcanzan a anon', v_anon; END IF;

  RAISE NOTICE 'diagnósticos sembrados: % · RLS activa · 0 policies para anon', v_filas;
  RAISE NOTICE 'El resto de las prácticas imprime el diagnóstico EN BLANCO hasta que se cargue.';
END $$;
