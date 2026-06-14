-- ===========================================================================
-- MIGRACION: 05_sueldos_fase4_asientos.sql
-- ===========================================================================
-- Sistema: SurVision / Sistema Integral de Gestion
-- Cliente: Instituto Dr. Mercado / Survision S.A.
-- Desarrollo: P. Fama
--
-- FASE 4 del modulo Sueldos: PROPUESTA DE ASIENTO de devengamiento de sueldos
-- (borrador para contabilidad), generada a partir de la minuta (Fase 2) + el
-- F.931 confirmado (Fase 3).
--
-- Crea 2 tablas:
--   - asientos_sueldos:        cabecera, 1 fila por liquidacion (UNIQUE).
--                              guarda metadata del calculo (criterio de bruto,
--                              Rem.1 usado, totales Debe/Haber, monto de ajuste).
--   - asiento_sueldos_lineas:  N lineas del asiento (Debe/Haber). Cada linea
--                              pertenece a una seccion ('recibo' o 'facturado',
--                              los dos pares de columnas del reporte) y puede
--                              marcarse como estimada (bruto por reparto) o
--                              ajuste (linea de cuadre de la brecha Rem.1).
--
-- METODOLOGIA (decidida con Paulo, ver 00/SUELDOS_ESTADO_Y_CONTINUIDAD.md):
--   - Bruto al Debe (no neto). Bruto total = Rem.1 del F.931, repartido entre
--     empleados segun el peso de su neto sobre el total de netos.
--   - La brecha [Rem.1 - (neto + aporte_301 + aporte_302 + sindicato)] se
--     imputa a una LINEA DE AJUSTE en el Haber ("Otras retenciones a pagar /
--     a determinar"), que Paulo resuelve en el sistema contable real. Asi el
--     asiento CUADRA por construccion.
--   - El bruto estimado por empleado se persiste tambien en
--     liquidacion_lineas_empleado.bruto_estimado (lo hace el generador, no esta
--     migracion).
--
-- Tambien:
--   - Trigger updated_at en ambas tablas (funcion compartida set_updated_at).
--   - Trigger de auditoria en asientos_sueldos (INSERT/UPDATE/DELETE/GENERADO).
--   - Politicas RLS para anon y authenticated en ambas tablas.
--
-- DEPENDE DE:
--   - Migraciones Fase 1, 2 y 3 aplicadas (liquidaciones_mes, f931_declaraciones,
--     liquidacion_lineas_empleado, log_auditoria_sueldos, set_updated_at).
--   - extension pgcrypto habilitada.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. EXTENSIONES NECESARIAS
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===========================================================================
-- 1. TABLA: asientos_sueldos (cabecera)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.asientos_sueldos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Una propuesta de asiento por liquidacion (mes)
  liquidacion_id UUID NOT NULL,

  -- Periodo denormalizado (comodidad para reportes/joins)
  anio INT NOT NULL,
  mes INT NOT NULL,

  -- F.931 usado como fuente (Rem.1 + aportes/contribuciones)
  f931_declaracion_id UUID,

  -- Criterio de calculo del bruto
  --   REM1_AJUSTE:    bruto total = Rem.1, brecha a linea de ajuste (default)
  --   RECONCILIABLE:  bruto total = neto + aporte_301 + aporte_302 + sindicato
  criterio_bruto TEXT NOT NULL DEFAULT 'REM1_AJUSTE',

  -- Metadata del calculo
  rem_1_usado NUMERIC(14, 2),            -- Rem.1 del F.931 al momento de generar
  total_neto NUMERIC(14, 2),            -- suma de netos de pago_sueldos
  bruto_total NUMERIC(14, 2),           -- total repartido como bruto al Debe
  monto_ajuste NUMERIC(14, 2),          -- linea de cuadre (signo: + si va al Haber)

  -- Totales del asiento (deben cuadrar)
  total_debe NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_haber NUMERIC(14, 2) NOT NULL DEFAULT 0,

  -- Metadata de generacion
  generado_at TIMESTAMPTZ,
  generado_por_nombre TEXT,

  observaciones TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una sola propuesta de asiento por liquidacion
ALTER TABLE public.asientos_sueldos DROP CONSTRAINT IF EXISTS uq_asiento_liquidacion;
ALTER TABLE public.asientos_sueldos ADD CONSTRAINT uq_asiento_liquidacion
  UNIQUE (liquidacion_id);

ALTER TABLE public.asientos_sueldos DROP CONSTRAINT IF EXISTS fk_asiento_liquidacion;
ALTER TABLE public.asientos_sueldos ADD CONSTRAINT fk_asiento_liquidacion
  FOREIGN KEY (liquidacion_id) REFERENCES public.liquidaciones_mes(id) ON DELETE CASCADE;

ALTER TABLE public.asientos_sueldos DROP CONSTRAINT IF EXISTS fk_asiento_f931;
ALTER TABLE public.asientos_sueldos ADD CONSTRAINT fk_asiento_f931
  FOREIGN KEY (f931_declaracion_id) REFERENCES public.f931_declaraciones(id) ON DELETE SET NULL;

ALTER TABLE public.asientos_sueldos DROP CONSTRAINT IF EXISTS chk_asiento_anio;
ALTER TABLE public.asientos_sueldos ADD CONSTRAINT chk_asiento_anio
  CHECK (anio BETWEEN 2020 AND 2050);

ALTER TABLE public.asientos_sueldos DROP CONSTRAINT IF EXISTS chk_asiento_mes;
ALTER TABLE public.asientos_sueldos ADD CONSTRAINT chk_asiento_mes
  CHECK (mes BETWEEN 1 AND 12);

ALTER TABLE public.asientos_sueldos DROP CONSTRAINT IF EXISTS chk_asiento_criterio;
ALTER TABLE public.asientos_sueldos ADD CONSTRAINT chk_asiento_criterio
  CHECK (criterio_bruto IN ('REM1_AJUSTE', 'RECONCILIABLE'));

CREATE INDEX IF NOT EXISTS idx_asiento_liquidacion
  ON public.asientos_sueldos (liquidacion_id);

CREATE INDEX IF NOT EXISTS idx_asiento_periodo
  ON public.asientos_sueldos (anio DESC, mes DESC);

DROP TRIGGER IF EXISTS trg_asientos_sueldos_updated_at ON public.asientos_sueldos;
CREATE TRIGGER trg_asientos_sueldos_updated_at
  BEFORE UPDATE ON public.asientos_sueldos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.asientos_sueldos IS
  'Cabecera de la propuesta de asiento de devengamiento (borrador para contabilidad). 1 por liquidacion.';
COMMENT ON COLUMN public.asientos_sueldos.criterio_bruto IS
  'REM1_AJUSTE (bruto=Rem.1, brecha a linea de ajuste) o RECONCILIABLE (bruto=neto+aportes+sindicato).';
COMMENT ON COLUMN public.asientos_sueldos.monto_ajuste IS
  'Brecha Rem.1 - (neto+aporte_301+aporte_302+sindicato). Imputada a la linea de ajuste del Haber.';

-- ===========================================================================
-- 2. TABLA: asiento_sueldos_lineas (detalle)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.asiento_sueldos_lineas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  asiento_id UUID NOT NULL,

  -- Orden de despliegue en el reporte
  orden INT NOT NULL DEFAULT 0,

  -- Seccion del asiento (los dos pares de columnas del reporte):
  --   recibo:    devengamiento de sueldos del recibo (bruto, cargas, netos)
  --   facturado: horas complementarias facturadas (Paulo reimputa luego)
  seccion TEXT NOT NULL DEFAULT 'recibo',

  -- Cuenta contable (snapshot). NULL permitido para la linea de ajuste.
  cuenta_codigo TEXT,
  cuenta_nombre TEXT,

  -- Descripcion legible de la linea
  detalle TEXT,

  -- Importes (una linea normalmente tiene Debe XOR Haber)
  debe NUMERIC(14, 2) NOT NULL DEFAULT 0,
  haber NUMERIC(14, 2) NOT NULL DEFAULT 0,

  -- Marcas para el reporte
  es_ajuste BOOLEAN NOT NULL DEFAULT false,     -- linea de cuadre de la brecha Rem.1
  es_estimado BOOLEAN NOT NULL DEFAULT false,   -- monto por reparto proporcional (asterisco)

  -- Trazabilidad opcional (lineas agregadas por area no llevan empleado)
  empleado_id UUID,
  area TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.asiento_sueldos_lineas DROP CONSTRAINT IF EXISTS fk_asiento_lineas_asiento;
ALTER TABLE public.asiento_sueldos_lineas ADD CONSTRAINT fk_asiento_lineas_asiento
  FOREIGN KEY (asiento_id) REFERENCES public.asientos_sueldos(id) ON DELETE CASCADE;

ALTER TABLE public.asiento_sueldos_lineas DROP CONSTRAINT IF EXISTS fk_asiento_lineas_empleado;
ALTER TABLE public.asiento_sueldos_lineas ADD CONSTRAINT fk_asiento_lineas_empleado
  FOREIGN KEY (empleado_id) REFERENCES public.empleados(id) ON DELETE SET NULL;

ALTER TABLE public.asiento_sueldos_lineas DROP CONSTRAINT IF EXISTS chk_asiento_lineas_seccion;
ALTER TABLE public.asiento_sueldos_lineas ADD CONSTRAINT chk_asiento_lineas_seccion
  CHECK (seccion IN ('recibo', 'facturado'));

ALTER TABLE public.asiento_sueldos_lineas DROP CONSTRAINT IF EXISTS chk_asiento_lineas_importes;
ALTER TABLE public.asiento_sueldos_lineas ADD CONSTRAINT chk_asiento_lineas_importes
  CHECK (debe >= 0 AND haber >= 0);

CREATE INDEX IF NOT EXISTS idx_asiento_lineas_asiento
  ON public.asiento_sueldos_lineas (asiento_id, orden);

DROP TRIGGER IF EXISTS trg_asiento_sueldos_lineas_updated_at ON public.asiento_sueldos_lineas;
CREATE TRIGGER trg_asiento_sueldos_lineas_updated_at
  BEFORE UPDATE ON public.asiento_sueldos_lineas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.asiento_sueldos_lineas IS
  'Lineas Debe/Haber de la propuesta de asiento. Secciones recibo/facturado.';
COMMENT ON COLUMN public.asiento_sueldos_lineas.es_estimado IS
  'true si el monto proviene del reparto proporcional Rem.1 (se marca con asterisco en reportes).';

-- ===========================================================================
-- 3. TRIGGER DE AUDITORIA: audit_asientos_sueldos
-- ===========================================================================
-- Escribe en log_auditoria_sueldos los cambios sobre asientos_sueldos.
-- Un INSERT representa la generacion de la propuesta => accion GENERADO_ASIENTO.

CREATE OR REPLACE FUNCTION public.audit_asientos_sueldos()
RETURNS TRIGGER AS $$
DECLARE
  v_accion TEXT;
  v_valor_anterior JSONB;
  v_valor_nuevo JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_accion := 'GENERADO_ASIENTO';
    v_valor_anterior := NULL;
    v_valor_nuevo := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_accion := 'UPDATE_asientos_sueldos';
    v_valor_anterior := to_jsonb(OLD);
    v_valor_nuevo := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_accion := 'DELETE_asientos_sueldos';
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
    COALESCE(NEW.generado_por_nombre, OLD.generado_por_nombre),
    v_accion,
    'asientos_sueldos',
    COALESCE(NEW.id, OLD.id),
    v_valor_anterior,
    v_valor_nuevo,
    jsonb_build_object('tg_op', TG_OP)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_asientos_sueldos ON public.asientos_sueldos;
CREATE TRIGGER trg_audit_asientos_sueldos
  AFTER INSERT OR UPDATE OR DELETE ON public.asientos_sueldos
  FOR EACH ROW EXECUTE FUNCTION public.audit_asientos_sueldos();

-- ===========================================================================
-- 4. RLS DE LAS TABLAS
-- ===========================================================================

ALTER TABLE public.asientos_sueldos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asiento_sueldos_lineas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_asientos_sueldos_all ON public.asientos_sueldos;
DROP POLICY IF EXISTS pol_asientos_sueldos_anon ON public.asientos_sueldos;
DROP POLICY IF EXISTS pol_asiento_lineas_all ON public.asiento_sueldos_lineas;
DROP POLICY IF EXISTS pol_asiento_lineas_anon ON public.asiento_sueldos_lineas;

CREATE POLICY pol_asientos_sueldos_all ON public.asientos_sueldos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pol_asientos_sueldos_anon ON public.asientos_sueldos
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY pol_asiento_lineas_all ON public.asiento_sueldos_lineas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pol_asiento_lineas_anon ON public.asiento_sueldos_lineas
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ===========================================================================
-- 5. VERIFICACION FINAL
-- ===========================================================================

DO $$
DECLARE
  v_tablas_esperadas TEXT[] := ARRAY[
    'asientos_sueldos',
    'asiento_sueldos_lineas'
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
  WHERE n.nspname = 'public' AND p.proname = 'audit_asientos_sueldos';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Funcion audit_asientos_sueldos no existe';
  END IF;

  -- Trigger
  SELECT count(*) INTO v_count
  FROM pg_trigger
  WHERE tgname = 'trg_audit_asientos_sueldos' AND NOT tgisinternal;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Trigger trg_audit_asientos_sueldos no esta conectado';
  END IF;

  -- Politicas RLS
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('asientos_sueldos', 'asiento_sueldos_lineas');
  IF v_count < 4 THEN
    RAISE EXCEPTION 'Esperaba >=4 politicas RLS, encontre %', v_count;
  END IF;

  RAISE NOTICE 'Migracion Fase 4 aplicada correctamente: 2 tablas (asientos_sueldos, asiento_sueldos_lineas), trigger auditoria, RLS habilitado.';
END;
$$;

COMMIT;

-- Refresh PostgREST cache
NOTIFY pgrst, 'reload schema';
