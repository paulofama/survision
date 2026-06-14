-- ===========================================================================
-- MIGRACION: 02_sueldos_fase2_liquidaciones.sql
-- ===========================================================================
-- Sistema: SurVision / Sistema Integral de Gestion
-- Cliente: Instituto Dr. Mercado / Survision S.A.
-- Desarrollo: P. Fama
--
-- FASE 2 del modulo Sueldos: estructura de liquidaciones mensuales.
--
-- Crea 4 tablas:
--   - liquidaciones_mes:            1 fila por (anio, mes) con estado del flujo
--   - liquidacion_bloques:          4-5 bloques por mes (pago_sueldos, HC, dia_sanidad,
--                                   seguridad_social, sindicato)
--   - liquidacion_lineas_empleado:  lineas por empleado dentro de un bloque
--                                   (para pago_sueldos, HC, dia_sanidad)
--   - liquidacion_lineas_concepto:  lineas por concepto canonico dentro de un bloque
--                                   (para seguridad_social = 6 conceptos, sindicato = 1)
--
-- Tambien crea:
--   - Funcion compartida set_updated_at (CREATE OR REPLACE)
--   - Funcion audit_liquidaciones_mes que escribe a log_auditoria_sueldos
--   - Triggers de updated_at en las 4 tablas
--   - Trigger de auditoria en liquidaciones_mes (INSERT/UPDATE incluyendo CIERRE_MES / REAPERTURA_MES)
--   - RLS habilitado con politica permisiva para authenticated (granularidad por rol pendiente)
--
-- CONVENCIONES:
--   - Idempotente: CREATE TABLE IF NOT EXISTS, DROP TRIGGER IF EXISTS, CREATE OR REPLACE FUNCTION
--   - Transaccional: todo en un BEGIN/COMMIT con bloque DO de verificacion al final
--   - Comentado: cada tabla tiene COMMENT ON TABLE/COLUMN para introspeccion
--
-- DEPENDE DE:
--   - Migracion Fase 1 aplicada (tablas empleados, log_auditoria_sueldos existentes)
--   - extension pgcrypto habilitada (para gen_random_uuid)
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. EXTENSIONES NECESARIAS
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. FUNCION COMPARTIDA: set_updated_at()
-- ---------------------------------------------------------------------------
-- Probablemente ya creada por la migracion Fase 1. CREATE OR REPLACE asegura
-- que siempre tengamos la version mas reciente.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===========================================================================
-- 2. TABLA: liquidaciones_mes
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.liquidaciones_mes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  anio INT NOT NULL,
  mes INT NOT NULL,

  -- Estado del flujo (7 estados, ver CLAUDE.md):
  --   VACIO -> MINUTA_EN_CARGA -> MINUTA_COMPLETA -> F931_CARGADO
  --   -> CONCILIADO -> ASIENTO_GENERADO -> CERRADO
  -- Avance automatico hasta CONCILIADO; manual desde ASIENTO_GENERADO en adelante.
  estado TEXT NOT NULL DEFAULT 'VACIO',

  -- Metadatos del cierre (cuando estado pasa a CERRADO)
  cerrado_at TIMESTAMPTZ,
  cerrado_por UUID,
  cerrado_por_nombre TEXT,

  -- Metadatos de reapertura (cuando se reabre desde CERRADO; justificacion obligatoria)
  reabierto_at TIMESTAMPTZ,
  reabierto_por UUID,
  reabierto_por_nombre TEXT,
  reapertura_justificacion TEXT,

  -- Observaciones generales del mes
  observaciones TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Constraints (DROP IF EXISTS para idempotencia)
ALTER TABLE public.liquidaciones_mes DROP CONSTRAINT IF EXISTS uq_liquidaciones_mes_periodo;
ALTER TABLE public.liquidaciones_mes ADD CONSTRAINT uq_liquidaciones_mes_periodo UNIQUE (anio, mes);

ALTER TABLE public.liquidaciones_mes DROP CONSTRAINT IF EXISTS chk_liquidaciones_mes_anio;
ALTER TABLE public.liquidaciones_mes ADD CONSTRAINT chk_liquidaciones_mes_anio
  CHECK (anio BETWEEN 2020 AND 2050);

ALTER TABLE public.liquidaciones_mes DROP CONSTRAINT IF EXISTS chk_liquidaciones_mes_mes;
ALTER TABLE public.liquidaciones_mes ADD CONSTRAINT chk_liquidaciones_mes_mes
  CHECK (mes BETWEEN 1 AND 12);

ALTER TABLE public.liquidaciones_mes DROP CONSTRAINT IF EXISTS chk_liquidaciones_mes_estado;
ALTER TABLE public.liquidaciones_mes ADD CONSTRAINT chk_liquidaciones_mes_estado
  CHECK (estado IN (
    'VACIO', 'MINUTA_EN_CARGA', 'MINUTA_COMPLETA',
    'F931_CARGADO', 'CONCILIADO', 'ASIENTO_GENERADO', 'CERRADO'
  ));

-- Si esta CERRADO, debe tener cerrado_at
ALTER TABLE public.liquidaciones_mes DROP CONSTRAINT IF EXISTS chk_liquidaciones_mes_cerrado_coherente;
ALTER TABLE public.liquidaciones_mes ADD CONSTRAINT chk_liquidaciones_mes_cerrado_coherente
  CHECK (
    (estado = 'CERRADO' AND cerrado_at IS NOT NULL)
    OR (estado <> 'CERRADO')
  );

-- Si fue reabierto alguna vez, debe tener justificacion
ALTER TABLE public.liquidaciones_mes DROP CONSTRAINT IF EXISTS chk_liquidaciones_mes_reapertura_coherente;
ALTER TABLE public.liquidaciones_mes ADD CONSTRAINT chk_liquidaciones_mes_reapertura_coherente
  CHECK (
    (reabierto_at IS NULL AND reapertura_justificacion IS NULL)
    OR (reabierto_at IS NOT NULL AND reapertura_justificacion IS NOT NULL
        AND length(trim(reapertura_justificacion)) > 0)
  );

-- Indices
CREATE INDEX IF NOT EXISTS idx_liquidaciones_mes_periodo
  ON public.liquidaciones_mes (anio DESC, mes DESC);

CREATE INDEX IF NOT EXISTS idx_liquidaciones_mes_estado
  ON public.liquidaciones_mes (estado);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_liquidaciones_mes_updated_at ON public.liquidaciones_mes;
CREATE TRIGGER trg_liquidaciones_mes_updated_at
  BEFORE UPDATE ON public.liquidaciones_mes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Comentarios para introspeccion
COMMENT ON TABLE public.liquidaciones_mes IS
  'Una fila por mes liquidado. Estado del flujo de carga, metadata de cierre y reapertura.';
COMMENT ON COLUMN public.liquidaciones_mes.estado IS
  'Estado del flujo del mes. Avance automatico hasta CONCILIADO; manual desde ASIENTO_GENERADO.';
COMMENT ON COLUMN public.liquidaciones_mes.reapertura_justificacion IS
  'Justificacion obligatoria al reabrir un mes CERRADO.';

-- ===========================================================================
-- 3. TABLA: liquidacion_bloques
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.liquidacion_bloques (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  liquidacion_id UUID NOT NULL,

  -- Tipo de bloque (5 tipos posibles)
  tipo TEXT NOT NULL,

  -- Medio de pago del bloque (caja o banco). Determina la contracuenta.
  --   - pago_sueldos:        banco_santander_rio
  --   - horas_complementarias: caja
  --   - dia_sanidad:          caja (usualmente)
  --   - seguridad_social:    banco_santander_rio
  --   - sindicato:           banco_santander_rio
  medio_pago TEXT,

  -- Cuenta contracuenta resuelta (snapshot). Redundante con medio_pago pero
  -- explicito para el asiento (1.1.1.01 caja / 1.1.1.03 banco santander).
  cuenta_contracuenta TEXT,

  -- Total declarado por la contadora (para validar contra suma de lineas)
  total_declarado NUMERIC(14, 2),

  -- La contadora marca cuando termino de cargar este bloque
  completo BOOLEAN NOT NULL DEFAULT false,

  observaciones TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.liquidacion_bloques DROP CONSTRAINT IF EXISTS fk_bloques_liquidacion;
ALTER TABLE public.liquidacion_bloques ADD CONSTRAINT fk_bloques_liquidacion
  FOREIGN KEY (liquidacion_id) REFERENCES public.liquidaciones_mes(id) ON DELETE CASCADE;

ALTER TABLE public.liquidacion_bloques DROP CONSTRAINT IF EXISTS uq_bloques_liquidacion_tipo;
ALTER TABLE public.liquidacion_bloques ADD CONSTRAINT uq_bloques_liquidacion_tipo
  UNIQUE (liquidacion_id, tipo);

ALTER TABLE public.liquidacion_bloques DROP CONSTRAINT IF EXISTS chk_bloques_tipo;
ALTER TABLE public.liquidacion_bloques ADD CONSTRAINT chk_bloques_tipo
  CHECK (tipo IN (
    'pago_sueldos', 'horas_complementarias', 'dia_sanidad',
    'seguridad_social', 'sindicato'
  ));

ALTER TABLE public.liquidacion_bloques DROP CONSTRAINT IF EXISTS chk_bloques_medio_pago;
ALTER TABLE public.liquidacion_bloques ADD CONSTRAINT chk_bloques_medio_pago
  CHECK (medio_pago IS NULL OR medio_pago IN ('caja', 'banco_santander_rio'));

ALTER TABLE public.liquidacion_bloques DROP CONSTRAINT IF EXISTS chk_bloques_total_no_negativo;
ALTER TABLE public.liquidacion_bloques ADD CONSTRAINT chk_bloques_total_no_negativo
  CHECK (total_declarado IS NULL OR total_declarado >= 0);

CREATE INDEX IF NOT EXISTS idx_liquidacion_bloques_liquidacion
  ON public.liquidacion_bloques (liquidacion_id);

CREATE INDEX IF NOT EXISTS idx_liquidacion_bloques_tipo
  ON public.liquidacion_bloques (tipo);

DROP TRIGGER IF EXISTS trg_liquidacion_bloques_updated_at ON public.liquidacion_bloques;
CREATE TRIGGER trg_liquidacion_bloques_updated_at
  BEFORE UPDATE ON public.liquidacion_bloques
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.liquidacion_bloques IS
  'Bloques de la minuta mensual (4 estables + 1 ocasional dia_sanidad).';

-- ===========================================================================
-- 4. TABLA: liquidacion_lineas_empleado
-- ===========================================================================
-- Lineas por empleado dentro de un bloque. Aplica a:
--   - pago_sueldos
--   - horas_complementarias
--   - dia_sanidad

CREATE TABLE IF NOT EXISTS public.liquidacion_lineas_empleado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  bloque_id UUID NOT NULL,
  empleado_id UUID NOT NULL,

  -- Monto neto cargado (dato cierto de la minuta del liquidador)
  monto_neto_cargado NUMERIC(14, 2) NOT NULL,

  -- Monto bruto estimado por reparto proporcional Rem.1 del F.931 (Fase 3-4).
  -- Se completa cuando se carga el F.931 y se ejecuta el calculo.
  bruto_estimado NUMERIC(14, 2),

  -- Origen del concepto en el asiento contable:
  --   recibo:    pago de sueldos / dia sanidad (va a 4.1.1.0X)
  --   facturado: horas complementarias (va a 4.1.1.0X o 4.1.2.02 segun reimputacion)
  --   F931:      contribuciones declaradas
  --   sin_origen: caso por defecto / no clasificable
  origen TEXT NOT NULL DEFAULT 'recibo',

  -- Snapshots del empleado al momento de cargar (el empleado puede cambiar de area
  -- despues, y el asiento contable usa el snapshot historico).
  area_snapshot TEXT,
  cuenta_contable_snapshot TEXT,

  observaciones TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.liquidacion_lineas_empleado DROP CONSTRAINT IF EXISTS fk_lineas_emp_bloque;
ALTER TABLE public.liquidacion_lineas_empleado ADD CONSTRAINT fk_lineas_emp_bloque
  FOREIGN KEY (bloque_id) REFERENCES public.liquidacion_bloques(id) ON DELETE CASCADE;

-- ON DELETE RESTRICT: nunca borrar empleado si tiene lineas (preservar historico).
-- En la practica los empleados se dan de baja (soft delete), nunca se borran.
ALTER TABLE public.liquidacion_lineas_empleado DROP CONSTRAINT IF EXISTS fk_lineas_emp_empleado;
ALTER TABLE public.liquidacion_lineas_empleado ADD CONSTRAINT fk_lineas_emp_empleado
  FOREIGN KEY (empleado_id) REFERENCES public.empleados(id) ON DELETE RESTRICT;

ALTER TABLE public.liquidacion_lineas_empleado DROP CONSTRAINT IF EXISTS uq_lineas_emp_bloque_empleado;
ALTER TABLE public.liquidacion_lineas_empleado ADD CONSTRAINT uq_lineas_emp_bloque_empleado
  UNIQUE (bloque_id, empleado_id);

ALTER TABLE public.liquidacion_lineas_empleado DROP CONSTRAINT IF EXISTS chk_lineas_emp_neto_no_negativo;
ALTER TABLE public.liquidacion_lineas_empleado ADD CONSTRAINT chk_lineas_emp_neto_no_negativo
  CHECK (monto_neto_cargado >= 0);

ALTER TABLE public.liquidacion_lineas_empleado DROP CONSTRAINT IF EXISTS chk_lineas_emp_bruto_no_negativo;
ALTER TABLE public.liquidacion_lineas_empleado ADD CONSTRAINT chk_lineas_emp_bruto_no_negativo
  CHECK (bruto_estimado IS NULL OR bruto_estimado >= 0);

ALTER TABLE public.liquidacion_lineas_empleado DROP CONSTRAINT IF EXISTS chk_lineas_emp_origen;
ALTER TABLE public.liquidacion_lineas_empleado ADD CONSTRAINT chk_lineas_emp_origen
  CHECK (origen IN ('recibo', 'facturado', 'F931', 'sin_origen'));

CREATE INDEX IF NOT EXISTS idx_lineas_empleado_bloque
  ON public.liquidacion_lineas_empleado (bloque_id);

CREATE INDEX IF NOT EXISTS idx_lineas_empleado_empleado
  ON public.liquidacion_lineas_empleado (empleado_id);

DROP TRIGGER IF EXISTS trg_lineas_empleado_updated_at ON public.liquidacion_lineas_empleado;
CREATE TRIGGER trg_lineas_empleado_updated_at
  BEFORE UPDATE ON public.liquidacion_lineas_empleado
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.liquidacion_lineas_empleado IS
  'Lineas de minuta por empleado (pago_sueldos, horas_complementarias, dia_sanidad).';
COMMENT ON COLUMN public.liquidacion_lineas_empleado.bruto_estimado IS
  'Bruto estimado por reparto proporcional Rem.1 del F.931. Se completa en Fase 3-4.';

-- ===========================================================================
-- 5. TABLA: liquidacion_lineas_concepto
-- ===========================================================================
-- Lineas por concepto canonico dentro de un bloque. Aplica a:
--   - seguridad_social: 6 conceptos (APORTE_SS, CONTRIB_SS, APORTE_OS,
--                                     CONTRIB_OS, ART, SCVO)
--   - sindicato:        1 concepto (SINDICATO)

CREATE TABLE IF NOT EXISTS public.liquidacion_lineas_concepto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  bloque_id UUID NOT NULL,

  -- Codigo canonico del concepto (definido en frontend, no en BD)
  --   APORTE_SS, CONTRIB_SS, APORTE_OS, CONTRIB_OS, ART, SCVO, SINDICATO
  concepto_codigo TEXT NOT NULL,

  -- Nombre legible (snapshot de la UI, puede evolucionar)
  concepto_nombre TEXT NOT NULL,

  -- Cuenta contable del concepto (snapshot del plan al momento de cargar)
  cuenta_contable TEXT NOT NULL,

  -- Monto declarado en la minuta
  monto NUMERIC(14, 2) NOT NULL,

  -- Origen del concepto (mismas opciones que lineas empleado)
  origen TEXT NOT NULL DEFAULT 'recibo',

  observaciones TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.liquidacion_lineas_concepto DROP CONSTRAINT IF EXISTS fk_lineas_concepto_bloque;
ALTER TABLE public.liquidacion_lineas_concepto ADD CONSTRAINT fk_lineas_concepto_bloque
  FOREIGN KEY (bloque_id) REFERENCES public.liquidacion_bloques(id) ON DELETE CASCADE;

ALTER TABLE public.liquidacion_lineas_concepto DROP CONSTRAINT IF EXISTS uq_lineas_concepto_bloque_codigo;
ALTER TABLE public.liquidacion_lineas_concepto ADD CONSTRAINT uq_lineas_concepto_bloque_codigo
  UNIQUE (bloque_id, concepto_codigo);

ALTER TABLE public.liquidacion_lineas_concepto DROP CONSTRAINT IF EXISTS chk_lineas_concepto_monto_no_negativo;
ALTER TABLE public.liquidacion_lineas_concepto ADD CONSTRAINT chk_lineas_concepto_monto_no_negativo
  CHECK (monto >= 0);

ALTER TABLE public.liquidacion_lineas_concepto DROP CONSTRAINT IF EXISTS chk_lineas_concepto_origen;
ALTER TABLE public.liquidacion_lineas_concepto ADD CONSTRAINT chk_lineas_concepto_origen
  CHECK (origen IN ('recibo', 'facturado', 'F931', 'sin_origen'));

CREATE INDEX IF NOT EXISTS idx_lineas_concepto_bloque
  ON public.liquidacion_lineas_concepto (bloque_id);

DROP TRIGGER IF EXISTS trg_lineas_concepto_updated_at ON public.liquidacion_lineas_concepto;
CREATE TRIGGER trg_lineas_concepto_updated_at
  BEFORE UPDATE ON public.liquidacion_lineas_concepto
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.liquidacion_lineas_concepto IS
  'Lineas de minuta por concepto canonico (seguridad_social 6 conceptos, sindicato 1).';

-- ===========================================================================
-- 6. TRIGGER DE AUDITORIA: audit_liquidaciones_mes
-- ===========================================================================
-- Escribe en log_auditoria_sueldos los INSERT/UPDATE sobre liquidaciones_mes.
-- Detecta transiciones especiales de estado y las marca con acciones dedicadas
-- (CIERRE_MES, REAPERTURA_MES) para facilitar reportes posteriores.

CREATE OR REPLACE FUNCTION public.audit_liquidaciones_mes()
RETURNS TRIGGER AS $$
DECLARE
  v_accion TEXT;
  v_valor_anterior JSONB;
  v_valor_nuevo JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_accion := 'INSERT_liquidaciones_mes';
    v_valor_anterior := NULL;
    v_valor_nuevo := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    -- Detectar transiciones especiales
    IF OLD.estado IS DISTINCT FROM NEW.estado THEN
      IF NEW.estado = 'CERRADO' THEN
        v_accion := 'CIERRE_MES';
      ELSIF OLD.estado = 'CERRADO' AND NEW.estado <> 'CERRADO' THEN
        v_accion := 'REAPERTURA_MES';
      ELSE
        v_accion := 'UPDATE_liquidaciones_mes';
      END IF;
    ELSE
      v_accion := 'UPDATE_liquidaciones_mes';
    END IF;
    v_valor_anterior := to_jsonb(OLD);
    v_valor_nuevo := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_accion := 'DELETE_liquidaciones_mes';
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
    NULL,    -- usuario_id: en Fase 2 todavia no hay JWT con auth.uid() configurado
    NULL,    -- usuario_nombre_snapshot: idem
    v_accion,
    'liquidaciones_mes',
    COALESCE(NEW.id, OLD.id),
    v_valor_anterior,
    v_valor_nuevo,
    jsonb_build_object('tg_op', TG_OP)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_liquidaciones_mes ON public.liquidaciones_mes;
CREATE TRIGGER trg_audit_liquidaciones_mes
  AFTER INSERT OR UPDATE OR DELETE ON public.liquidaciones_mes
  FOR EACH ROW EXECUTE FUNCTION public.audit_liquidaciones_mes();

-- ===========================================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ===========================================================================
-- Politica permisiva para authenticated (consistente con Fase 1).
-- La granularidad fina por rol (ej. solo Auditor lee/escribe ciertas cosas)
-- se agrega en una migracion posterior cuando se defina el esquema de roles
-- a nivel BD. Hoy el control fino vive en la UI.

ALTER TABLE public.liquidaciones_mes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liquidacion_bloques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liquidacion_lineas_empleado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liquidacion_lineas_concepto ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (idempotencia)
DROP POLICY IF EXISTS pol_liquidaciones_mes_all ON public.liquidaciones_mes;
DROP POLICY IF EXISTS pol_liquidacion_bloques_all ON public.liquidacion_bloques;
DROP POLICY IF EXISTS pol_lineas_empleado_all ON public.liquidacion_lineas_empleado;
DROP POLICY IF EXISTS pol_lineas_concepto_all ON public.liquidacion_lineas_concepto;

-- Crear politicas: cualquier usuario autenticado puede leer/escribir
CREATE POLICY pol_liquidaciones_mes_all ON public.liquidaciones_mes
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY pol_liquidacion_bloques_all ON public.liquidacion_bloques
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY pol_lineas_empleado_all ON public.liquidacion_lineas_empleado
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY pol_lineas_concepto_all ON public.liquidacion_lineas_concepto
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Tambien permitir al rol anon (usado por el cliente Supabase del frontend
-- en este proyecto, que no usa auth.uid() todavia)
DROP POLICY IF EXISTS pol_liquidaciones_mes_anon ON public.liquidaciones_mes;
DROP POLICY IF EXISTS pol_liquidacion_bloques_anon ON public.liquidacion_bloques;
DROP POLICY IF EXISTS pol_lineas_empleado_anon ON public.liquidacion_lineas_empleado;
DROP POLICY IF EXISTS pol_lineas_concepto_anon ON public.liquidacion_lineas_concepto;

CREATE POLICY pol_liquidaciones_mes_anon ON public.liquidaciones_mes
  FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY pol_liquidacion_bloques_anon ON public.liquidacion_bloques
  FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY pol_lineas_empleado_anon ON public.liquidacion_lineas_empleado
  FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY pol_lineas_concepto_anon ON public.liquidacion_lineas_concepto
  FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- ===========================================================================
-- 8. VERIFICACION FINAL
-- ===========================================================================
-- Bloque DO que valida que las 4 tablas y la funcion de auditoria existan
-- antes de hacer COMMIT. Si algo falla, ROLLBACK automatico.

DO $$
DECLARE
  v_tablas_esperadas TEXT[] := ARRAY[
    'liquidaciones_mes',
    'liquidacion_bloques',
    'liquidacion_lineas_empleado',
    'liquidacion_lineas_concepto'
  ];
  v_tabla TEXT;
  v_count INT;
BEGIN
  -- Verificar que existan las 4 tablas
  FOREACH v_tabla IN ARRAY v_tablas_esperadas LOOP
    SELECT count(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = v_tabla;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'Tabla esperada no existe: public.%', v_tabla;
    END IF;
  END LOOP;

  -- Verificar que exista la funcion de auditoria
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'audit_liquidaciones_mes';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Funcion audit_liquidaciones_mes no existe';
  END IF;

  -- Verificar que el trigger de auditoria este conectado
  SELECT count(*) INTO v_count
  FROM pg_trigger
  WHERE tgname = 'trg_audit_liquidaciones_mes' AND NOT tgisinternal;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Trigger trg_audit_liquidaciones_mes no esta conectado';
  END IF;

  RAISE NOTICE 'Migracion Fase 2 aplicada correctamente: 4 tablas, triggers updated_at, trigger auditoria, RLS habilitado.';
END;
$$;

COMMIT;

-- ===========================================================================
-- POST-INSTALACION (no critico, no esta dentro de la transaccion)
-- ===========================================================================
-- Refrescar el cache de PostgREST para que las nuevas tablas sean visibles
-- desde el cliente Supabase inmediatamente, sin esperar el refresh nocturno.

NOTIFY pgrst, 'reload schema';
