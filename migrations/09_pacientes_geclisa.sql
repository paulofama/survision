-- ============================================================
-- MIGRACIÓN 09 — Tabla espejo del maestro de pacientes de GECLISA
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
--
-- Copia (sincronizada) del maestro de pacientes de GECLISA (tabla Ficha +
-- su obra social ya resuelta), para que el Presupuestador busque por DNI
-- desde Supabase (frontend remoto) en vez de pegarle a GECLISA en vivo.
--
-- La poblar/actualiza el extractor on-prem (server/services/pacientesExtractor.js):
-- corre la misma query/lógica que el viejo /api/pacientes/buscar-dni pero para
-- TODOS los pacientes, y guarda el resultado plano acá. El frontend solo
-- consulta por `documento`.
--
-- Una fila por Ficha (ficha_id PK). Puede haber varias fichas con el mismo
-- documento → el frontend toma la de mayor ficha_id.
--
-- RLS: gateada por permiso 'presupuestador' (datos de pacientes = PII).
-- Idempotente. Atómica.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.pacientes_geclisa (
  ficha_id            integer PRIMARY KEY,
  documento           text NOT NULL,
  apellido            text,
  nombre              text,
  telefono            text,
  fecha_nacimiento    date,
  email               text,
  obra_social         text,
  obra_social_sigla   text,
  numero_afiliado     text,
  plan_nombre         text,
  es_particular       boolean DEFAULT true,
  synced_at           timestamptz DEFAULT now()
);

-- Búsqueda por documento (la usa el Presupuestador).
CREATE INDEX IF NOT EXISTS ix_pacientes_geclisa_documento
  ON public.pacientes_geclisa (documento);

-- ------------------------------------------------------------
-- RLS: solo usuarios con permiso 'presupuestador' (o admin).
-- El extractor escribe con service_role (bypassa RLS).
-- ------------------------------------------------------------
ALTER TABLE public.pacientes_geclisa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_pacientes_geclisa_presupuestador ON public.pacientes_geclisa;
CREATE POLICY pol_pacientes_geclisa_presupuestador ON public.pacientes_geclisa
  FOR ALL TO authenticated
  USING (public.app_tiene_permiso('presupuestador'))
  WITH CHECK (public.app_tiene_permiso('presupuestador'));

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='pacientes_geclisa'
  ) THEN
    RAISE EXCEPTION 'FALLO: no se creó pacientes_geclisa';
  END IF;
  RAISE NOTICE 'OK 09: tabla pacientes_geclisa creada (RLS por permiso presupuestador).';
END $$;

COMMIT;
