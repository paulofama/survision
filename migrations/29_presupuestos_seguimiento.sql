-- ============================================================
-- MIGRACIÓN 29: Seguimiento telefónico de presupuestos (Fase 1)
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
-- Capa de SEGUIMIENTO (independiente del resultado comercial y de la regla de
-- "vencido = 45 días"). Cola de llamados, historial de intentos y encuesta.
--
-- Estado de contacto (eje nuevo, aparte de estado y resultado):
--   pendiente_contacto -> en_seguimiento -> contactado / contactado_whatsapp /
--   sin_respuesta.
--
-- La cola "a quién llamar hoy" se deriva al vuelo (entregado + 3 días hábiles
-- desde la entrega + no cerrado); las transiciones por tiempo (reintento +5
-- días, cierre automático) las aplica un job del daemon.
--
-- Teléfono: se agrega columna normalizada (549+10) para la cola/WhatsApp; el
-- backfill desde datos_completos.paciente.telefono lo hace un script aparte.
--
-- RLS: lectura con 'presupuestador' (para ver el badge/historial en Búsqueda);
-- escritura con el sub-permiso 'presupuestador:seguimiento'. Idempotente. Atómica.
-- ============================================================

BEGIN;

-- ── Teléfono normalizado en el presupuesto ──
ALTER TABLE public.presupuestos
  ADD COLUMN IF NOT EXISTS telefono text;
COMMENT ON COLUMN public.presupuestos.telefono IS 'Celular normalizado a 549+10 (WhatsApp/seguimiento). Se sincroniza con datos_completos.paciente.telefono.';

-- ── Estado de seguimiento por presupuesto (1:1) ──
CREATE TABLE IF NOT EXISTS public.presupuestos_seguimiento (
  presupuesto_id     uuid PRIMARY KEY REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  estado_contacto    text NOT NULL DEFAULT 'pendiente_contacto'
                       CHECK (estado_contacto IN ('pendiente_contacto','en_seguimiento','contactado','contactado_whatsapp','sin_respuesta')),
  ronda              integer NOT NULL DEFAULT 1,       -- 1 = primera ronda, 2 = reintento post-WhatsApp
  intentos_ronda     integer NOT NULL DEFAULT 0,        -- llamados sin atender en la ronda vigente (0-2)
  whatsapp_enviado_at timestamptz,                      -- cuándo se mandó WhatsApp en la ronda vigente
  rellamada_at       date,                              -- rellamada agendada (rama "no revisó")
  cerrado_at         timestamptz,                       -- cuándo salió de la cola (contactado / sin_respuesta)
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         text,
  updated_by         text
);

-- ── Historial de intentos / llamadas (N:1) ──
CREATE TABLE IF NOT EXISTS public.presupuestos_seguimiento_llamadas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id uuid NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  usuario        text,                                  -- username del operador
  canal          text NOT NULL CHECK (canal IN ('telefono','whatsapp')),
  resultado      text NOT NULL CHECK (resultado IN ('atendio','no_atendio','whatsapp_enviado')),
  numero         text,                                  -- para whatsapp
  texto          text,                                  -- mensaje enviado (whatsapp)
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Encuesta (una por llamada atendida) ──
CREATE TABLE IF NOT EXISTS public.presupuestos_seguimiento_encuesta (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id uuid NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  llamada_id     uuid REFERENCES public.presupuestos_seguimiento_llamadas(id) ON DELETE SET NULL,
  usuario        text,
  rama           text NOT NULL CHECK (rama IN ('reviso','no_reviso')),
  respuestas     jsonb NOT NULL DEFAULT '[]'::jsonb,    -- [{clave, valor(bool), nota}]
  observaciones  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Triggers updated_at (reusa la función de la migración 25) ──
DROP TRIGGER IF EXISTS trg_updated_at ON public.presupuestos_seguimiento;
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.presupuestos_seguimiento
  FOR EACH ROW EXECUTE FUNCTION public.tg_presupuestos_updated_at();

-- ── Índices ──
CREATE INDEX IF NOT EXISTS ix_seg_estado ON public.presupuestos_seguimiento (estado_contacto);
CREATE INDEX IF NOT EXISTS ix_seg_rellamada ON public.presupuestos_seguimiento (rellamada_at);
CREATE INDEX IF NOT EXISTS ix_seg_llamadas_presupuesto ON public.presupuestos_seguimiento_llamadas (presupuesto_id);
CREATE INDEX IF NOT EXISTS ix_seg_encuesta_presupuesto ON public.presupuestos_seguimiento_encuesta (presupuesto_id);

-- ── RLS: lectura presupuestador / escritura presupuestador:seguimiento ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['presupuestos_seguimiento','presupuestos_seguimiento_llamadas','presupuestos_seguimiento_encuesta']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%I_select ON public.%I', t, t);
    EXECUTE format('CREATE POLICY pol_%I_select ON public.%I FOR SELECT TO authenticated USING (public.app_tiene_permiso(''presupuestador''))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY pol_%I_write ON public.%I FOR ALL TO authenticated USING (public.app_tiene_permiso(''presupuestador:seguimiento'')) WITH CHECK (public.app_tiene_permiso(''presupuestador:seguimiento''))', t, t);
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.presupuestos_seguimiento') IS NULL
     OR to_regclass('public.presupuestos_seguimiento_llamadas') IS NULL
     OR to_regclass('public.presupuestos_seguimiento_encuesta') IS NULL THEN
    RAISE EXCEPTION 'FALLO 29: faltan tablas de seguimiento';
  END IF;
  RAISE NOTICE 'OK 29: seguimiento (3 tablas + telefono + RLS).';
END $$;

COMMIT;
