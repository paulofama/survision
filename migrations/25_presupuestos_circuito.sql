-- ============================================================
-- MIGRACIÓN 25: Circuito post-aceptación del Presupuestador (Fase 1)
-- Sistema de Gestión Integral - Survisión S.A.
-- ============================================================
-- Fundamentos de datos para: resultado comercial del presupuesto
-- (ACEPTADO/RECHAZADO/SIN_RESPUESTA), rama de circuito al aceptar, checklist
-- de seguimiento hasta "LISTO PARA CIRUGÍA", y catálogos configurables
-- (motivos de rechazo, LIOs, convenios, texto de consentimiento versionable,
-- parámetros).
--
-- DECISIONES CERRADAS con P. Famá:
--   - El resultado comercial va en COLUMNAS NUEVAS de `presupuestos` (NO pisa el
--     `estado` operativo existente: borrador/entregado/practicado/cancelado).
--   - EMITIDO = derivado: estado NOT IN ('borrador','cancelado') AND resultado IS NULL.
--   - Circuito de aceptación y checklist en tablas 1:N / 1:1 aparte.
--   - Catálogos: SELECT con permiso 'presupuestador'; edición con 'presupuestador:config'.
--
-- Idempotente (IF NOT EXISTS / ON CONFLICT / DROP POLICY IF EXISTS). Atómica.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Función de updated_at (convención del proyecto: lo maneja un trigger,
-- el frontend nunca lo envía).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_presupuestos_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- A. CATÁLOGOS CONFIGURABLES
-- ============================================================

-- A1. Motivos de resultado (rechazo / aceptación)
CREATE TABLE IF NOT EXISTS public.presupuestos_motivos_resultado (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo              text NOT NULL CHECK (tipo IN ('ACEPTADO','RECHAZADO')),
  nombre            text NOT NULL,
  exige_observacion boolean NOT NULL DEFAULT false,
  activo            boolean NOT NULL DEFAULT true,
  orden             integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_motivos_tipo_nombre UNIQUE (tipo, nombre)
);

-- A2. Catálogo de LIOs
CREATE TABLE IF NOT EXISTS public.presupuestos_lios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  descripcion text,
  activo      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_lios_nombre UNIQUE (nombre)
);

-- A3. Convenios (plantillas del pedido de cirugía)
CREATE TABLE IF NOT EXISTS public.presupuestos_convenios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          text NOT NULL,
  sub_rama        text NOT NULL CHECK (sub_rama IN ('circulo_medico','directa','particular')),
  codigo_practica text,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- campos variables: cuenta, cupo, leyendas, diag
  activo          boolean NOT NULL DEFAULT true,
  orden           integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_convenios_nombre UNIQUE (nombre)
);

-- A4. Textos legales versionables (consentimiento informado, etc.)
CREATE TABLE IF NOT EXISTS public.presupuestos_textos_legales (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave      text NOT NULL,
  version    integer NOT NULL DEFAULT 1,
  contenido  jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{titulo, cuerpo}]
  vigente    boolean NOT NULL DEFAULT false,
  notas      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  CONSTRAINT ux_textos_clave_version UNIQUE (clave, version)
);
-- Una sola versión vigente por clave.
CREATE UNIQUE INDEX IF NOT EXISTS ux_textos_legales_vigente
  ON public.presupuestos_textos_legales (clave) WHERE vigente;

-- A5. Parámetros de configuración del circuito
CREATE TABLE IF NOT EXISTS public.presupuestos_config (
  clave      text PRIMARY KEY,
  valor      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- B. RESULTADO COMERCIAL en `presupuestos` (columnas nuevas)
-- ============================================================
ALTER TABLE public.presupuestos
  ADD COLUMN IF NOT EXISTS resultado               text,
  ADD COLUMN IF NOT EXISTS resultado_motivo_id     uuid,
  ADD COLUMN IF NOT EXISTS resultado_observaciones text,
  ADD COLUMN IF NOT EXISTS fecha_resultado         timestamptz,
  ADD COLUMN IF NOT EXISTS resultado_por           text;

-- CHECK del resultado (NULL = EMITIDO/pendiente).
ALTER TABLE public.presupuestos DROP CONSTRAINT IF EXISTS chk_presupuestos_resultado;
ALTER TABLE public.presupuestos ADD CONSTRAINT chk_presupuestos_resultado
  CHECK (resultado IS NULL OR resultado IN ('ACEPTADO','RECHAZADO','SIN_RESPUESTA'));

-- FK del motivo (ON DELETE SET NULL: borrar un motivo no borra el presupuesto).
ALTER TABLE public.presupuestos DROP CONSTRAINT IF EXISTS fk_presupuestos_resultado_motivo;
ALTER TABLE public.presupuestos ADD CONSTRAINT fk_presupuestos_resultado_motivo
  FOREIGN KEY (resultado_motivo_id)
  REFERENCES public.presupuestos_motivos_resultado(id) ON DELETE SET NULL;

-- ============================================================
-- C. CIRCUITO DE ACEPTACIÓN + CHECKLIST
-- ============================================================

-- C1. Rama del circuito (1:1 con presupuesto, solo cuando ACEPTADO)
CREATE TABLE IF NOT EXISTS public.presupuestos_aceptacion (
  presupuesto_id         uuid PRIMARY KEY REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  rama_cobertura         text NOT NULL CHECK (rama_cobertura IN ('PARTICULAR','OBRA_SOCIAL')),
  sub_rama               text CHECK (sub_rama IN ('circulo_medico','directa')),  -- null si Particular
  convenio_id            uuid REFERENCES public.presupuestos_convenios(id) ON DELETE SET NULL,
  fecha_tentativa_cirugia date,
  ojo                    text CHECK (ojo IN ('OD','OI','AMBOS')),
  lio_id                 uuid REFERENCES public.presupuestos_lios(id) ON DELETE SET NULL,
  requiere_analisis_ecg  boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             text
);

-- C2. Checklist de seguimiento (filas por trámite; estado persistido)
CREATE TABLE IF NOT EXISTS public.presupuestos_checklist (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id   uuid NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  item_clave       text NOT NULL,   -- autorizacion_os | orden_autorizada | consentimiento_firmado
                                     -- | analisis_ecg | deposito_garantia | lio_definido | fecha_cirugia_confirmada
  completado       boolean NOT NULL DEFAULT false,
  no_aplica        boolean NOT NULL DEFAULT false,
  fecha_completado timestamptz,
  completado_por   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_checklist_presupuesto_item UNIQUE (presupuesto_id, item_clave)
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS ix_presupuestos_resultado
  ON public.presupuestos (resultado);
CREATE INDEX IF NOT EXISTS ix_presupuestos_estado_resultado_fecha
  ON public.presupuestos (estado, resultado, fecha_creacion);
CREATE INDEX IF NOT EXISTS ix_pres_checklist_presupuesto
  ON public.presupuestos_checklist (presupuesto_id);

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================
DROP TRIGGER IF EXISTS trg_updated_at ON public.presupuestos_motivos_resultado;
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.presupuestos_motivos_resultado
  FOR EACH ROW EXECUTE FUNCTION public.tg_presupuestos_updated_at();
DROP TRIGGER IF EXISTS trg_updated_at ON public.presupuestos_lios;
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.presupuestos_lios
  FOR EACH ROW EXECUTE FUNCTION public.tg_presupuestos_updated_at();
DROP TRIGGER IF EXISTS trg_updated_at ON public.presupuestos_convenios;
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.presupuestos_convenios
  FOR EACH ROW EXECUTE FUNCTION public.tg_presupuestos_updated_at();
DROP TRIGGER IF EXISTS trg_updated_at ON public.presupuestos_config;
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.presupuestos_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_presupuestos_updated_at();
DROP TRIGGER IF EXISTS trg_updated_at ON public.presupuestos_aceptacion;
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.presupuestos_aceptacion
  FOR EACH ROW EXECUTE FUNCTION public.tg_presupuestos_updated_at();
DROP TRIGGER IF EXISTS trg_updated_at ON public.presupuestos_checklist;
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.presupuestos_checklist
  FOR EACH ROW EXECUTE FUNCTION public.tg_presupuestos_updated_at();

-- ============================================================
-- D. RLS
-- ============================================================
-- Catálogos: SELECT para 'presupuestador'; escritura para 'presupuestador:config'
-- (admins pasan por app_tiene_permiso). Patrón de 2 policies (permisivas):
--   pol_*_select  -> SELECT con presupuestador
--   pol_*_write   -> ALL con presupuestador:config (INSERT/UPDATE/DELETE)

-- helper inline por tabla (no se puede loop en SQL plano; se escribe explícito)

-- A1 motivos
ALTER TABLE public.presupuestos_motivos_resultado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_motivos_select ON public.presupuestos_motivos_resultado;
CREATE POLICY pol_motivos_select ON public.presupuestos_motivos_resultado
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('presupuestador'));
DROP POLICY IF EXISTS pol_motivos_write ON public.presupuestos_motivos_resultado;
CREATE POLICY pol_motivos_write ON public.presupuestos_motivos_resultado
  FOR ALL TO authenticated
  USING (public.app_tiene_permiso('presupuestador:config'))
  WITH CHECK (public.app_tiene_permiso('presupuestador:config'));

-- A2 lios
ALTER TABLE public.presupuestos_lios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_lios_select ON public.presupuestos_lios;
CREATE POLICY pol_lios_select ON public.presupuestos_lios
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('presupuestador'));
DROP POLICY IF EXISTS pol_lios_write ON public.presupuestos_lios;
CREATE POLICY pol_lios_write ON public.presupuestos_lios
  FOR ALL TO authenticated
  USING (public.app_tiene_permiso('presupuestador:config'))
  WITH CHECK (public.app_tiene_permiso('presupuestador:config'));

-- A3 convenios
ALTER TABLE public.presupuestos_convenios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_convenios_select ON public.presupuestos_convenios;
CREATE POLICY pol_convenios_select ON public.presupuestos_convenios
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('presupuestador'));
DROP POLICY IF EXISTS pol_convenios_write ON public.presupuestos_convenios;
CREATE POLICY pol_convenios_write ON public.presupuestos_convenios
  FOR ALL TO authenticated
  USING (public.app_tiene_permiso('presupuestador:config'))
  WITH CHECK (public.app_tiene_permiso('presupuestador:config'));

-- A4 textos legales
ALTER TABLE public.presupuestos_textos_legales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_textos_select ON public.presupuestos_textos_legales;
CREATE POLICY pol_textos_select ON public.presupuestos_textos_legales
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('presupuestador'));
DROP POLICY IF EXISTS pol_textos_write ON public.presupuestos_textos_legales;
CREATE POLICY pol_textos_write ON public.presupuestos_textos_legales
  FOR ALL TO authenticated
  USING (public.app_tiene_permiso('presupuestador:config'))
  WITH CHECK (public.app_tiene_permiso('presupuestador:config'));

-- A5 config
ALTER TABLE public.presupuestos_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_config_select ON public.presupuestos_config;
CREATE POLICY pol_config_select ON public.presupuestos_config
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('presupuestador'));
DROP POLICY IF EXISTS pol_config_write ON public.presupuestos_config;
CREATE POLICY pol_config_write ON public.presupuestos_config
  FOR ALL TO authenticated
  USING (public.app_tiene_permiso('presupuestador:config'))
  WITH CHECK (public.app_tiene_permiso('presupuestador:config'));

-- Operativas: ALL con 'presupuestador' (mismos usuarios del módulo).
ALTER TABLE public.presupuestos_aceptacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_aceptacion_all ON public.presupuestos_aceptacion;
CREATE POLICY pol_aceptacion_all ON public.presupuestos_aceptacion
  FOR ALL TO authenticated
  USING (public.app_tiene_permiso('presupuestador'))
  WITH CHECK (public.app_tiene_permiso('presupuestador'));

ALTER TABLE public.presupuestos_checklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_checklist_all ON public.presupuestos_checklist;
CREATE POLICY pol_checklist_all ON public.presupuestos_checklist
  FOR ALL TO authenticated
  USING (public.app_tiene_permiso('presupuestador'))
  WITH CHECK (public.app_tiene_permiso('presupuestador'));

-- ============================================================
-- E. PRECARGA (seeds idempotentes)
-- ============================================================

INSERT INTO public.presupuestos_motivos_resultado (tipo, nombre, exige_observacion, orden) VALUES
  ('RECHAZADO','Diferencias económicas',                         false, 1),
  ('RECHAZADO','Falta de información',                           false, 2),
  ('RECHAZADO','Mejor presupuesto brindado en otra institución', false, 3),
  ('RECHAZADO','Decidió no operarse / postergó',                 false, 4),
  ('RECHAZADO','Otro',                                           true,  5)
ON CONFLICT (tipo, nombre) DO NOTHING;

INSERT INTO public.presupuestos_lios (nombre, orden) VALUES
  ('Básico', 1)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.presupuestos_convenios (nombre, sub_rama, codigo_practica, config, orden) VALUES
  ('Círculo Médico San Rafael','circulo_medico','020701',
   '{"cuenta":"62252","leyenda":"Valor según Círculo Médico San Rafael","lineas":["Gastos","Honorarios de Especialista"],"diag":"Catarata"}'::jsonb, 1),
  ('OSEP','directa','02.09.03',
   '{"cupo":"","diag":"CATARATA {ojo}"}'::jsonb, 2),
  ('OSDE','directa','20167',
   '{"diag":"CATARATA {ojo}"}'::jsonb, 3)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.presupuestos_textos_legales (clave, version, contenido, vigente, notas, created_by) VALUES
  ('consentimiento_catarata', 1,
   '[{"titulo":"PLACEHOLDER — Consentimiento informado (pendiente del texto legal definitivo)","cuerpo":"TEXTO PLACEHOLDER. El contenido legal definitivo del consentimiento informado para cirugía de catarata (Leyes 26.529 y 26.742, Decreto Reglamentario 1089/2012, aprobado por el Consejo Argentino de Oftalmología) será provisto por P. Famá y cargado como una NUEVA versión vigente antes de usarse en producción. No usar este texto para consentimiento real."}]'::jsonb,
   true, 'Placeholder inicial de la migración 25. Reemplazar por el texto legal definitivo (nueva versión).', 'migracion_25')
ON CONFLICT (clave, version) DO NOTHING;

INSERT INTO public.presupuestos_config (clave, valor) VALUES
  ('plazo_sin_respuesta_dias', '45')
ON CONFLICT (clave) DO NOTHING;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
DO $$
DECLARE faltan text := '';
BEGIN
  IF to_regclass('public.presupuestos_motivos_resultado') IS NULL THEN faltan := faltan||' motivos'; END IF;
  IF to_regclass('public.presupuestos_lios')              IS NULL THEN faltan := faltan||' lios'; END IF;
  IF to_regclass('public.presupuestos_convenios')         IS NULL THEN faltan := faltan||' convenios'; END IF;
  IF to_regclass('public.presupuestos_textos_legales')    IS NULL THEN faltan := faltan||' textos'; END IF;
  IF to_regclass('public.presupuestos_config')            IS NULL THEN faltan := faltan||' config'; END IF;
  IF to_regclass('public.presupuestos_aceptacion')        IS NULL THEN faltan := faltan||' aceptacion'; END IF;
  IF to_regclass('public.presupuestos_checklist')         IS NULL THEN faltan := faltan||' checklist'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='presupuestos' AND column_name='resultado') THEN
    faltan := faltan||' presupuestos.resultado';
  END IF;
  IF faltan <> '' THEN RAISE EXCEPTION 'FALLO 25: faltan ->%', faltan; END IF;
  RAISE NOTICE 'OK 25: circuito post-aceptación creado (5 catálogos + resultado + aceptación + checklist + RLS + seeds).';
END $$;

COMMIT;
