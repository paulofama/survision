-- ===========================================================================
-- MIGRACION: 06_sueldos_fase5_hallazgos.sql
-- ===========================================================================
-- Sistema: SurVision / Sistema Integral de Gestion
-- Cliente: Instituto Dr. Mercado / Survision S.A.
-- Desarrollo: P. Fama
--
-- FASE 5 del modulo Sueldos: HALLAZGOS de auditoria. Tabla estructurada de
-- observaciones/hallazgos que el Auditor (Paulo) registra por mes, con
-- criticidad, norma referenciada y estado del ciclo de vida.
--
-- Crea 1 tabla:
--   - hallazgos_sueldos: 1 fila por hallazgo. Opcionalmente vinculado a una
--     liquidacion (mes). Tipos: criticidad, estado, origen (manual/automatico).
--
-- NOTA sobre el control de acceso "solo Auditor":
--   La app usa anon key (no implementa auth.signIn de Supabase), por lo que el
--   RLS NO puede distinguir Auditor de contadora a nivel BD. El gating real es
--   a nivel aplicacion mediante el permiso 'sueldos:reportes' (useRoles). Las
--   politicas RLS quedan permisivas para anon/authenticated, consistentes con
--   el resto del modulo. Si en el futuro se implementa auth de Supabase, se
--   endurece aca.
--
-- Tambien:
--   - Trigger updated_at (funcion compartida set_updated_at).
--   - Trigger de auditoria (INSERT/UPDATE/DELETE_hallazgos) sobre log_auditoria_sueldos.
--   - Politicas RLS para anon y authenticated.
--
-- DEPENDE DE: Migraciones Fase 1-4 (liquidaciones_mes, log_auditoria_sueldos,
--   set_updated_at), extension pgcrypto.
-- ===========================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===========================================================================
-- 1. TABLA: hallazgos_sueldos
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.hallazgos_sueldos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vinculo opcional con la liquidacion del mes (null = hallazgo transversal)
  liquidacion_id UUID,
  anio INT,
  mes INT,

  -- Codigo legible del hallazgo (ej. 'H-01'). Opcional.
  codigo TEXT,

  -- Contenido
  titulo TEXT NOT NULL,
  descripcion TEXT,

  -- Criticidad del hallazgo
  criticidad TEXT NOT NULL DEFAULT 'MEDIA',

  -- Norma / legislacion referenciada (ej. 'LCT art. 132', 'Res. AFIP ...')
  norma TEXT,

  -- Estado del ciclo de vida del hallazgo
  estado TEXT NOT NULL DEFAULT 'ABIERTO',

  -- Recomendacion / accion sugerida
  recomendacion TEXT,

  -- Origen: cargado a mano por el auditor o detectado automaticamente
  origen TEXT NOT NULL DEFAULT 'manual',

  -- Metadata
  detectado_at TIMESTAMPTZ DEFAULT now(),
  resuelto_at TIMESTAMPTZ,
  creado_por_nombre TEXT,

  observaciones TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Constraints
ALTER TABLE public.hallazgos_sueldos DROP CONSTRAINT IF EXISTS fk_hallazgo_liquidacion;
ALTER TABLE public.hallazgos_sueldos ADD CONSTRAINT fk_hallazgo_liquidacion
  FOREIGN KEY (liquidacion_id) REFERENCES public.liquidaciones_mes(id) ON DELETE CASCADE;

ALTER TABLE public.hallazgos_sueldos DROP CONSTRAINT IF EXISTS chk_hallazgo_anio;
ALTER TABLE public.hallazgos_sueldos ADD CONSTRAINT chk_hallazgo_anio
  CHECK (anio IS NULL OR anio BETWEEN 2020 AND 2050);

ALTER TABLE public.hallazgos_sueldos DROP CONSTRAINT IF EXISTS chk_hallazgo_mes;
ALTER TABLE public.hallazgos_sueldos ADD CONSTRAINT chk_hallazgo_mes
  CHECK (mes IS NULL OR mes BETWEEN 1 AND 12);

ALTER TABLE public.hallazgos_sueldos DROP CONSTRAINT IF EXISTS chk_hallazgo_criticidad;
ALTER TABLE public.hallazgos_sueldos ADD CONSTRAINT chk_hallazgo_criticidad
  CHECK (criticidad IN ('CRITICA', 'ALTA', 'MEDIA', 'BAJA', 'INFORMATIVA'));

ALTER TABLE public.hallazgos_sueldos DROP CONSTRAINT IF EXISTS chk_hallazgo_estado;
ALTER TABLE public.hallazgos_sueldos ADD CONSTRAINT chk_hallazgo_estado
  CHECK (estado IN ('ABIERTO', 'EN_REVISION', 'RESUELTO', 'NO_APLICA'));

ALTER TABLE public.hallazgos_sueldos DROP CONSTRAINT IF EXISTS chk_hallazgo_origen;
ALTER TABLE public.hallazgos_sueldos ADD CONSTRAINT chk_hallazgo_origen
  CHECK (origen IN ('manual', 'automatico'));

ALTER TABLE public.hallazgos_sueldos DROP CONSTRAINT IF EXISTS chk_hallazgo_titulo;
ALTER TABLE public.hallazgos_sueldos ADD CONSTRAINT chk_hallazgo_titulo
  CHECK (length(trim(titulo)) > 0);

-- Si esta RESUELTO deberia tener resuelto_at
ALTER TABLE public.hallazgos_sueldos DROP CONSTRAINT IF EXISTS chk_hallazgo_resuelto_coherente;
ALTER TABLE public.hallazgos_sueldos ADD CONSTRAINT chk_hallazgo_resuelto_coherente
  CHECK (estado <> 'RESUELTO' OR resuelto_at IS NOT NULL);

-- Indices
CREATE INDEX IF NOT EXISTS idx_hallazgo_liquidacion
  ON public.hallazgos_sueldos (liquidacion_id) WHERE liquidacion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hallazgo_periodo
  ON public.hallazgos_sueldos (anio DESC, mes DESC);
CREATE INDEX IF NOT EXISTS idx_hallazgo_estado
  ON public.hallazgos_sueldos (estado);
CREATE INDEX IF NOT EXISTS idx_hallazgo_criticidad
  ON public.hallazgos_sueldos (criticidad);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_hallazgos_sueldos_updated_at ON public.hallazgos_sueldos;
CREATE TRIGGER trg_hallazgos_sueldos_updated_at
  BEFORE UPDATE ON public.hallazgos_sueldos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.hallazgos_sueldos IS
  'Hallazgos de auditoria del modulo Sueldos (Fase 5). Gating de acceso a nivel app (permiso sueldos:reportes).';
COMMENT ON COLUMN public.hallazgos_sueldos.origen IS
  'manual = cargado por el auditor; automatico = detectado por reglas del sistema.';

-- ===========================================================================
-- 2. TRIGGER DE AUDITORIA
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.audit_hallazgos_sueldos()
RETURNS TRIGGER AS $$
DECLARE
  v_accion TEXT;
  v_valor_anterior JSONB;
  v_valor_nuevo JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_accion := 'INSERT_hallazgos';
    v_valor_anterior := NULL;
    v_valor_nuevo := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_accion := 'UPDATE_hallazgos';
    v_valor_anterior := to_jsonb(OLD);
    v_valor_nuevo := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_accion := 'DELETE_hallazgos';
    v_valor_anterior := to_jsonb(OLD);
    v_valor_nuevo := NULL;
  END IF;

  INSERT INTO public.log_auditoria_sueldos (
    usuario_id, usuario_nombre_snapshot, accion, entidad, entidad_id,
    valor_anterior, valor_nuevo, metadata
  ) VALUES (
    NULL,
    COALESCE(NEW.creado_por_nombre, OLD.creado_por_nombre),
    v_accion, 'hallazgos_sueldos', COALESCE(NEW.id, OLD.id),
    v_valor_anterior, v_valor_nuevo,
    jsonb_build_object('tg_op', TG_OP)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_hallazgos_sueldos ON public.hallazgos_sueldos;
CREATE TRIGGER trg_audit_hallazgos_sueldos
  AFTER INSERT OR UPDATE OR DELETE ON public.hallazgos_sueldos
  FOR EACH ROW EXECUTE FUNCTION public.audit_hallazgos_sueldos();

-- ===========================================================================
-- 3. RLS
-- ===========================================================================

ALTER TABLE public.hallazgos_sueldos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_hallazgos_sueldos_all ON public.hallazgos_sueldos;
DROP POLICY IF EXISTS pol_hallazgos_sueldos_anon ON public.hallazgos_sueldos;

CREATE POLICY pol_hallazgos_sueldos_all ON public.hallazgos_sueldos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pol_hallazgos_sueldos_anon ON public.hallazgos_sueldos
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ===========================================================================
-- 4. VERIFICACION FINAL
-- ===========================================================================

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'hallazgos_sueldos';
  IF v_count = 0 THEN RAISE EXCEPTION 'Tabla hallazgos_sueldos no existe'; END IF;

  SELECT count(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'audit_hallazgos_sueldos';
  IF v_count = 0 THEN RAISE EXCEPTION 'Funcion audit_hallazgos_sueldos no existe'; END IF;

  SELECT count(*) INTO v_count FROM pg_trigger
  WHERE tgname = 'trg_audit_hallazgos_sueldos' AND NOT tgisinternal;
  IF v_count = 0 THEN RAISE EXCEPTION 'Trigger trg_audit_hallazgos_sueldos no conectado'; END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'hallazgos_sueldos';
  IF v_count < 2 THEN RAISE EXCEPTION 'Esperaba >=2 politicas RLS, encontre %', v_count; END IF;

  RAISE NOTICE 'Migracion Fase 5 aplicada correctamente: tabla hallazgos_sueldos, trigger auditoria, RLS habilitado.';
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
