-- ============================================================
-- MIGRACIÓN 13: tipo de cambio USD (para uso remoto)
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
-- Tabla singleton (id=1) con el tipo de cambio oficial (BNA). La refresca el
-- daemon on-prem (tipoCambioExtractor.js, fuente DolarAPI/BCRA) y el frontend la
-- lee. Antes el TC venía de /api/nomenclador/tipocambio (backend) -> no andaba
-- desde afuera y rompía las conversiones USD/ARS en varias pantallas.
--
-- El TC no es dato sensible: SELECT para cualquier usuario autenticado.
-- Escribe el daemon con service_role (bypassa RLS).
-- Idempotente.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.tipo_cambio (
  id        smallint PRIMARY KEY DEFAULT 1,
  compra    numeric(18,4) NOT NULL DEFAULT 0,
  venta     numeric(18,4) NOT NULL DEFAULT 0,
  fecha     text,
  fuente    text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tipo_cambio_singleton CHECK (id = 1)
);

COMMENT ON TABLE public.tipo_cambio IS
  'Tipo de cambio USD oficial (singleton). Lo refresca el daemon de sync on-prem (DolarAPI/BCRA). Frontend lee de acá.';

ALTER TABLE public.tipo_cambio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_tipo_cambio_select ON public.tipo_cambio;
CREATE POLICY pol_tipo_cambio_select ON public.tipo_cambio
  FOR SELECT TO authenticated
  USING (true);

COMMIT;
