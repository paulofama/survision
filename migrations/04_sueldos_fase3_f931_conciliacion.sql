-- ===========================================================================
-- MIGRACION: 04_sueldos_fase3_f931_conciliacion.sql
-- ===========================================================================
-- Sistema: SurVision / Sistema Integral de Gestion
-- Cliente: Instituto Dr. Mercado / Survision S.A.
-- Desarrollo: P. Fama
--
-- FASE 3 del modulo Sueldos: declaraciones F.931, adjuntos PDF y diferencias
-- de conciliacion contra la minuta.
--
-- Crea 3 tablas + 1 bucket de Storage:
--   - f931_declaraciones:       1 fila por (cuit, anio, mes) con los 25+ campos
--                               del F.931 extraidos del PDF
--   - f931_adjuntos:            metadata de los PDFs subidos a Storage
--                               (con marca temprana de VEP-subido-por-error)
--   - conciliacion_diferencias: una fila por diferencia detectada entre minuta
--                               y F.931. Tipo automatico o residual material.
--   - storage.buckets:          bucket 'sueldos-adjuntos' (privado)
--
-- Tambien:
--   - Trigger updated_at en las 3 tablas (funcion compartida set_updated_at)
--   - Trigger de auditoria en f931_declaraciones (INSERT/UPDATE/DELETE/CONFIRMADO)
--   - Politicas RLS para anon y authenticated en las 3 tablas + storage.objects
--
-- DEPENDE DE:
--   - Migracion Fase 1 y Fase 2 aplicadas
--   - Patch 03_patch_rls_fase1_anon (para consistencia de politicas)
--   - extension pgcrypto habilitada
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. EXTENSIONES NECESARIAS
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===========================================================================
-- 1. TABLA: f931_declaraciones
-- ===========================================================================
-- Datos extraidos del PDF del F.931 (Formulario 931 de AFIP - DJ Cargas Sociales)
-- Se complementa con campos_extra (JSONB) para campos secundarios o nuevos
-- (extensibilidad sin migracion).

CREATE TABLE IF NOT EXISTS public.f931_declaraciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificacion del periodo
  cuit TEXT NOT NULL,
  cuit_sin_guiones TEXT NOT NULL,         -- redundante pero util para joins
  razon_social TEXT,
  anio INT NOT NULL,
  mes INT NOT NULL,

  -- Vinculo opcional con la liquidacion del mes
  liquidacion_id UUID,

  -- Estado de la declaracion
  --   PARSEADO_PENDIENTE_REVISION: parser termino, contadora aun no confirmo
  --   REVISADO_CONFIRMADO:         contadora valido los datos extraidos
  --   DESCARTADO:                  se subio por error (ej. era un VEP), no usar
  estado TEXT NOT NULL DEFAULT 'PARSEADO_PENDIENTE_REVISION',

  -- Indicador temprano: ¿el PDF parecia VEP en vez de F.931?
  parecio_vep BOOLEAN NOT NULL DEFAULT false,

  -- ----- Campos del F.931 (los 12-15 mas usados, tipados) -----------------
  cantidad_trabajadores INT,

  -- Remuneraciones imponibles
  rem_total NUMERIC(14, 2),               -- Bruto total
  rem_1 NUMERIC(14, 2),                   -- Rem.1 = base aportes SS (clave para reparto bruto)
  rem_2 NUMERIC(14, 2),                   -- Rem.2 = base aportes OS
  rem_3 NUMERIC(14, 2),
  rem_4 NUMERIC(14, 2),
  rem_5 NUMERIC(14, 2),

  -- Aportes del empleado (retenciones)
  aporte_ss_301 NUMERIC(14, 2),
  aporte_os_302 NUMERIC(14, 2),

  -- Contribuciones del empleador
  contrib_ss_351 NUMERIC(14, 2),
  contrib_os_352 NUMERIC(14, 2),

  -- Otros conceptos
  art NUMERIC(14, 2),
  scvo NUMERIC(14, 2),

  -- Asignaciones familiares (a favor de la empresa, baja del total a pagar)
  asignaciones_familiares NUMERIC(14, 2),

  -- Total a depositar
  total_a_depositar NUMERIC(14, 2),

  -- Campos secundarios o nuevos del F.931 sin columna tipada
  campos_extra JSONB,

  -- Texto crudo extraido del PDF (para debug del parser)
  raw_extract_text TEXT,

  -- Metadata de la accion
  parseado_at TIMESTAMPTZ,                -- cuando corrio el parser
  confirmado_at TIMESTAMPTZ,              -- cuando la contadora confirmo
  confirmado_por_nombre TEXT,             -- snapshot del nombre

  observaciones TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Constraints
ALTER TABLE public.f931_declaraciones DROP CONSTRAINT IF EXISTS uq_f931_cuit_periodo;
ALTER TABLE public.f931_declaraciones ADD CONSTRAINT uq_f931_cuit_periodo
  UNIQUE (cuit_sin_guiones, anio, mes);

ALTER TABLE public.f931_declaraciones DROP CONSTRAINT IF EXISTS chk_f931_anio;
ALTER TABLE public.f931_declaraciones ADD CONSTRAINT chk_f931_anio
  CHECK (anio BETWEEN 2020 AND 2050);

ALTER TABLE public.f931_declaraciones DROP CONSTRAINT IF EXISTS chk_f931_mes;
ALTER TABLE public.f931_declaraciones ADD CONSTRAINT chk_f931_mes
  CHECK (mes BETWEEN 1 AND 12);

ALTER TABLE public.f931_declaraciones DROP CONSTRAINT IF EXISTS chk_f931_estado;
ALTER TABLE public.f931_declaraciones ADD CONSTRAINT chk_f931_estado
  CHECK (estado IN (
    'PARSEADO_PENDIENTE_REVISION',
    'REVISADO_CONFIRMADO',
    'DESCARTADO'
  ));

ALTER TABLE public.f931_declaraciones DROP CONSTRAINT IF EXISTS fk_f931_liquidacion;
ALTER TABLE public.f931_declaraciones ADD CONSTRAINT fk_f931_liquidacion
  FOREIGN KEY (liquidacion_id) REFERENCES public.liquidaciones_mes(id) ON DELETE SET NULL;

-- Si esta CONFIRMADO debe tener confirmado_at
ALTER TABLE public.f931_declaraciones DROP CONSTRAINT IF EXISTS chk_f931_confirmacion_coherente;
ALTER TABLE public.f931_declaraciones ADD CONSTRAINT chk_f931_confirmacion_coherente
  CHECK (
    (estado = 'REVISADO_CONFIRMADO' AND confirmado_at IS NOT NULL)
    OR (estado <> 'REVISADO_CONFIRMADO')
  );

-- Indices
CREATE INDEX IF NOT EXISTS idx_f931_periodo
  ON public.f931_declaraciones (anio DESC, mes DESC);

CREATE INDEX IF NOT EXISTS idx_f931_liquidacion
  ON public.f931_declaraciones (liquidacion_id)
  WHERE liquidacion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_f931_estado
  ON public.f931_declaraciones (estado);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_f931_declaraciones_updated_at ON public.f931_declaraciones;
CREATE TRIGGER trg_f931_declaraciones_updated_at
  BEFORE UPDATE ON public.f931_declaraciones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.f931_declaraciones IS
  'Declaracion F.931 (Cargas Sociales) extraida del PDF subido por la contadora.';
COMMENT ON COLUMN public.f931_declaraciones.rem_1 IS
  'Remuneracion imponible 1 (SS). Clave para el reparto bruto entre empleados en Fase 4.';
COMMENT ON COLUMN public.f931_declaraciones.campos_extra IS
  'JSONB con campos del F.931 que no tienen columna tipada (extensibilidad sin migracion).';

-- ===========================================================================
-- 2. TABLA: f931_adjuntos
-- ===========================================================================
-- Metadata de los PDFs subidos a Supabase Storage (bucket sueldos-adjuntos).
-- Una declaracion puede tener varios adjuntos (ej. el F.931 oficial + un VEP
-- detectado y marcado como error). El path completo en el bucket esta en
-- bucket_path y se referencia desde aqui.

CREATE TABLE IF NOT EXISTS public.f931_adjuntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  declaracion_id UUID NOT NULL,

  -- Tipo de adjunto detectado / asignado
  --   F931_OFICIAL: PDF del F.931 valido (usar)
  --   VEP_ERROR:    parecia VEP, no F.931 (no usar — informativo)
  --   OTRO:         adjunto adicional (acuse, captura, etc.)
  tipo_adjunto TEXT NOT NULL DEFAULT 'F931_OFICIAL',

  -- Path en el bucket de Storage (ej: '2026/05/F_931_052026.pdf')
  bucket_path TEXT NOT NULL,

  -- Metadata del archivo
  nombre_original TEXT,
  mime_type TEXT,
  tamano_bytes BIGINT,

  -- Marca temprana detectada por el parser
  detectado_como_vep BOOLEAN NOT NULL DEFAULT false,

  -- Quien lo subio
  subido_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  subido_por_nombre TEXT,

  observaciones TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.f931_adjuntos DROP CONSTRAINT IF EXISTS fk_f931_adjuntos_declaracion;
ALTER TABLE public.f931_adjuntos ADD CONSTRAINT fk_f931_adjuntos_declaracion
  FOREIGN KEY (declaracion_id) REFERENCES public.f931_declaraciones(id) ON DELETE CASCADE;

ALTER TABLE public.f931_adjuntos DROP CONSTRAINT IF EXISTS chk_f931_adjuntos_tipo;
ALTER TABLE public.f931_adjuntos ADD CONSTRAINT chk_f931_adjuntos_tipo
  CHECK (tipo_adjunto IN ('F931_OFICIAL', 'VEP_ERROR', 'OTRO'));

ALTER TABLE public.f931_adjuntos DROP CONSTRAINT IF EXISTS chk_f931_adjuntos_tamano;
ALTER TABLE public.f931_adjuntos ADD CONSTRAINT chk_f931_adjuntos_tamano
  CHECK (tamano_bytes IS NULL OR tamano_bytes > 0);

ALTER TABLE public.f931_adjuntos DROP CONSTRAINT IF EXISTS uq_f931_adjuntos_path;
ALTER TABLE public.f931_adjuntos ADD CONSTRAINT uq_f931_adjuntos_path
  UNIQUE (bucket_path);

CREATE INDEX IF NOT EXISTS idx_f931_adjuntos_declaracion
  ON public.f931_adjuntos (declaracion_id);

DROP TRIGGER IF EXISTS trg_f931_adjuntos_updated_at ON public.f931_adjuntos;
CREATE TRIGGER trg_f931_adjuntos_updated_at
  BEFORE UPDATE ON public.f931_adjuntos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.f931_adjuntos IS
  'Metadata de PDFs F.931 subidos al bucket sueldos-adjuntos.';

-- ===========================================================================
-- 3. TABLA: conciliacion_diferencias
-- ===========================================================================
-- Una fila por diferencia detectada entre la minuta (Fase 2) y el F.931 (Fase 3).
-- Cada diferencia se clasifica por tipo:
--   AUTO_SINDICATO_NO_F931:        sindicato no se declara en F.931, esperable
--   AUTO_RETENCION_SUSS_DESDOBLADA: F.931 separa retenciones SS y OS
--   AUTO_REDONDEO:                  diferencia absoluta < $1
--   MATERIAL_RESIDUAL:              supera el umbral, requiere justificacion humana
--   JUSTIFICADA_MANUAL:             el usuario explico la diferencia
--
-- Las AUTO_* se generan automaticamente con justificada=true y un texto canned.
-- MATERIAL_RESIDUAL empieza con justificada=false; al cargar justificacion,
-- el engine la cambia a JUSTIFICADA_MANUAL.

CREATE TABLE IF NOT EXISTS public.conciliacion_diferencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  liquidacion_id UUID NOT NULL,

  -- Identificacion del concepto/bloque comparado
  bloque_tipo TEXT NOT NULL,              -- pago_sueldos, seguridad_social, sindicato, etc.
  concepto_codigo TEXT,                    -- APORTE_SS, CONTRIB_SS, etc. NULL si es agregado del bloque

  -- Montos comparados
  monto_minuta NUMERIC(14, 2) NOT NULL DEFAULT 0,
  monto_f931 NUMERIC(14, 2) NOT NULL DEFAULT 0,
  diferencia NUMERIC(14, 2) GENERATED ALWAYS AS (monto_minuta - monto_f931) STORED,

  -- Clasificacion
  tipo_diferencia TEXT NOT NULL,
  justificada BOOLEAN NOT NULL DEFAULT false,
  justificacion TEXT,

  -- Quien justifico (si fue manual)
  justificada_at TIMESTAMPTZ,
  justificada_por_nombre TEXT,

  observaciones TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conciliacion_diferencias DROP CONSTRAINT IF EXISTS fk_concil_liquidacion;
ALTER TABLE public.conciliacion_diferencias ADD CONSTRAINT fk_concil_liquidacion
  FOREIGN KEY (liquidacion_id) REFERENCES public.liquidaciones_mes(id) ON DELETE CASCADE;

ALTER TABLE public.conciliacion_diferencias DROP CONSTRAINT IF EXISTS chk_concil_bloque_tipo;
ALTER TABLE public.conciliacion_diferencias ADD CONSTRAINT chk_concil_bloque_tipo
  CHECK (bloque_tipo IN (
    'pago_sueldos', 'horas_complementarias', 'dia_sanidad',
    'seguridad_social', 'sindicato'
  ));

ALTER TABLE public.conciliacion_diferencias DROP CONSTRAINT IF EXISTS chk_concil_tipo_dif;
ALTER TABLE public.conciliacion_diferencias ADD CONSTRAINT chk_concil_tipo_dif
  CHECK (tipo_diferencia IN (
    'AUTO_SINDICATO_NO_F931',
    'AUTO_RETENCION_SUSS_DESDOBLADA',
    'AUTO_REDONDEO',
    'MATERIAL_RESIDUAL',
    'JUSTIFICADA_MANUAL'
  ));

-- Si esta justificada, justificada_at debe estar set
ALTER TABLE public.conciliacion_diferencias DROP CONSTRAINT IF EXISTS chk_concil_justif_coherente;
ALTER TABLE public.conciliacion_diferencias ADD CONSTRAINT chk_concil_justif_coherente
  CHECK (
    (justificada = false)
    OR (justificada = true AND justificacion IS NOT NULL AND length(trim(justificacion)) > 0)
  );

-- No duplicar diferencias para el mismo (liquidacion, bloque, concepto)
ALTER TABLE public.conciliacion_diferencias DROP CONSTRAINT IF EXISTS uq_concil_liq_bloque_concepto;
ALTER TABLE public.conciliacion_diferencias ADD CONSTRAINT uq_concil_liq_bloque_concepto
  UNIQUE (liquidacion_id, bloque_tipo, concepto_codigo);

CREATE INDEX IF NOT EXISTS idx_concil_liquidacion
  ON public.conciliacion_diferencias (liquidacion_id);

CREATE INDEX IF NOT EXISTS idx_concil_tipo
  ON public.conciliacion_diferencias (tipo_diferencia);

CREATE INDEX IF NOT EXISTS idx_concil_justificada
  ON public.conciliacion_diferencias (justificada)
  WHERE justificada = false;

DROP TRIGGER IF EXISTS trg_concil_diferencias_updated_at ON public.conciliacion_diferencias;
CREATE TRIGGER trg_concil_diferencias_updated_at
  BEFORE UPDATE ON public.conciliacion_diferencias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.conciliacion_diferencias IS
  'Diferencias detectadas entre minuta (Fase 2) y F.931 (Fase 3). Auto-justificadas o residuales.';

-- ===========================================================================
-- 4. TRIGGER DE AUDITORIA: audit_f931_declaraciones
-- ===========================================================================
-- Escribe en log_auditoria_sueldos los cambios sobre f931_declaraciones,
-- detectando transiciones especiales:
--   - estado -> 'REVISADO_CONFIRMADO' = accion CONFIRMADO_F931
--   - estado -> 'DESCARTADO'          = accion DESCARTADO_F931

CREATE OR REPLACE FUNCTION public.audit_f931_declaraciones()
RETURNS TRIGGER AS $$
DECLARE
  v_accion TEXT;
  v_valor_anterior JSONB;
  v_valor_nuevo JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_accion := 'INSERT_f931_declaraciones';
    v_valor_anterior := NULL;
    v_valor_nuevo := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.estado IS DISTINCT FROM NEW.estado THEN
      IF NEW.estado = 'REVISADO_CONFIRMADO' THEN
        v_accion := 'CONFIRMADO_F931';
      ELSIF NEW.estado = 'DESCARTADO' THEN
        v_accion := 'DESCARTADO_F931';
      ELSE
        v_accion := 'UPDATE_f931_declaraciones';
      END IF;
    ELSE
      v_accion := 'UPDATE_f931_declaraciones';
    END IF;
    v_valor_anterior := to_jsonb(OLD);
    v_valor_nuevo := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_accion := 'DELETE_f931_declaraciones';
    v_valor_anterior := to_jsonb(OLD);
    v_valor_nuevo := NULL;
  END IF;

  INSERT INTO public.log_auditoria_sueldos (
    usuario_id,
    usuario_nombre_snapshot,
    accion,
    entidad,
    entidad_id,
    valor_anterior,
    valor_nuevo,
    metadata
  ) VALUES (
    NULL,
    NULL,
    v_accion,
    'f931_declaraciones',
    COALESCE(NEW.id, OLD.id),
    v_valor_anterior,
    v_valor_nuevo,
    jsonb_build_object('tg_op', TG_OP)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_f931_declaraciones ON public.f931_declaraciones;
CREATE TRIGGER trg_audit_f931_declaraciones
  AFTER INSERT OR UPDATE OR DELETE ON public.f931_declaraciones
  FOR EACH ROW EXECUTE FUNCTION public.audit_f931_declaraciones();

-- ===========================================================================
-- 5. STORAGE BUCKET: sueldos-adjuntos
-- ===========================================================================
-- Bucket privado para guardar los PDFs del F.931 (y futuros adjuntos del modulo).
-- Acceso controlado via RLS en storage.objects.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sueldos-adjuntos',
  'sueldos-adjuntos',
  false,    -- privado
  10485760, -- 10 MB max por archivo
  ARRAY['application/pdf', 'image/png', 'image/jpeg']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Politicas RLS sobre storage.objects (filtradas por bucket)
DROP POLICY IF EXISTS pol_sueldos_adjuntos_anon ON storage.objects;
CREATE POLICY pol_sueldos_adjuntos_anon ON storage.objects
  FOR ALL TO anon
  USING (bucket_id = 'sueldos-adjuntos')
  WITH CHECK (bucket_id = 'sueldos-adjuntos');

DROP POLICY IF EXISTS pol_sueldos_adjuntos_authenticated ON storage.objects;
CREATE POLICY pol_sueldos_adjuntos_authenticated ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'sueldos-adjuntos')
  WITH CHECK (bucket_id = 'sueldos-adjuntos');

-- ===========================================================================
-- 6. RLS DE LAS TABLAS
-- ===========================================================================

ALTER TABLE public.f931_declaraciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.f931_adjuntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conciliacion_diferencias ENABLE ROW LEVEL SECURITY;

-- Drop existing
DROP POLICY IF EXISTS pol_f931_declaraciones_all ON public.f931_declaraciones;
DROP POLICY IF EXISTS pol_f931_declaraciones_anon ON public.f931_declaraciones;
DROP POLICY IF EXISTS pol_f931_adjuntos_all ON public.f931_adjuntos;
DROP POLICY IF EXISTS pol_f931_adjuntos_anon ON public.f931_adjuntos;
DROP POLICY IF EXISTS pol_concil_diferencias_all ON public.conciliacion_diferencias;
DROP POLICY IF EXISTS pol_concil_diferencias_anon ON public.conciliacion_diferencias;

-- f931_declaraciones
CREATE POLICY pol_f931_declaraciones_all ON public.f931_declaraciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pol_f931_declaraciones_anon ON public.f931_declaraciones
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- f931_adjuntos
CREATE POLICY pol_f931_adjuntos_all ON public.f931_adjuntos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pol_f931_adjuntos_anon ON public.f931_adjuntos
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- conciliacion_diferencias
CREATE POLICY pol_concil_diferencias_all ON public.conciliacion_diferencias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pol_concil_diferencias_anon ON public.conciliacion_diferencias
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ===========================================================================
-- 7. VERIFICACION FINAL
-- ===========================================================================

DO $$
DECLARE
  v_tablas_esperadas TEXT[] := ARRAY[
    'f931_declaraciones',
    'f931_adjuntos',
    'conciliacion_diferencias'
  ];
  v_tabla TEXT;
  v_count INT;
BEGIN
  -- Tablas
  FOREACH v_tabla IN ARRAY v_tablas_esperadas LOOP
    SELECT count(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = v_tabla;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'Tabla esperada no existe: public.%', v_tabla;
    END IF;
  END LOOP;

  -- Funcion de auditoria
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'audit_f931_declaraciones';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Funcion audit_f931_declaraciones no existe';
  END IF;

  -- Trigger
  SELECT count(*) INTO v_count
  FROM pg_trigger
  WHERE tgname = 'trg_audit_f931_declaraciones' AND NOT tgisinternal;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Trigger trg_audit_f931_declaraciones no esta conectado';
  END IF;

  -- Bucket
  SELECT count(*) INTO v_count
  FROM storage.buckets
  WHERE id = 'sueldos-adjuntos';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Bucket sueldos-adjuntos no existe';
  END IF;

  -- Politicas RLS
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('f931_declaraciones', 'f931_adjuntos', 'conciliacion_diferencias');
  IF v_count < 6 THEN
    RAISE EXCEPTION 'Esperaba >=6 politicas RLS, encontre %', v_count;
  END IF;

  RAISE NOTICE 'Migracion Fase 3 aplicada correctamente: 3 tablas, bucket sueldos-adjuntos, trigger auditoria, RLS habilitado.';
END;
$$;

COMMIT;

-- Refresh PostgREST cache
NOTIFY pgrst, 'reload schema';
