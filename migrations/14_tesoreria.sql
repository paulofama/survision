-- ============================================================
-- MIGRACIÓN 14: espejo de Tesorería (Caja + Pagos a Proveedores)
-- Sistema de Gestión Integral - Survisión S.A.
-- ============================================================
-- Dos tablas espejo desde GECLISA para que Tesorería ande desde afuera:
--   tesoreria_caja        <- MovValoresEnca (movimientos de caja/valores)
--   tesoreria_proveedores <- MovProv OP(4)/PV(13) (pagos a proveedores)
--
-- El frontend (useTesoreriaCaja/useTesoreriaProveedores) agrega en el cliente
-- (saldo, totales, dashboard, resumen diario). El SALDO de caja es acumulado
-- histórico -> la tabla caja se carga COMPLETA (desde 2018). Los importes se
-- guardan con su signo (Mve_Signo); ingreso/egreso se derivan en el cliente.
--
-- RLS: permiso 'tesoreria'. Escribe el daemon con service_role.
-- Idempotente. Refresh por DELETE de rango de fechas + INSERT.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.tesoreria_caja (
  id               integer PRIMARY KEY,         -- Mve_id
  fecha            date    NOT NULL,
  anio             integer NOT NULL,
  mes              integer NOT NULL,
  tipo_comprobante text,
  tipo_nombre      text,
  letra            text,
  sucursal         integer,
  numero           bigint,
  nombre           text,
  observaciones    text,
  importe          numeric(18,2) NOT NULL DEFAULT 0,  -- Mve_Total (valor absoluto del comprobante)
  signo            integer NOT NULL DEFAULT 1,        -- Mve_Signo (>0 ingreso, <0 egreso)
  usuario          text,
  fecha_alta       timestamptz,
  synced_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tescaja_fecha ON public.tesoreria_caja (fecha);
CREATE INDEX IF NOT EXISTS idx_tescaja_anio_mes ON public.tesoreria_caja (anio, mes);

CREATE TABLE IF NOT EXISTS public.tesoreria_proveedores (
  id               integer PRIMARY KEY,         -- MProv_id
  fecha            date    NOT NULL,
  anio             integer NOT NULL,
  mes              integer NOT NULL,
  tcomp_id         integer,                     -- 4 = OP, 13 = PV
  tipo_comprobante text,
  tipo_nombre      text,
  letra            text,
  sucursal         integer,
  numero           bigint,
  proveedor        text,
  cuit             text,
  observaciones    text,
  importe          numeric(18,2) NOT NULL DEFAULT 0,
  usuario          text,
  fecha_alta       timestamptz,
  synced_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tesprov_fecha ON public.tesoreria_proveedores (fecha);

COMMENT ON TABLE public.tesoreria_caja IS 'Espejo de MovValoresEnca (caja). Lo refresca el daemon on-prem. Frontend lee de acá.';
COMMENT ON TABLE public.tesoreria_proveedores IS 'Espejo de MovProv OP/PV (pagos a proveedores). Lo refresca el daemon on-prem.';

ALTER TABLE public.tesoreria_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tesoreria_proveedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_tesoreria_caja_select ON public.tesoreria_caja;
CREATE POLICY pol_tesoreria_caja_select ON public.tesoreria_caja
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('tesoreria'));

DROP POLICY IF EXISTS pol_tesoreria_prov_select ON public.tesoreria_proveedores;
CREATE POLICY pol_tesoreria_prov_select ON public.tesoreria_proveedores
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('tesoreria'));

COMMIT;
