-- ============================================================
-- Migración 60 — Diagnósticos con varias opciones por práctica
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- EL PROBLEMA
-- -----------
-- `presupuestos_diagnosticos` tiene `codigo_practica` como clave primaria:
-- una práctica, un diagnóstico. Eso alcanza para un pterigión o una
-- trabeculectomía, donde el procedimiento dice la indicación.
--
-- No alcanza para la inyección intravítrea, que son 197 presupuestos —el 44%
-- de todo lo que falta— y se hace por tres cosas distintas: DMAE húmeda,
-- edema macular diabético u oclusión venosa de retina. Cuál va en el pedido
-- lo sabe el médico para ESE paciente, no la práctica.
--
-- Hasta hoy esas 197 imprimen el renglón en blanco. No está mal —es la regla
-- de la migración 48: antes de asumir un diagnóstico, dejarlo vacío— pero se
-- completa a mano 197 veces.
--
-- LA SOLUCIÓN, Y POR QUÉ NO SE CAMBIÓ LA TABLA QUE YA ESTÁ
-- ---------------------------------------------------------
-- Una tabla hija con las opciones, en vez de romper la clave primaria de
-- `presupuestos_diagnosticos`. Las prácticas de una sola indicación siguen
-- funcionando exactamente igual, sin tocar una línea de su camino: la que
-- tiene opciones simplemente aparece acá además.
--
-- La elección se guarda en `presupuestos_aceptacion`, que es donde ya se
-- eligen el ojo, el convenio y el LIO: es el mismo momento y la misma
-- persona.
--
-- LO QUE PASA SI NADIE ELIGE
-- ---------------------------
-- El renglón sale EN BLANCO, igual que hoy. No se cae a la primera opción ni
-- a la más frecuente: elegir por el médico es exactamente el error que la
-- 48 vino a evitar cuando un pterigión salía pedido como catarata.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Las opciones
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.presupuestos_diagnostico_opciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_practica text NOT NULL,

  -- Mismas reglas que `presupuestos_diagnosticos`: admite el marcador {ojo},
  -- que se reemplaza por OD / OI / AO al imprimir.
  diagnostico     text NOT NULL CHECK (length(btrim(diagnostico)) > 0),
  solicitud       text NOT NULL CHECK (length(btrim(solicitud)) > 0),
  lleva_lio       boolean NOT NULL DEFAULT false,

  -- En qué orden se ofrecen. El más frecuente primero ahorra clics, pero
  -- NINGUNO viene preseleccionado.
  orden           smallint NOT NULL DEFAULT 0,
  activo          boolean NOT NULL DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text,
  nota_interna    text,

  CONSTRAINT ux_diagnostico_opcion UNIQUE (codigo_practica, diagnostico)
);

COMMENT ON TABLE public.presupuestos_diagnostico_opciones IS
  'Diagnósticos posibles de una práctica que se hace por varias indicaciones. '
  'La práctica de una sola indicación NO va acá: va en '
  '`presupuestos_diagnosticos`, que sigue siendo una fila por código.';

CREATE INDEX IF NOT EXISTS ix_diagnostico_opciones_practica
  ON public.presupuestos_diagnostico_opciones (codigo_practica) WHERE activo;

-- ------------------------------------------------------------
-- 2. Cuál se eligió, en la aceptación
-- ------------------------------------------------------------
ALTER TABLE public.presupuestos_aceptacion
  ADD COLUMN IF NOT EXISTS diagnostico_opcion_id uuid
    REFERENCES public.presupuestos_diagnostico_opciones(id);

COMMENT ON COLUMN public.presupuestos_aceptacion.diagnostico_opcion_id IS
  'Cuál de los diagnósticos posibles eligió quien aceptó el presupuesto. '
  'NULL cuando la práctica tiene una sola indicación (sale de '
  '`presupuestos_diagnosticos`) o cuando nadie eligió: en ese caso el pedido '
  'imprime el renglón en blanco, que es lo que hacía antes.';

-- ------------------------------------------------------------
-- 3. Las tres de la inyección intravítrea
-- ------------------------------------------------------------
-- Las dio la Dirección el 27/09/2026. Entran ACTIVAS porque no son una
-- propuesta a revisar: son las tres indicaciones, dichas por quien las
-- indica. Lo que sigue sin decidirse por defecto es cuál corresponde a cada
-- paciente, y eso se elige al aceptar.
INSERT INTO public.presupuestos_diagnostico_opciones
  (codigo_practica, diagnostico, solicitud, lleva_lio, orden, created_by)
SELECT p.codigo, o.diagnostico, o.solicitud, false, o.orden, 'migracion_60'
  FROM (VALUES
    ('030601'),  -- Inyección intravítrea de antiangiogénicos       189 presup.
    ('030602'),  -- Inyección intravítrea de antiangiogénico (Eylia)  2
    ('030609'),  -- Inyección intravítrea sin fármaco (Eylia)         4
    ('030610')   -- Inyección intravítrea no incluye fármaco          2
  ) AS p(codigo)
  CROSS JOIN (VALUES
    ('Degeneración macular asociada a la edad, forma húmeda {ojo}',
     'Inyección intravítrea de antiangiogénico.', 1::smallint),
    ('Edema macular diabético {ojo}',
     'Inyección intravítrea de antiangiogénico.', 2::smallint),
    ('Oclusión venosa de retina {ojo}',
     'Inyección intravítrea de antiangiogénico.', 3::smallint)
  ) AS o(diagnostico, solicitud, orden)
ON CONFLICT (codigo_practica, diagnostico) DO NOTHING;

-- ------------------------------------------------------------
-- 4. RLS — mismo criterio que `presupuestos_diagnosticos`
-- ------------------------------------------------------------
ALTER TABLE public.presupuestos_diagnostico_opciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_dx_opciones_select ON public.presupuestos_diagnostico_opciones;
CREATE POLICY pol_dx_opciones_select ON public.presupuestos_diagnostico_opciones
  FOR SELECT TO authenticated
  USING (public.app_tiene_permiso('presupuestador'));

-- Editarlas es configurar el catálogo: mismo permiso que el resto de la
-- configuración del circuito.
DROP POLICY IF EXISTS pol_dx_opciones_write ON public.presupuestos_diagnostico_opciones;
CREATE POLICY pol_dx_opciones_write ON public.presupuestos_diagnostico_opciones
  FOR ALL TO authenticated
  USING (public.app_tiene_permiso('presupuestador:config'))
  WITH CHECK (public.app_tiene_permiso('presupuestador:config'));

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_opciones integer;
  v_practicas integer;
  v_anon integer;
  v_choque integer;
BEGIN
  SELECT count(*), count(DISTINCT codigo_practica) INTO v_opciones, v_practicas
    FROM public.presupuestos_diagnostico_opciones WHERE activo;
  IF v_opciones <> 12 OR v_practicas <> 4 THEN
    RAISE EXCEPTION 'ABORTA: se esperaban 12 opciones en 4 prácticas, hay % en %', v_opciones, v_practicas;
  END IF;

  -- Una práctica NO puede estar en los dos lados: si tuviera fila propia Y
  -- opciones, el pedido no sabría cuál imprimir y elegiría en silencio.
  SELECT count(*) INTO v_choque
    FROM public.presupuestos_diagnostico_opciones o
    JOIN public.presupuestos_diagnosticos d ON d.codigo_practica = o.codigo_practica
   WHERE o.activo AND d.activo;
  IF v_choque > 0 THEN
    RAISE EXCEPTION 'ABORTA: % práctica(s) tienen diagnóstico único Y opciones a la vez', v_choque;
  END IF;

  SELECT count(*) INTO v_anon FROM pg_policies
   WHERE tablename = 'presupuestos_diagnostico_opciones' AND 'anon' = ANY(roles);
  IF v_anon > 0 THEN
    RAISE EXCEPTION 'ABORTA: la tabla de opciones quedó alcanzable por anon';
  END IF;

  RAISE NOTICE 'Opciones de diagnóstico: % en % prácticas. Nadie elige por defecto.', v_opciones, v_practicas;
END $$;
