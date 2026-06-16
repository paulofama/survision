-- ===========================================================================
-- MIGRACION: 07_fiscal_iva.sql
-- ===========================================================================
-- Sistema: SurVision / Sistema Integral de Gestion
-- Cliente: Instituto Dr. Mercado / Survision S.A.
-- Desarrollo: P. Fama
--
-- MODULO FISCAL — Libros de IVA Ventas y Compras + dashboard.
-- Los datos se EXTRAEN de GECLISA (SQL Server local) y se SUBEN a Supabase
-- (script server/scripts/cargar-iva.cjs). El modulo lee de estas tablas; el
-- backend re-sincroniza GECLISA->Supabase (auto/manual).
--
-- Reglas de extraccion (validadas contra los exports de C:\FISCAL\Exportaciones):
--   - VENTAS: MovValoresEnca UNION PFComp, comprobantes FAC/NC/ND, por fecha de
--     comprobante, no anulados. Neto gravado/IVA del detalle por alicuota
--     (MovValoresEnca_IvaPorc + PFComp_IvaPorc); exento = neto_total - gravado.
--   - COMPRAS: MovProv, comprobantes FAC/NC/ND, por FECHA CONTABLE, no anulados.
--     Split gravado/exento del detalle MovProv_Deta (alicuota>0 = gravado).
--   - Importes guardados con SIGNO ya aplicado (NC negativas), para que los
--     totales sean SUM() directo.
--
-- Crea 4 tablas:
--   fiscal_iva_ventas      (1 fila por comprobante de venta)
--   fiscal_iva_compras     (1 fila por comprobante de compra)
--   fiscal_iva_alicuotas   (detalle por alicuota, para totales del dashboard)
--   fiscal_iva_periodos    (control de sync + totales cacheados por periodo)
--
-- RLS: politicas permisivas anon/authenticated (la app usa anon key), igual que
--   el resto del sistema. Trigger updated_at compartido (set_updated_at).
-- ===========================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Funcion updated_at (idempotente; ya existe si se aplicaron las migraciones de Sueldos)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===========================================================================
-- 1. FISCAL_IVA_VENTAS
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.fiscal_iva_ventas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo TEXT NOT NULL,                 -- 'YYYY-MM' (por fecha de comprobante)
  fecha DATE NOT NULL,
  tipo_comprobante TEXT,                 -- FAC / NC / ND
  letra TEXT,
  sucursal INT,
  numero BIGINT,
  razon_social TEXT,
  cuit TEXT,
  condicion_iva TEXT,                    -- RI / CF / M / E / S/D
  neto_gravado NUMERIC(16,2) NOT NULL DEFAULT 0,
  iva NUMERIC(16,2) NOT NULL DEFAULT 0,
  exento NUMERIC(16,2) NOT NULL DEFAULT 0,
  perc_ib NUMERIC(16,2) NOT NULL DEFAULT 0,
  otros NUMERIC(16,2) NOT NULL DEFAULT 0,
  total NUMERIC(16,2) NOT NULL DEFAULT 0,
  signo SMALLINT NOT NULL DEFAULT 1,
  fuente TEXT NOT NULL,                  -- MVE / PFCOMP
  origen_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_iva_ventas DROP CONSTRAINT IF EXISTS uq_iva_ventas_origen;
ALTER TABLE public.fiscal_iva_ventas ADD CONSTRAINT uq_iva_ventas_origen UNIQUE (fuente, origen_id);

CREATE INDEX IF NOT EXISTS idx_iva_ventas_periodo ON public.fiscal_iva_ventas (periodo);
CREATE INDEX IF NOT EXISTS idx_iva_ventas_fecha ON public.fiscal_iva_ventas (fecha);
CREATE INDEX IF NOT EXISTS idx_iva_ventas_cuit ON public.fiscal_iva_ventas (cuit);

DROP TRIGGER IF EXISTS trg_iva_ventas_updated_at ON public.fiscal_iva_ventas;
CREATE TRIGGER trg_iva_ventas_updated_at BEFORE UPDATE ON public.fiscal_iva_ventas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- 2. FISCAL_IVA_COMPRAS
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.fiscal_iva_compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo TEXT NOT NULL,                 -- 'YYYY-MM' (por FECHA CONTABLE)
  fecha DATE,                            -- fecha del comprobante
  fecha_contable DATE NOT NULL,
  tipo_comprobante TEXT,                 -- FAC / NC / ND
  letra TEXT,
  sucursal INT,
  numero BIGINT,
  proveedor TEXT,
  cuit TEXT,
  condicion_iva TEXT,
  neto_gravado NUMERIC(16,2) NOT NULL DEFAULT 0,
  iva NUMERIC(16,2) NOT NULL DEFAULT 0,
  exento NUMERIC(16,2) NOT NULL DEFAULT 0,
  perc_iva NUMERIC(16,2) NOT NULL DEFAULT 0,
  perc_ib NUMERIC(16,2) NOT NULL DEFAULT 0,
  imp_internos NUMERIC(16,2) NOT NULL DEFAULT 0,
  otros NUMERIC(16,2) NOT NULL DEFAULT 0,
  total NUMERIC(16,2) NOT NULL DEFAULT 0,
  signo SMALLINT NOT NULL DEFAULT 1,
  origen_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_iva_compras DROP CONSTRAINT IF EXISTS uq_iva_compras_origen;
ALTER TABLE public.fiscal_iva_compras ADD CONSTRAINT uq_iva_compras_origen UNIQUE (origen_id);

CREATE INDEX IF NOT EXISTS idx_iva_compras_periodo ON public.fiscal_iva_compras (periodo);
CREATE INDEX IF NOT EXISTS idx_iva_compras_fecha ON public.fiscal_iva_compras (fecha_contable);
CREATE INDEX IF NOT EXISTS idx_iva_compras_cuit ON public.fiscal_iva_compras (cuit);

DROP TRIGGER IF EXISTS trg_iva_compras_updated_at ON public.fiscal_iva_compras;
CREATE TRIGGER trg_iva_compras_updated_at BEFORE UPDATE ON public.fiscal_iva_compras
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- 3. FISCAL_IVA_ALICUOTAS  (detalle por alicuota, para totales del dashboard)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.fiscal_iva_alicuotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,                    -- 'venta' / 'compra'
  periodo TEXT NOT NULL,
  fuente TEXT,                           -- MVE / PFCOMP / MOVPROV
  comprobante_origen_id BIGINT,
  alicuota NUMERIC(5,2) NOT NULL DEFAULT 0,  -- 0 / 10.5 / 21 / 27
  neto NUMERIC(16,2) NOT NULL DEFAULT 0,
  iva NUMERIC(16,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_iva_alicuotas DROP CONSTRAINT IF EXISTS chk_iva_alic_tipo;
ALTER TABLE public.fiscal_iva_alicuotas ADD CONSTRAINT chk_iva_alic_tipo CHECK (tipo IN ('venta', 'compra'));

CREATE INDEX IF NOT EXISTS idx_iva_alic_periodo ON public.fiscal_iva_alicuotas (tipo, periodo, alicuota);

-- ===========================================================================
-- 4. FISCAL_IVA_PERIODOS  (control de sync + totales cacheados)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.fiscal_iva_periodos (
  periodo TEXT PRIMARY KEY,              -- 'YYYY-MM'
  ventas_filas INT NOT NULL DEFAULT 0,
  ventas_neto_gravado NUMERIC(16,2) NOT NULL DEFAULT 0,
  ventas_iva NUMERIC(16,2) NOT NULL DEFAULT 0,
  ventas_exento NUMERIC(16,2) NOT NULL DEFAULT 0,
  ventas_total NUMERIC(16,2) NOT NULL DEFAULT 0,
  compras_filas INT NOT NULL DEFAULT 0,
  compras_neto_gravado NUMERIC(16,2) NOT NULL DEFAULT 0,
  compras_iva NUMERIC(16,2) NOT NULL DEFAULT 0,
  compras_exento NUMERIC(16,2) NOT NULL DEFAULT 0,
  compras_total NUMERIC(16,2) NOT NULL DEFAULT 0,
  posicion_iva NUMERIC(16,2) NOT NULL DEFAULT 0,  -- debito (ventas_iva) - credito (compras_iva)
  ultima_sync TIMESTAMPTZ,
  estado TEXT NOT NULL DEFAULT 'ok',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_iva_periodos_updated_at ON public.fiscal_iva_periodos;
CREATE TRIGGER trg_iva_periodos_updated_at BEFORE UPDATE ON public.fiscal_iva_periodos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- 5. RLS (permisivo anon/authenticated, consistente con el resto del sistema)
-- ===========================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fiscal_iva_ventas','fiscal_iva_compras','fiscal_iva_alicuotas','fiscal_iva_periodos']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%s_anon ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%s_auth ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY pol_%s_anon ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true);', t, t);
    EXECUTE format('CREATE POLICY pol_%s_auth ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', t, t);
  END LOOP;
END;
$$;

-- ===========================================================================
-- 6. VERIFICACION FINAL
-- ===========================================================================

DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN
    ('fiscal_iva_ventas','fiscal_iva_compras','fiscal_iva_alicuotas','fiscal_iva_periodos');
  IF v_count <> 4 THEN RAISE EXCEPTION 'Esperaba 4 tablas fiscal_iva_*, encontre %', v_count; END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename LIKE 'fiscal_iva_%';
  IF v_count < 8 THEN RAISE EXCEPTION 'Esperaba >=8 politicas RLS, encontre %', v_count; END IF;

  RAISE NOTICE 'Migracion 07 (Modulo Fiscal IVA) aplicada OK: 4 tablas + RLS + triggers.';
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
