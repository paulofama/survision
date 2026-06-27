-- ============================================================
-- MIGRACIÓN 12: espejo de movimientos crudos (GECLISA -> Supabase)
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
-- Tabla espejo de las atenciones (Me_Area='A') al grano más fino:
-- atención × práctica × prestador. Desnormalizada (trae nombres de paciente,
-- OS, práctica, prestador, derivador) para que el frontend remoto filtre y
-- agregue sin pegarle a GECLISA. Reemplaza al explorador de Análisis
-- (useMovimientosPrestaciones: listado + stats-periodo + por-*).
--
-- El MONTO (coseguro/cobertura) vive a nivel ATENCIÓN y se repite en cada fila
-- de la atención. Para no inflar al sumar:
--   - Vistas a nivel atención (totales, por OS): agrupar por atencion_id.
--   - Listado (1 fila por atención): filtrar es_principal = true.
--   - Por prestador (prorrateo): sobre (atencion_id, pre_id) distintos, sumar
--     monto / cant_prestadores.
--   - Por práctica / grupo: grano práctica (la lógica original suma el monto de
--     la atención por cada práctica).
--
-- es_principal: marca la 1ª práctica + 1er prestador de cada atención (lo que
--               muestra el listado).
-- cant_prestadores: cantidad de prestadores DISTINTOS de la atención (prorrateo).
--
-- Solo agregados/atenciones con nombre de paciente (PII) -> RLS: permiso 'analisis'.
-- El daemon escribe con service_role (bypassa RLS).
--
-- Idempotente. Carga/refresh por DELETE de rango de fechas + INSERT.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.movimientos_geclisa (
  atencion_id      integer NOT NULL,
  mp_id            integer NOT NULL DEFAULT 0,   -- 0 = atención sin práctica
  pre_id           integer NOT NULL DEFAULT 0,   -- 0 = sin prestador
  fecha            date    NOT NULL,
  anio             integer NOT NULL,
  mes              integer NOT NULL,
  dia              integer NOT NULL,
  hora             integer,
  paciente         text,
  edad             integer,
  diagnostico      text,
  estado           text,
  usuario_alta     text,
  os_id            integer,
  os_sigla         text,
  os_nombre        text,
  practica_codigo  text,
  practica_nombre  text,
  grupo_id         integer,
  grupo_nombre     text,
  prestador_nombre text,
  derivador_id     integer,
  derivador        text,
  coseguro         numeric(18,2) NOT NULL DEFAULT 0,
  cobertura        numeric(18,2) NOT NULL DEFAULT 0,
  total            numeric(18,2) NOT NULL DEFAULT 0,
  cant_prestadores integer NOT NULL DEFAULT 0,
  es_principal     boolean NOT NULL DEFAULT false,
  synced_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (atencion_id, mp_id, pre_id)
);

COMMENT ON TABLE public.movimientos_geclisa IS
  'Espejo de atenciones GECLISA (grano atención×práctica×prestador). Lo refresca el daemon de sync on-prem. Frontend remoto (explorador de Análisis) lee de acá.';

-- Índices para los filtros/agregaciones del explorador
CREATE INDEX IF NOT EXISTS idx_movgec_anio_mes ON public.movimientos_geclisa (anio, mes);
CREATE INDEX IF NOT EXISTS idx_movgec_fecha    ON public.movimientos_geclisa (fecha);
CREATE INDEX IF NOT EXISTS idx_movgec_os       ON public.movimientos_geclisa (os_id);
CREATE INDEX IF NOT EXISTS idx_movgec_pre      ON public.movimientos_geclisa (pre_id);
CREATE INDEX IF NOT EXISTS idx_movgec_grupo    ON public.movimientos_geclisa (grupo_id);
CREATE INDEX IF NOT EXISTS idx_movgec_principal ON public.movimientos_geclisa (es_principal) WHERE es_principal;

ALTER TABLE public.movimientos_geclisa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_movimientos_geclisa_select ON public.movimientos_geclisa;
CREATE POLICY pol_movimientos_geclisa_select ON public.movimientos_geclisa
  FOR SELECT TO authenticated
  USING (public.app_tiene_permiso('analisis'));

COMMIT;
