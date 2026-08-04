-- ============================================================
-- MIGRACIÓN 17: espejo de erogaciones (costos fijos) GECLISA -> Supabase
-- Sistema de Gestión Integral - Survisión S.A.
-- ============================================================
-- Espeja las erogaciones crudas (3 fuentes unificadas: MovProv pagos, egresos de
-- caja MovValoresEnca, liquidaciones LiqComp) para que el módulo de Costos Fijos
-- ande desde afuera. El usuario clasifica cada una (fijo/variable) en la tabla
-- existente erogaciones_clasificacion (cruce por fuente + id_geclisa).
--
-- RLS: permiso 'analisis' (igual que la ruta /api/erogaciones). Escribe el daemon.
-- Idempotente. PK (fuente, id_geclisa). ~5.4k filas (2024+): full refresh.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.erogaciones_geclisa (
  fuente             text    NOT NULL,        -- MovProv | MovValoresEnca | LiqComp
  id_geclisa         integer NOT NULL,
  fecha              date    NOT NULL,
  anio               integer NOT NULL,
  mes                integer NOT NULL,
  proveedor_nombre   text,
  descripcion        text,
  monto              numeric(18,2) NOT NULL DEFAULT 0,
  categoria_sugerida text,
  tipo_comprobante   text,
  numero_comprobante text,
  synced_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fuente, id_geclisa)
);

CREATE INDEX IF NOT EXISTS idx_erogec_anio_mes ON public.erogaciones_geclisa (anio, mes);

COMMENT ON TABLE public.erogaciones_geclisa IS
  'Espejo de erogaciones crudas (MovProv/MovValoresEnca/LiqComp) para Costos Fijos. Lo refresca el daemon on-prem.';

ALTER TABLE public.erogaciones_geclisa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_erogaciones_geclisa_select ON public.erogaciones_geclisa;
CREATE POLICY pol_erogaciones_geclisa_select ON public.erogaciones_geclisa
  FOR SELECT TO authenticated
  USING (public.app_tiene_permiso('analisis'));

COMMIT;
